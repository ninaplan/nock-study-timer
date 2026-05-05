import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/** POST /api/subscription/cancel — 현재 구독을 취소 상태로 변경 */
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const session = await getNotionSessionFromCookie(request);
  const customerKeyParam = searchParams.get('customerKey');

  const customerKey = session?.workspace_id
    ? `nock-${session.workspace_id}`
    : customerKeyParam;

  if (!customerKey) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('customer_key', customerKey);

  if (error) {
    console.error('[subscription/cancel] error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
