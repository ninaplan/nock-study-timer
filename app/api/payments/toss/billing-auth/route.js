import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const PLAN_NAME = '노크 순공타이머 Pro';

const PLANS = {
  monthly: { amount: 4900,  months: 1,  trial: false },
  annual:  { amount: 33000, months: 12, trial: true  },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const authKey     = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const planId      = searchParams.get('plan') || 'monthly';

  if (!authKey || !customerKey) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=missing_params', request.url));
  }

  const plan = PLANS[planId] || PLANS.monthly;
  const session = await getNotionSessionFromCookie(request);
  const notionUserId = session?.workspace_id || customerKey;
  const basicAuth = Buffer.from(`${TOSS_SECRET}:`).toString('base64');

  try {
    // billingKey 발급
    const issueRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
    });
    const issueData = await issueRes.json();
    if (!issueRes.ok) {
      console.error('[billing-auth] issue failed', issueData);
      return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${issueData.code || 'issue_failed'}`, request.url));
    }

    const billingKey = issueData.billingKey;
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('status, plan, trial_end_at')
      .eq('customer_key', customerKey)
      .single();

    const alreadyActive =
      existing?.status === 'active' ||
      (existing?.status === 'trialing' && new Date(existing.trial_end_at) > new Date());
    const isSamePlan = alreadyActive && existing?.plan === planId;

    if (isSamePlan) {
      // 동일 플랜 재구독 시도 — 아무것도 하지 않음
      return NextResponse.redirect(new URL('/billing-result?status=success', request.url));
    }

    if (plan.trial && !alreadyActive) {
      // 연간 7일 무료체험: 첫 결제 없이 billingKey만 저장
      const trialEndAt = new Date();
      trialEndAt.setDate(trialEndAt.getDate() + 7);

      const { error: dbErr } = await supabase
        .from('subscriptions')
        .upsert(
          {
            notion_user_id: notionUserId,
            plan: planId,
            status: 'trialing',
            billing_key: billingKey,
            customer_key: customerKey,
            trial_end_at: trialEndAt.toISOString(),
            next_charge_at: trialEndAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'notion_user_id' }
        );
      if (dbErr) console.error('[billing-auth] supabase upsert error (trial)', dbErr);
    } else {
      // 즉시 결제 (신규 or 플랜 변경)
      const orderId = `nock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const chargeRes = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerKey,
          amount: plan.amount,
          orderId,
          orderName: PLAN_NAME,
        }),
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok) {
        console.error('[billing-auth] charge failed', chargeData);
        return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${chargeData.code || 'charge_failed'}`, request.url));
      }

      const nextChargeAt = new Date();
      nextChargeAt.setMonth(nextChargeAt.getMonth() + plan.months);

      const { error: dbErr } = await supabase
        .from('subscriptions')
        .upsert(
          {
            notion_user_id: notionUserId,
            plan: planId,
            status: 'active',
            billing_key: billingKey,
            customer_key: customerKey,
            trial_end_at: null,
            next_charge_at: nextChargeAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'notion_user_id' }
        );
      if (dbErr) console.error('[billing-auth] supabase upsert error', dbErr);
    }

    return NextResponse.redirect(new URL('/billing-result?status=success', request.url));
  } catch (e) {
    console.error('[billing-auth] unexpected error', e);
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=server_error', request.url));
  }
}
