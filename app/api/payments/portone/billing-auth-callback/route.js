import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { isPayWithBillingKeyPaid, buildPayWithBillingKeyBody } from '@/app/lib/portone';

export const runtime = 'nodejs';

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET;

/** PortOne(웹)은 월간만 지원 */
const PLAN = { amount: 4900, months: 1 };

function parsePortoneCustomData(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function billingKeyFromQuery(searchParams) {
  return (
    searchParams.get('billingKey') ||
    searchParams.get('billing_key') ||
    searchParams.get('billing-key')
  );
}

/**
 * GET /api/payments/portone/billing-auth-callback
 * 모바일 리다이렉트 모드에서 PortOne이 돌아오는 엔드포인트.
 * Query: billingKey, customerKey, email?, code?(오류시), customData?(JSON — nockCk, nockEm)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const base = new URL(request.url).origin;

  const custom = parsePortoneCustomData(searchParams.get('customData'));
  const customerKey = searchParams.get('customerKey') || (custom?.nockCk ? String(custom.nockCk) : null);
  let emailParam = searchParams.get('email') || null;
  if (!emailParam && custom?.nockEm) emailParam = String(custom.nockEm);

  const billingKey = billingKeyFromQuery(searchParams);
  const code        = searchParams.get('code');

  if (code || !billingKey) {
    const reason = code === 'PORTONE_USER_CANCELLED' ? 'user_cancel' : (code || 'issue_failed');
    return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${reason}`, base));
  }

  if (!customerKey) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=missing_params', base));
  }

  const planId = 'monthly';
  const plan   = PLAN;
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
      body: JSON.stringify(
        buildPayWithBillingKeyBody({
          billingKey,
          customerKey,
          email,
          orderName: '노크 순공타이머 Premium',
          amountTotal: plan.amount,
          currency: 'KRW',
        })
      ),
      cache: 'no-store',
    }
  );

  const chargeData = await chargeRes.json();
  if (!chargeRes.ok || !isPayWithBillingKeyPaid(chargeData)) {
    console.error('[portone/callback] charge failed', JSON.stringify(chargeData).slice(0, 2000));
    const reason = chargeData.code || chargeData.type || 'charge_failed';
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
    return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=db_error_after_charge`, base));
  }

  return NextResponse.redirect(new URL('/billing-result?status=success', base));
}
