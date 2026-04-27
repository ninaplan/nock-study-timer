import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/payments/toss/webhook
 * 토스가 결제 이벤트(성공/실패/취소)를 보낼 때 호출.
 * 토스 개발자센터 > 웹훅 URL에 이 주소를 등록하세요.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { eventType, data } = body;
  const supabase = getSupabaseAdmin();

  // 자동결제 성공
  if (eventType === 'PAYMENT_STATUS_CHANGED' && data?.status === 'DONE') {
    const customerKey = data.customerKey;
    if (customerKey) {
      const nextChargeAt = new Date();
      nextChargeAt.setMonth(nextChargeAt.getMonth() + 1);
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          next_charge_at: nextChargeAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('customer_key', customerKey);
    }
  }

  // 결제 실패 / 취소
  if (
    eventType === 'PAYMENT_STATUS_CHANGED' &&
    (data?.status === 'CANCELED' || data?.status === 'ABORTED')
  ) {
    const customerKey = data.customerKey;
    if (customerKey) {
      await supabase
        .from('subscriptions')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('customer_key', customerKey);
    }
  }

  return NextResponse.json({ ok: true });
}
