import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const ORDER_NAME  = '노크 순공타이머 Pro';

const PLANS = {
  monthly: { amount: 4900,  months: 1,  trial: false },
  annual:  { amount: 33000, months: 12, trial: true  },
};

/**
 * GET /api/payments/toss/billing-auth?authKey=...&customerKey=...&plan=...
 *
 * Toss 빌링키 발급 → 결제/체험 처리 → Supabase 저장.
 * customerKey는 클라이언트(getUserKey)가 계산한 값 그대로 사용.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const authKey     = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const planId      = searchParams.get('plan') || 'monthly';

  if (!authKey || !customerKey) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=missing_params', request.url));
  }

  const plan      = PLANS[planId] || PLANS.monthly;
  const basicAuth = Buffer.from(`${TOSS_SECRET}:`).toString('base64');

  try {
    // 1. billingKey 발급
    const issueRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
      cache: 'no-store',
    });
    const issueData = await issueRes.json();
    if (!issueRes.ok) {
      console.error('[billing-auth] issue failed', issueData);
      return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${issueData.code || 'issue_failed'}`, request.url));
    }
    const billingKey = issueData.billingKey;

    // 2. 기존 구독 확인
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, status, plan, trial_end_at')
      .eq('customer_key', customerKey)
      .maybeSingle();

    const isActive =
      existing?.status === 'active' ||
      (existing?.status === 'trialing' && new Date(existing.trial_end_at) > new Date());

    // 같은 플랜으로 이미 활성화된 경우 중복 처리 방지
    if (isActive && existing?.plan === planId) {
      return NextResponse.redirect(new URL('/billing-result?status=success', request.url));
    }

    const now = new Date();

    if (plan.trial && !isActive) {
      // 연간 7일 무료체험
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 7);

      const payload = {
        customer_key: customerKey,
        plan: planId,
        status: 'trialing',
        billing_key: billingKey,
        trial_end_at: trialEnd.toISOString(),
        next_charge_at: trialEnd.toISOString(),
        updated_at: now.toISOString(),
      };

      const { error: dbErr } = existing
        ? await supabase.from('subscriptions').update(payload).eq('customer_key', customerKey)
        : await supabase.from('subscriptions').insert(payload);

      if (dbErr) {
        console.error('[billing-auth] db error (trial)', dbErr);
        return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=db_error`, request.url));
      }

    } else {
      // 즉시 결제
      const orderId = `nock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const chargeRes = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerKey, amount: plan.amount, orderId, orderName: ORDER_NAME }),
        cache: 'no-store',
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok) {
        console.error('[billing-auth] charge failed', chargeData);
        return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${chargeData.code || 'charge_failed'}`, request.url));
      }

      const nextCharge = new Date(now);
      nextCharge.setMonth(nextCharge.getMonth() + plan.months);

      const payload = {
        customer_key: customerKey,
        plan: planId,
        status: 'active',
        billing_key: billingKey,
        trial_end_at: null,
        next_charge_at: nextCharge.toISOString(),
        updated_at: now.toISOString(),
      };

      const { error: dbErr } = existing
        ? await supabase.from('subscriptions').update(payload).eq('customer_key', customerKey)
        : await supabase.from('subscriptions').insert(payload);

      if (dbErr) {
        console.error('[billing-auth] db error (charge)', dbErr);
        // 결제는 됐지만 DB 저장 실패 — 에러 페이지로 보내 수동 처리 가능하게 함
        return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=db_error_after_charge`, request.url));
      }
    }

    return NextResponse.redirect(new URL('/billing-result?status=success', request.url));

  } catch (e) {
    console.error('[billing-auth] unexpected error', e);
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=server_error', request.url));
  }
}
