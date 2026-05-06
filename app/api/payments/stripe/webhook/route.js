import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request) {
  const body = await request.text();
  const sig  = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    console.error('[stripe/webhook] signature error', e.message);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session      = event.data.object;
        const customerKey  = session.client_reference_id || session.metadata?.customerKey;
        const planId       = session.metadata?.plan || 'monthly';
        const email        = session.metadata?.email || null;
        const stripeSubId  = session.subscription;
        if (!customerKey || !stripeSubId) break;

        const sub = await stripe.subscriptions.retrieve(stripeSubId);
        const status        = sub.status;                          // 'trialing' | 'active'
        const trialEnd      = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        const periodEnd     = new Date(sub.current_period_end * 1000).toISOString();

        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('customer_key', customerKey)
          .maybeSingle();

        const payload = {
          customer_key:   customerKey,
          plan:           planId,
          status:         status === 'trialing' ? 'trialing' : 'active',
          billing_key:    stripeSubId,
          trial_end_at:   trialEnd,
          next_charge_at: periodEnd,
          updated_at:     new Date().toISOString(),
          ...(email ? { email } : {}),
        };

        const { error } = existing
          ? await supabase.from('subscriptions').update(payload).eq('customer_key', customerKey)
          : await supabase.from('subscriptions').insert(payload);

        if (error) console.error('[stripe/webhook] db error on checkout.session.completed', error);
        break;
      }

      case 'customer.subscription.updated': {
        const sub         = event.data.object;
        const customerKey = sub.metadata?.customerKey;
        if (!customerKey) break;

        const status    = sub.status;
        const trialEnd  = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        const cancelled = sub.cancel_at_period_end;

        await supabase.from('subscriptions').update({
          status:         cancelled ? 'cancelled' : status === 'trialing' ? 'trialing' : 'active',
          trial_end_at:   trialEnd,
          next_charge_at: periodEnd,
          updated_at:     new Date().toISOString(),
        }).eq('customer_key', customerKey);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub         = event.data.object;
        const customerKey = sub.metadata?.customerKey;
        if (!customerKey) break;

        await supabase.from('subscriptions').update({
          status:     'cancelled',
          updated_at: new Date().toISOString(),
        }).eq('customer_key', customerKey);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice     = event.data.object;
        const stripeSubId = invoice.subscription;
        if (!stripeSubId) break;

        const { data } = await supabase
          .from('subscriptions')
          .select('customer_key')
          .eq('billing_key', stripeSubId)
          .maybeSingle();

        if (data?.customer_key) {
          await supabase.from('subscriptions').update({
            status:     'past_due',
            updated_at: new Date().toISOString(),
          }).eq('customer_key', data.customer_key);
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error('[stripe/webhook] handler error', e);
  }

  return NextResponse.json({ received: true });
}
