import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/** GET /api/subscription — 현재 로그인 유저의 구독 상태 반환 */
export async function GET(request) {
  const session = await getNotionSessionFromCookie(request);
  if (!session?.workspace_id) {
    return NextResponse.json({ plan: 'free', status: 'inactive' });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, next_charge_at')
    .eq('notion_user_id', session.workspace_id)
    .single();

  if (error || !data) {
    return NextResponse.json({
      plan: 'free',
      status: 'inactive',
      customer_key: `nock-${session.workspace_id}`,
    });
  }

  return NextResponse.json({
    plan: data.plan,
    status: data.status,
    next_charge_at: data.next_charge_at,
    customer_key: `nock-${session.workspace_id}`,
  });
}
