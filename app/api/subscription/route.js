import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_CACHE = { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } };

/**
 * GET /api/subscription?customerKey=...
 *
 * customerKey는 클라이언트(getUserKey)가 계산해서 전달.
 * 서버는 전달받은 값으로만 조회하며, 세션 쿠키로 독자 계산하지 않는다.
 * (쿠키는 customerKey가 없을 때만 최후 폴백으로 사용)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  let customerKey = searchParams.get('customerKey');

  // 클라이언트가 key를 전달하지 못한 경우(앱 첫 로드 등) 세션 쿠키로 폴백
  if (!customerKey) {
    const session = await getNotionSessionFromCookie(request);
    if (session?.workspace_id) customerKey = `nock-${session.workspace_id}`;
  }

  if (!customerKey) {
    return NextResponse.json({ plan: 'free', status: 'inactive' }, NO_CACHE);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, next_charge_at, trial_end_at, created_at')
    .eq('customer_key', customerKey)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ plan: 'free', status: 'inactive', customer_key: customerKey }, NO_CACHE);
  }

  return NextResponse.json({
    plan: data.plan,
    status: data.status,
    next_charge_at: data.next_charge_at,
    trial_end_at: data.trial_end_at,
    created_at: data.created_at,
    customer_key: customerKey,
  }, NO_CACHE);
}
