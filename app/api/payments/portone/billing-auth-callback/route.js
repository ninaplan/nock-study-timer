import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET;

const PLANS = {
  monthly: { amount: 4900,  months: 1,  trial: false },
  annual:  { amount: 33000, months: 12, trial: true  },
};

/**
 * GET /api/payments/portone/billing-auth-callback
 * 모바일 리다이렉트 모드에서 포트원이 돌아오는 엔드포인트.
 * Query: billingKey, plan, customerKey, email?, code?(오류시)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const base = new URL(request.url).origin;

  const billingKey  = searchParams.get('billingKey');
  const code        = searchParams.get('code');        // 오류 코드
  const customerKey = searchParams.get('customerKey');
  const planId      = searchParams.get('plan') || 'monthly';
  const emailParam  = searchParams.get('email') || null;

  // 사용자 취소 또는 오류
  if (code || !billingKey) {
    const reason = code === 'PORTONE_USER_CANCELLED' ? 'user_cancel' : (code || 'issue_failed');
    return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${reason}`, base));
  }

  if (!customerKey) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=missing_params', base));
  }

  const plan     = PLANS[planId] || PLANS.monthly;
  const supabase = getSupabaseAdmin();
  const session  = await getNotionSessionFromCookie(request);
  const email    = session?.email || emailParam || null;
  const now      = new Date();

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, status, plan, trial_end_at')
    .eq('customer_key', customerKey)
    .maybeSingle();

  const isActive =
    existing?.status === 'active' ||
    (existing?.status === 'trialing' && new Date(existing.trial_end_at) > now);

  if (isActive && existing?.plan === planId) {
    return NextResponse.redirect(new URL('/billing-result?status=success', base));
  }

  if (plan.trial && !isActive) {
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 7);

    const payload = {
      customer_key:   customerKey,
      plan:           planId,
      status:         'trialing',
      billing_key:    billingKey,
      trial_end_at:   trialEnd.toISOString(),
      next_charge_at: trialEnd.toISOString(),
      updated_at:     now.toISOString(),
      ...(email ? { email } : {}),
    };

    const { error } = existing
      ? await supabase.from('subscriptions').update(payload).eq('customer_key', customerKey)
      : await supabase.from('subscriptions').insert(payload);

    if (error) {
      console.error('[portone/callback] db error (trial)', error);
      return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=db_error&detail=${encodeURIComponent(error.message)}`, base));
    }
    return NextResponse.redirect(new URL('/billing-result?status=success', base));
  }

  // 즉시 결제
  const paymentId = `nock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const chargeRes = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
    {
      method: 'POST',
      headers: {
        Authorization: `PortOne ${PORTONE_API_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        billingKey,
        orderName: '노크 순공타이머 Premium',
        customer:  { id: customerKey, ...(email ? { email } : {}) },
        amount:    { total: plan.amount },
        currency:  'KRW',
      }),
      cache: 'no-store',
    }
  );

  const chargeData = await chargeRes.json();
  if (!chargeRes.ok || chargeData.status !== 'PAID') {
    console.error('[portone/callback] charge failed', chargeData);
    const reason = chargeData.code || 'charge_failed';
    return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${reason}`, base));
  }

  const nextCharge = new Date(now);
  nextCharge.setMonth(nextCharge.getMonth() + plan.months);

  const payload = {
    customer_key:   customerKey,
    plan:           planId,
    status:         'active',
    billing_key:    billingKey,
    trial_end_at:   null,
    next_charge_at: nextCharge.toISOString(),
    updated_at:     now.toISOString(),
    ...(email ? { email } : {}),
  };

  const { error: dbErr } = existing
    ? await supabase.from('subscriptions').update(payload).eq('customer_key', customerKey)
    : await supabase.from('subscriptions').insert(payload);

  if (dbErr) {
    console.error('[portone/callback] db error (charge)', dbErr);
    return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=db_error_after_charge&detail=${encodeURIComponent(dbErr.message)}`, base));
  }

  return NextResponse.redirect(new URL('/billing-result?status=success', base));
}
