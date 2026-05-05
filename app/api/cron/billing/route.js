import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const PLAN_NAME = '노크 순공타이머 Pro';
const PLAN_MONTHS = { monthly: 1, annual: 12 };

/**
 * GET /api/cron/billing
 * Vercel Cron에서 매일 한 번 호출. 두 가지 작업을 처리:
 *  1) 무료체험 종료 → 연간 첫 결제
 *  2) 구독 갱신일 도래 → 자동 결제
 */
export async function GET(request) {
  // Vercel Cron 시크릿 검증 (Vercel이 CRON_SECRET 헤더를 붙여 보냄)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const basicAuth = Buffer.from(`${TOSS_SECRET}:`).toString('base64');
  const now = new Date().toISOString();

  const results = { trialCharged: 0, renewed: 0, failed: 0 };

  // 1) 무료체험 종료된 구독 → 첫 결제
  const { data: expiredTrials } = await supabase
    .from('subscriptions')
    .select('customer_key, billing_key, plan')
    .eq('status', 'trialing')
    .lt('trial_end_at', now);

  for (const sub of expiredTrials ?? []) {
    const charged = await chargeSubscription(sub, basicAuth, supabase, PLAN_NAME, PLAN_MONTHS);
    if (charged) results.trialCharged++;
    else results.failed++;
  }

  // 2) 갱신일 도래한 구독 → 재결제
  const { data: dueRenewals } = await supabase
    .from('subscriptions')
    .select('customer_key, billing_key, plan')
    .eq('status', 'active')
    .lt('next_charge_at', now);

  for (const sub of dueRenewals ?? []) {
    const charged = await chargeSubscription(sub, basicAuth, supabase, PLAN_NAME, PLAN_MONTHS);
    if (charged) results.renewed++;
    else results.failed++;
  }

  console.log('[cron/billing]', results);
  return NextResponse.json({ ok: true, ...results });
}

async function chargeSubscription(sub, basicAuth, supabase, planName, planMonths) {
  const PLAN_AMOUNTS = { monthly: 4900, annual: 33000 };
  const amount = PLAN_AMOUNTS[sub.plan] ?? 4900;
  const months = planMonths[sub.plan] ?? 1;
  const orderId = `nock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const res = await fetch(`https://api.tosspayments.com/v1/billing/${sub.billing_key}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerKey: sub.customer_key, amount, orderId, orderName: planName }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error('[cron/billing] charge failed', sub.customer_key, data.code);
      await supabase
        .from('subscriptions')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('customer_key', sub.customer_key);
      return false;
    }

    const nextChargeAt = new Date();
    nextChargeAt.setMonth(nextChargeAt.getMonth() + months);
    await supabase
      .from('subscriptions')
      .update({ status: 'active', trial_end_at: null, next_charge_at: nextChargeAt.toISOString(), updated_at: new Date().toISOString() })
      .eq('customer_key', sub.customer_key);
    return true;
  } catch (e) {
    console.error('[cron/billing] unexpected error', sub.customer_key, e);
    return false;
  }
}
