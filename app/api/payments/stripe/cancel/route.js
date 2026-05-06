import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/payments/stripe/cancel?customerKey=...
 * 구독을 기간 종료 후 취소 (cancel_at_period_end: true)
 */
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const customerKey = searchParams.get('customerKey');

  if (!customerKey) {
    return NextResponse.json({ error: 'missing_customer_key' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('billing_key')
    .eq('customer_key', customerKey)
    .maybeSingle();

  if (error || !data?.billing_key) {
    return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 });
  }

  try {
    await stripe.subscriptions.update(data.billing_key, { cancel_at_period_end: true });

    await supabase.from('subscriptions').update({
      status:     'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('customer_key', customerKey);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[stripe/cancel]', e);
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 });
  }
}
