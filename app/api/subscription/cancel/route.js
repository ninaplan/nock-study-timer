import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/** POST /api/subscription/cancel — 현재 구독을 취소 상태로 변경 */
export async function POST(request) {
  const session = await getNotionSessionFromCookie(request);
  if (!session?.workspace_id) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('notion_user_id', session.workspace_id);

  if (error) {
    console.error('[subscription/cancel] error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
