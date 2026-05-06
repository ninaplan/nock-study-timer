import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

const PORTONE_WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET;

/**
 * POST /api/payments/portone/webhook
 * 포트원 결제 이벤트 수신 (결제 성공/실패 알림)
 */
export async function POST(request) {
  // 포트원 웹훅 시크릿 검증
  const secret = request.headers.get('webhook-secret') || request.headers.get('x-portone-webhook-secret');
  if (PORTONE_WEBHOOK_SECRET && secret !== PORTONE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { type, data } = body;

  try {
    if (type === 'Transaction.Paid') {
      // 자동 갱신 결제 성공 — cron에서 처리하므로 여기서는 상태만 보정
      const customerId = data?.customer?.id;
      if (customerId) {
        await supabase
          .from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('customer_key', customerId)
          .eq('status', 'past_due');
      }
    }

    if (type === 'Transaction.Failed') {
      const customerId = data?.customer?.id;
      if (customerId) {
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('customer_key', customerId);
      }
    }
  } catch (e) {
    console.error('[portone/webhook] handler error', e);
  }

  return NextResponse.json({ received: true });
}
