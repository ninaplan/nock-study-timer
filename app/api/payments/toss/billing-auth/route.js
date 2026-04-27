import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const PLAN_AMOUNT = 4900;
const PLAN_NAME = '노크 순공타이머 Pro';

/**
 * GET /api/payments/toss/billing-auth?authKey=xxx&customerKey=xxx
 * 토스가 카드 등록 후 successUrl로 리다이렉트할 때 호출.
 * 1) authKey + customerKey로 billingKey 발급
 * 2) 이미 active 구독이 없을 때만 첫 결제 실행 (중복 결제 방지)
 * 3) Supabase에 저장
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');

  if (!authKey || !customerKey) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=missing_params', request.url));
  }

  // 세션 없어도 customerKey를 notion_user_id 대신 사용
  const session = await getNotionSessionFromCookie(request);
  const notionUserId = session?.workspace_id || customerKey;
  const basicAuth = Buffer.from(`${TOSS_SECRET}:`).toString('base64');

  try {
    // Step 1: billingKey 발급
    const issueRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ authKey, customerKey }),
    });
    const issueData = await issueRes.json();
    if (!issueRes.ok) {
      console.error('[billing-auth] issue failed', issueData);
      return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${issueData.code || 'issue_failed'}`, request.url));
    }

    const billingKey = issueData.billingKey;

    // Step 2: 이미 active 구독이 있으면 결제 스킵 (중복 방지)
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('customer_key', customerKey)
      .single();

    if (!existing || existing.status !== 'active') {
      const orderId = `nock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const chargeRes = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerKey,
          amount: PLAN_AMOUNT,
          orderId,
          orderName: PLAN_NAME,
        }),
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok) {
        console.error('[billing-auth] charge failed', chargeData);
        return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${chargeData.code || 'charge_failed'}`, request.url));
      }
    }

    // Step 3: Supabase 저장
    const nextChargeAt = new Date();
    nextChargeAt.setMonth(nextChargeAt.getMonth() + 1);

    const { error: dbErr } = await supabase
      .from('subscriptions')
      .upsert(
        {
          notion_user_id: notionUserId,
          plan: 'pro',
          status: 'active',
          billing_key: billingKey,
          customer_key: customerKey,
          next_charge_at: nextChargeAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'notion_user_id' }
      );

    if (dbErr) {
      console.error('[billing-auth] supabase upsert error', dbErr);
    }

    return NextResponse.redirect(new URL('/billing-result?status=success', request.url));
  } catch (e) {
    console.error('[billing-auth] unexpected error', e);
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=server_error', request.url));
  }
}
