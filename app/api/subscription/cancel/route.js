import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/subscription/cancel?customerKey=...
 *
 * customerKey는 클라이언트가 전달. 없으면 세션 쿠키로 폴백.
 */
export async function POST(request) {
  const { searchParams } = new URL(request.url);

  let customerKey = searchParams.get('customerKey');

  if (!customerKey) {
    const session = await getNotionSessionFromCookie(request);
    if (session?.workspace_id) customerKey = `nock-${session.workspace_id}`;
  }

  if (!customerKey) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('customer_key', customerKey)
    .select('id');

  const rowsUpdated = data?.length ?? 0;
  console.log('[cancel] customerKey:', customerKey, '| rowsUpdated:', rowsUpdated, '| error:', error?.message);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (rowsUpdated === 0) {
    console.warn('[cancel] 0 rows updated — customerKey may not match any row:', customerKey);
    return NextResponse.json({ error: 'subscription_not_found', customerKey }, { status: 404 });
  }

  return NextResponse.json({ ok: true, rowsUpdated });
}
