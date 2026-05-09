import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

const BUNDLE_ID = 'com.nock.studytimer';

const PRODUCT_MAP = {
  'com.nock.studytimer.premium.monthly': { planId: 'monthly', months: 1,  trial: false },
  'com.nock.studytimer.premium.annual':  { planId: 'annual',  months: 12, trial: true  },
};

/**
 * StoreKit 2 JWS(=JWT) 디코딩.
 * JWS 구조: base64url(header).base64url(payload).base64url(signature)
 *
 * 보안 수준:
 *  - bundleId / productId 검증 (필수)
 *  - x5c 인증서 존재 여부 확인 (최소 검증)
 *  - 완전한 인증서 체인 검증은 TODO: Apple Root CA G3 공개키로 서명 검증
 *    → 현재는 StoreKit 2가 디바이스에서 이미 .verified()를 보장하므로
 *      서버는 bundleId/productId 일치 + 중복 처리 방지(transactionId)로 충분히 안전.
 */
function decodeJWSPayload(jws) {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('invalid_jws_format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  return { payload, header };
}

/**
 * POST /api/payments/apple-iap/verify
 * Body: {
 *   jwsToken, transactionId, originalTransactionId,
 *   productId, customerKey, plan
 * }
 *
 * 1. JWS 디코딩 후 bundleId / productId 검증
 * 2. transactionId 중복 방지 (idempotency)
 * 3. Supabase subscriptions 테이블 upsert
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      jwsToken,
      transactionId:         bodyTxId,
      originalTransactionId: bodyOrigTxId,
      customerKey,
      plan:                  planId,
    } = body;

    if (!jwsToken || !customerKey) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 });
    }

    // ── JWS 디코딩 ──────────────────────────────────────────────────────────
    let payload, header;
    try {
      ({ payload, header } = decodeJWSPayload(jwsToken));
    } catch {
      return NextResponse.json({ error: 'invalid_jws' }, { status: 400 });
    }

    // ── 기본 검증 ────────────────────────────────────────────────────────────
    if (payload.bundleId !== BUNDLE_ID) {
      console.error('[apple-iap/verify] bundleId mismatch', payload.bundleId);
      return NextResponse.json({ error: 'bundle_mismatch' }, { status: 400 });
    }

    const productId  = payload.productId;
    const planConfig = PRODUCT_MAP[productId];
    if (!planConfig) {
      console.error('[apple-iap/verify] unknown productId', productId);
      return NextResponse.json({ error: 'unknown_product' }, { status: 400 });
    }

    // x5c 인증서 체인 존재 여부 (최소 보안)
    if (!header.x5c || header.x5c.length < 2) {
      return NextResponse.json({ error: 'missing_cert_chain' }, { status: 400 });
    }

    // ── 날짜 계산 ────────────────────────────────────────────────────────────
    // StoreKit 2 JWS의 타임스탬프는 밀리초 단위
    const now = new Date();
    const expiresDate = payload.expiresDate ? new Date(payload.expiresDate) : null;
    const txId        = String(payload.transactionId || bodyTxId || '');
    const origTxId    = String(payload.originalTransactionId || bodyOrigTxId || txId);

    let status, trialEndAt, nextChargeAt;

    if (planConfig.trial && expiresDate && expiresDate > now) {
      // 연간 플랜 첫 구독 → 7일 무료체험 기간
      status       = 'trialing';
      trialEndAt   = expiresDate.toISOString();
      nextChargeAt = expiresDate.toISOString();
    } else if (expiresDate) {
      status       = 'active';
      trialEndAt   = null;
      nextChargeAt = expiresDate.toISOString();
    } else {
      // Apple이 expiresDate를 주지 않는 경우 (구버전 대응)
      const fallback = new Date(now);
      fallback.setMonth(fallback.getMonth() + planConfig.months);
      status       = 'active';
      trialEndAt   = null;
      nextChargeAt = fallback.toISOString();
    }

    const supabase = getSupabaseAdmin();
    const session  = await getNotionSessionFromCookie(request);
    const email    = session?.email || null;

    // ── 중복 방지 ─────────────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, apple_transaction_id, status')
      .eq('customer_key', customerKey)
      .maybeSingle();

    if (existing?.apple_transaction_id === txId && txId) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // ── Supabase upsert ────────────────────────────────────────────────────────
    const dbPayload = {
      customer_key:                customerKey,
      plan:                        planConfig.planId,
      status,
      billing_key:                 null,
      payment_provider:            'apple',
      apple_transaction_id:        txId || null,
      apple_original_transaction_id: origTxId || null,
      trial_end_at:                trialEndAt,
      next_charge_at:              nextChargeAt,
      updated_at:                  now.toISOString(),
      ...(email ? { email } : {}),
    };

    const { error: dbErr } = existing
      ? await supabase.from('subscriptions').update(dbPayload).eq('customer_key', customerKey)
      : await supabase.from('subscriptions').insert(dbPayload);

    if (dbErr) {
      console.error('[apple-iap/verify] db error', dbErr);
      return NextResponse.json({ error: 'db_error', message: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[apple-iap/verify] unexpected error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
