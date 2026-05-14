import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { isPayWithBillingKeyPaid, buildPayWithBillingKeyBody } from '@/app/lib/portone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET;
const ORDER_NAME = '노크 순공타이머 Premium';
/** PortOne 빌링키 갱신 — 월간만 */
const PLAN_AMOUNT = 4900;
const PLAN_MONTHS = 1;

/**
 * GET /api/cron/billing
 * Vercel Cron에서 매일 한 번 호출.
 *  - 무료체험(PortOne 월간 없음 — Apple 등은 billing_key 없어 여기 해당 없음)
 *  - 구독 갱신일 도래 → 월간 자동 결제
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const results = { trialCharged: 0, renewed: 0, failed: 0 };

  // 1) 무료체험 종료 → 첫 결제
  const { data: expiredTrials } = await supabase
    .from('subscriptions')
    .select('customer_key, billing_key, plan')
    .eq('status', 'trialing')
    .lt('trial_end_at', now);

  for (const sub of expiredTrials ?? []) {
    if (sub.plan !== 'monthly' || !sub.billing_key) continue;
    const ok = await chargeSubscription(sub, supabase);
    if (ok) results.trialCharged++; else results.failed++;
  }

  // 2) 갱신일 도래 → 재결제 (PortOne 월간)
  const { data: dueRenewals } = await supabase
    .from('subscriptions')
    .select('customer_key, billing_key, plan')
    .eq('status', 'active')
    .lt('next_charge_at', now);

  for (const sub of dueRenewals ?? []) {
    if (sub.plan !== 'monthly' || !sub.billing_key) continue;
    const ok = await chargeSubscription(sub, supabase);
    if (ok) results.renewed++; else results.failed++;
  }

  return NextResponse.json({ ok: true, ...results });
}

async function chargeSubscription(sub, supabase) {
  if (sub.plan !== 'monthly' || !sub.billing_key) return false;
  const amount    = PLAN_AMOUNT;
  const months    = PLAN_MONTHS;
  const paymentId = `nock-renew-${sub.customer_key}-${Date.now()}`;

  try {
    const res = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
      {
        method: 'POST',
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          buildPayWithBillingKeyBody({
            billingKey: sub.billing_key,
            customerKey: sub.customer_key,
            email: null,
            orderName:  ORDER_NAME,
            amountTotal: amount,
            currency:   'KRW',
          })
        ),
        cache: 'no-store',
      }
    );

    const data = await res.json();
    if (!res.ok || !isPayWithBillingKeyPaid(data)) {
      console.error('[cron/billing] charge failed', sub.customer_key, JSON.stringify(data).slice(0, 500));
      await supabase
        .from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('customer_key', sub.customer_key);
      return false;
    }

    const nextChargeAt = new Date();
    nextChargeAt.setMonth(nextChargeAt.getMonth() + months);
    await supabase
      .from('subscriptions')
      .update({
        status:         'active',
        trial_end_at:   null,
        next_charge_at: nextChargeAt.toISOString(),
        updated_at:     new Date().toISOString(),
      })
      .eq('customer_key', sub.customer_key);
    return true;
  } catch (e) {
    console.error('[cron/billing] unexpected error', sub.customer_key, e);
    return false;
  }
}
