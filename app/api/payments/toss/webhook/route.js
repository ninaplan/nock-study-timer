import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const PLAN_MONTHS = { monthly: 1, annual: 12 };

/**
 * POST /api/payments/toss/webhook
 * Toss 자동결제 성공/실패 이벤트 처리.
 */
export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const { eventType, data } = body;
  const customerKey = data?.customerKey;

  if (!customerKey) return NextResponse.json({ ok: true });

  const supabase = getSupabaseAdmin();

  // 자동결제 성공
  if (eventType === 'PAYMENT_STATUS_CHANGED' && data?.status === 'DONE') {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('customer_key', customerKey)
      .maybeSingle();

    // 앱에서 직접 취소한 경우 재활성화 방지
    if (sub?.status === 'cancelled') {
      return NextResponse.json({ ok: true });
    }

    const months = PLAN_MONTHS[sub?.plan] ?? 1;
    const nextCharge = new Date();
    nextCharge.setMonth(nextCharge.getMonth() + months);

    await supabase
      .from('subscriptions')
      .update({ status: 'active', next_charge_at: nextCharge.toISOString(), updated_at: new Date().toISOString() })
      .eq('customer_key', customerKey);

  }

  // 결제 실패/취소
  if (eventType === 'PAYMENT_STATUS_CHANGED' && (data?.status === 'CANCELED' || data?.status === 'ABORTED')) {
    await supabase
      .from('subscriptions')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('customer_key', customerKey);
  }

  return NextResponse.json({ ok: true });
}
