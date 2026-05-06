import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  monthly: { priceEnv: 'STRIPE_PRICE_MONTHLY', trialDays: 0 },
  annual:  { priceEnv: 'STRIPE_PRICE_ANNUAL',  trialDays: 7 },
};

/**
 * POST /api/payments/stripe/checkout
 * Body: { customerKey, plan, email? }
 * Returns: { url } — Stripe Checkout 페이지 URL
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { customerKey, plan: planId = 'monthly', email: bodyEmail } = body;

    if (!customerKey) {
      return NextResponse.json({ error: 'missing_customer_key' }, { status: 400 });
    }

    const plan = PLANS[planId] || PLANS.monthly;
    const priceId = process.env[plan.priceEnv];
    if (!priceId) {
      return NextResponse.json({ error: 'price_not_configured' }, { status: 500 });
    }

    // 노션 세션에서 이메일 우선 추출
    const session = await getNotionSessionFromCookie(request);
    const email = session?.email || bodyEmail || undefined;

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://timerapp.nock.kr';

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(plan.trialDays > 0 ? {
        subscription_data: { trial_period_days: plan.trialDays },
      } : {}),
      client_reference_id: customerKey,
      ...(email ? { customer_email: email } : {}),
      metadata: { customerKey, plan: planId, email: email || '' },
      success_url: `${origin}/billing-result?status=success`,
      cancel_url: `${origin}/billing-result?status=fail&reason=user_cancel`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error('[stripe/checkout]', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
