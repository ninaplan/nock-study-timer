import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/** POST /api/subscription/cancel — 현재 구독을 취소 상태로 변경 */
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const session = await getNotionSessionFromCookie(request);
  const customerKeyParam = searchParams.get('customerKey');
  // wid: 쿠키 세션 없을 때 클라이언트가 전달하는 workspaceId (구독 조회와 동일한 fallback)
  const widParam = searchParams.get('wid');

  const notionUserId = session?.workspace_id || widParam || null;
  // customerKeyParam이 있으면 우선 사용 (로컬모드 기기에 Notion 세션 쿠키가 잔존해도 간섭 방지)
  const customerKey = customerKeyParam || (notionUserId ? `nock-${notionUserId}` : null);

  if (!customerKey) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const payload = { status: 'cancelled', updated_at: new Date().toISOString() };

  // 1차: customer_key로 UPDATE (.select('id')로 실제 업데이트된 행 확인)
  const { data: updated, error } = await supabase
    .from('subscriptions')
    .update(payload)
    .eq('customer_key', customerKey)
    .select('id');

  const rowsAffected = updated?.length ?? 0;
  console.log('[subscription/cancel] customerKey:', customerKey, '| rowsAffected:', rowsAffected, '| error:', error?.message);

  if (error) {
    console.error('[subscription/cancel] error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2차 폴백: customer_key로 못 찾았고 Notion 유저인 경우 notion_user_id로 재시도
  if (rowsAffected === 0 && notionUserId) {
    const { data: updated2, error: err2 } = await supabase
      .from('subscriptions')
      .update(payload)
      .eq('notion_user_id', notionUserId)
      .select('id');
    console.log('[subscription/cancel] fallback notion_user_id:', notionUserId, '| rowsAffected:', updated2?.length ?? 0, '| error:', err2?.message);
    if (err2) {
      return NextResponse.json({ error: err2.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
