import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/payments/portone/cancel?customerKey=...
 * 구독 취소 — 기간 종료까지 이용 가능 (빌링키 삭제 없이 status만 cancelled로 변경)
 */
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const customerKey = searchParams.get('customerKey');

  if (!customerKey) {
    return NextResponse.json({ error: 'missing_customer_key' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('customer_key', customerKey)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 });
  }

  if (data.status === 'cancelled') {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  const { error: updateErr, count } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('customer_key', customerKey)
    .select('id');

  if (updateErr) {
    console.error('[portone/cancel] db error', updateErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rowsUpdated: count ?? 1 });
}
