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

  // session 쿠키가 없는 경우 클라이언트가 localStorage에서 전달하는 workspaceId를 fallback으로 사용
  const notionUserId = session?.workspace_id || searchParams.get('wid') || null;
  const customerKeyParam = searchParams.get('customerKey');

  if (!notionUserId && !customerKeyParam) {
    return NextResponse.json({ plan: 'free', status: 'inactive' });
  }

  // customerKeyParam이 있으면 우선 사용 (로컬모드 기기에 Notion 세션 쿠키가 잔존해도 간섭 방지)
  const customerKey = customerKeyParam || (notionUserId ? `nock-${notionUserId}` : null);
  const supabase = getSupabaseAdmin();

  const COLS = 'plan, status, next_charge_at, trial_end_at, created_at, customer_key';

  // 1차: customer_key 컬럼으로 조회
  let { data, error } = await supabase
    .from('subscriptions')
    .select(COLS)
    .eq('customer_key', customerKey)
    .maybeSingle();

  // 2차 폴백: customer_key로 못 찾았고 Notion 유저인 경우 notion_user_id로도 조회
  // (과거 billing-auth에서 customer_key가 다른 형식으로 저장됐거나 없는 경우 대비)
  if (!data && !error && notionUserId) {
    ({ data, error } = await supabase
      .from('subscriptions')
      .select(COLS)
      .eq('notion_user_id', notionUserId)
      .maybeSingle());
    if (data) {
      console.log('[subscription] fallback hit via notion_user_id | stored customer_key:', data.customer_key);
    }
  }

  const noCache = { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } };

  console.log('[subscription] customerKey:', customerKey, '| notionUserId:', notionUserId, '| data:', JSON.stringify(data), '| error:', error?.message);

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
