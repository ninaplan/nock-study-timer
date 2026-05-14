import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/payments/apple-iap/webhook
 *
 * Apple App Store Server Notifications v2
 * App Store Connect → General → App Information → App Store Server Notifications URL
 * 에 이 엔드포인트 URL을 등록해야 한다.
 *
 * Apple은 구독 갱신·취소·만료 등 모든 상태 변경 시 signedPayload(JWS)를 전송한다.
 * signedPayload → data.signedTransactionInfo / signedRenewalInfo 각각 JWS
 */

const BUNDLE_ID = 'com.nock.studytimer';

const PRODUCT_MAP = {
  'com.nock.studytimer.premium.monthly': { planId: 'monthly', months: 1 },
};

function decodeJWSPayload(jws) {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('invalid_jws');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

/**
 * Apple S2S 알림 타입 → Supabase status 매핑
 *
 * 주요 notificationType:
 *   SUBSCRIBED          - 첫 구독 / 재구독
 *   DID_RENEW           - 자동 갱신 성공
 *   DID_FAIL_TO_RENEW   - 갱신 실패 (billing_retry_period 돌입)
 *   EXPIRED             - 구독 만료
 *   DID_CHANGE_RENEWAL_STATUS - 자동갱신 꺼짐(취소 예약) / 다시 켜짐
 *   REFUND              - 환불 처리
 *   GRACE_PERIOD_EXPIRED - 유예 기간 만료
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { signedPayload } = body;

    if (!signedPayload) {
      return NextResponse.json({ error: 'missing_signedPayload' }, { status: 400 });
    }

    // ── 외부 페이로드 디코딩 ─────────────────────────────────────────────────
    let outerPayload;
    try {
      outerPayload = decodeJWSPayload(signedPayload);
    } catch {
      return NextResponse.json({ error: 'invalid_outer_jws' }, { status: 400 });
    }

    const { notificationType, subtype, data } = outerPayload;
    if (!data?.signedTransactionInfo) {
      // renewalInfo만 있는 경우 등 — 무시
      return NextResponse.json({ ok: true, ignored: true });
    }

    // ── 트랜잭션 페이로드 디코딩 ─────────────────────────────────────────────
    let txPayload;
    try {
      txPayload = decodeJWSPayload(data.signedTransactionInfo);
    } catch {
      return NextResponse.json({ error: 'invalid_tx_jws' }, { status: 400 });
    }

    if (txPayload.bundleId !== BUNDLE_ID) {
      return NextResponse.json({ error: 'bundle_mismatch' }, { status: 400 });
    }

    const productId  = txPayload.productId;
    const planConfig = PRODUCT_MAP[productId];
    const origTxId   = String(txPayload.originalTransactionId || '');
    const txId       = String(txPayload.transactionId || '');
    const expiresDate = txPayload.expiresDate ? new Date(txPayload.expiresDate) : null;
    const now = new Date();

    if (!origTxId) {
      return NextResponse.json({ error: 'missing_originalTransactionId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // originalTransactionId 로 구독 레코드 조회
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, customer_key, status, plan')
      .eq('apple_original_transaction_id', origTxId)
      .maybeSingle();

    if (!existing) {
      // 알 수 없는 구독 (샌드박스 테스트 트랜잭션 등) — 조용히 무시
      console.warn('[apple-iap/webhook] unknown origTxId', origTxId, notificationType);
      return NextResponse.json({ ok: true, ignored: true });
    }

    let updatePayload = { updated_at: now.toISOString() };

    switch (notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW': {
        // 갱신 성공 → active, next_charge_at 갱신
        const nextCharge = expiresDate || (() => {
          const d = new Date(now);
          d.setMonth(d.getMonth() + (planConfig?.months ?? 1));
          return d;
        })();
        updatePayload = {
          ...updatePayload,
          status:          'active',
          trial_end_at:    null,
          next_charge_at:  nextCharge.toISOString(),
          apple_transaction_id: txId || null,
          ...(planConfig ? { plan: planConfig.planId } : {}),
        };
        break;
      }

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED': {
        updatePayload = { ...updatePayload, status: 'inactive' };
        break;
      }

      case 'DID_CHANGE_RENEWAL_STATUS': {
        if (subtype === 'AUTO_RENEW_DISABLED') {
          // 자동갱신 꺼짐 = 취소 예약 (기간 끝까지는 이용 가능)
          updatePayload = { ...updatePayload, status: 'cancelled' };
        } else if (subtype === 'AUTO_RENEW_ENABLED') {
          updatePayload = { ...updatePayload, status: 'active' };
        }
        break;
      }

      case 'REFUND': {
        updatePayload = { ...updatePayload, status: 'cancelled' };
        break;
      }

      case 'DID_FAIL_TO_RENEW': {
        // 갱신 실패 — 유예 기간(grace period) 중이면 active 유지, 아니면 past_due
        // 여기서는 status를 건드리지 않고 next_charge_at만 업데이트
        if (expiresDate) {
          updatePayload = { ...updatePayload, next_charge_at: expiresDate.toISOString() };
        }
        break;
      }

      default:
        // 처리하지 않는 알림 (CONSUMPTION_REQUEST 등) — 조용히 성공 응답
        return NextResponse.json({ ok: true, ignored: true });
    }

    const { error: dbErr } = await supabase
      .from('subscriptions')
      .update(updatePayload)
      .eq('id', existing.id);

    if (dbErr) {
      console.error('[apple-iap/webhook] db error', dbErr);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    console.log('[apple-iap/webhook]', notificationType, subtype ?? '', origTxId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[apple-iap/webhook] unexpected error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
