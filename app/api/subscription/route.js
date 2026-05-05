import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/subscription — 현재 유저의 구독 상태 반환
 *  - Notion 로그인 유저: cookie session의 workspace_id로 조회
 *  - 로컬 모드 유저: ?customerKey= 쿼리로 조회 (기기 UUID 기반)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const session = await getNotionSessionFromCookie(request);

  const notionUserId = session?.workspace_id;
  const customerKeyParam = searchParams.get('customerKey');

  if (!notionUserId && !customerKeyParam) {
    return NextResponse.json({ plan: 'free', status: 'inactive' });
  }

  const customerKey = notionUserId ? `nock-${notionUserId}` : customerKeyParam;
  const supabase = getSupabaseAdmin();

  // customer_key 기준으로 통일 조회 (notion_user_id는 billing-auth 환경에 따라 불일치 가능)
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, next_charge_at, trial_end_at, created_at')
    .eq('customer_key', customerKey)
    .single();

  const noCache = { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } };

  if (error || !data) {
    return NextResponse.json({ plan: 'free', status: 'inactive', customer_key: customerKey }, noCache);
  }

  return NextResponse.json({
    plan: data.plan,
    status: data.status,
    next_charge_at: data.next_charge_at,
    trial_end_at: data.trial_end_at,
    created_at: data.created_at,
    customer_key: customerKey,
  }, noCache);
}
