import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const PLAN_AMOUNT = 4900; // 월 구독료 (원)
const PLAN_NAME = '노크 순공타이머 Pro';

/**
 * GET /api/payments/toss/billing-auth?authKey=xxx&customerKey=xxx
 * 토스가 카드 등록 후 successUrl로 리다이렉트할 때 호출되는 엔드포인트.
 * 1) authKey + customerKey로 billingKey 발급
 * 2) 첫 번째 결제 실행
 * 3) Supabase subscriptions 테이블에 저장
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');

  if (!authKey || !customerKey) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=missing_params', request.url));
  }

  const session = await getNotionSessionFromCookie(request);
  if (!session?.workspace_id) {
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=not_logged_in', request.url));
  }

  const notionUserId = session.workspace_id;
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
      console.error('[toss billing-auth] issue failed', issueData);
      return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${issueData.code || 'issue_failed'}`, request.url));
    }

    const billingKey = issueData.billingKey;
    const orderId = `nock-${notionUserId.slice(0, 8)}-${Date.now()}`;

    // Step 2: 첫 번째 결제
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
        customerEmail: issueData.customerEmail || undefined,
        customerName: issueData.customerName || undefined,
      }),
    });
    const chargeData = await chargeRes.json();
    if (!chargeRes.ok) {
      console.error('[toss billing-auth] charge failed', chargeData);
      return NextResponse.redirect(new URL(`/billing-result?status=fail&reason=${chargeData.code || 'charge_failed'}`, request.url));
    }

    // Step 3: Supabase 저장
    const nextChargeAt = new Date();
    nextChargeAt.setMonth(nextChargeAt.getMonth() + 1);

    const supabase = getSupabaseAdmin();
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
      console.error('[toss billing-auth] supabase upsert error', dbErr);
    }

    return NextResponse.redirect(new URL('/billing-result?status=success', request.url));
  } catch (e) {
    console.error('[toss billing-auth] unexpected error', e);
    return NextResponse.redirect(new URL('/billing-result?status=fail&reason=server_error', request.url));
  }
}
