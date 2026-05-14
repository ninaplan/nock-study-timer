import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';
import { isPayWithBillingKeyPaid, buildPayWithBillingKeyBody, portoneErrorMessage } from '@/app/lib/portone';

export const runtime = 'nodejs';

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET;

/** PortOne(웹)은 월간만 지원 */
const PLAN = { amount: 4900, months: 1 };

/**
 * POST /api/payments/portone/billing-auth
 * Body: { billingKey, customerKey, plan, email? }
 *
 * PC 팝업 모드에서 빌링키 발급 후 호출 → 즉시 결제 후 Supabase 저장
 */
export async function POST(request) {
  try {
    const { billingKey, customerKey, plan: _planIgnored, email: emailParam } = await request.json();

    if (!billingKey || !customerKey) {
      return NextResponse.json({ error: 'missing_params', message: '필수 파라미터가 없어요.' }, { status: 400 });
    }

    const planId = 'monthly';
    const plan   = PLAN;
    const supabase = getSupabaseAdmin();
    const session  = await getNotionSessionFromCookie(request);
    const email    = session?.email || emailParam || null;
    const now      = new Date();

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, status, plan, trial_end_at')
      .eq('customer_key', customerKey)
      .maybeSingle();

    const isActive =
      existing?.status === 'active' ||
      (existing?.status === 'trialing' && new Date(existing.trial_end_at) > now);

    if (isActive && existing?.plan === planId) {
      return NextResponse.json({ ok: true });
    }

    // 즉시 결제 (신규·플랜 변경)
    const paymentId = `nock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const chargeRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
      {
        method: 'POST',
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          buildPayWithBillingKeyBody({
            billingKey,
            customerKey,
            email,
            orderName: '노크 순공타이머 Premium',
            amountTotal: plan.amount,
            currency: 'KRW',
          })
        ),
        cache: 'no-store',
      }
    );

    const chargeData = await chargeRes.json();
    if (!chargeRes.ok || !isPayWithBillingKeyPaid(chargeData)) {
      console.error('[portone/billing-auth] charge failed', JSON.stringify(chargeData).slice(0, 2000));
      return NextResponse.json({
        error:   chargeData.code || chargeData.type || 'charge_failed',
        message: portoneErrorMessage(chargeData) || '결제에 실패했어요.',
      }, { status: 400 });
    }

    const nextCharge = new Date(now);
    nextCharge.setMonth(nextCharge.getMonth() + plan.months);

    const payload = {
      customer_key:   customerKey,
      plan:           planId,
      status:         'active',
      billing_key:    billingKey,
      trial_end_at:   null,
      next_charge_at: nextCharge.toISOString(),
      updated_at:     now.toISOString(),
      ...(email ? { email } : {}),
    };

    const { error: dbErr } = existing
      ? await supabase.from('subscriptions').update(payload).eq('customer_key', customerKey)
      : await supabase.from('subscriptions').insert(payload);

    if (dbErr) {
      console.error('[portone/billing-auth] db error (charge)', dbErr);
      return NextResponse.json({ error: 'db_error_after_charge', message: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[portone/billing-auth] unexpected error', e);
    return NextResponse.json({ error: 'server_error', message: '서버 오류가 발생했어요.' }, { status: 500 });
  }
}
