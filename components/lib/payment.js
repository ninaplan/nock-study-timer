'use client';
import { resolveApiUrl } from './apiClient';

/**
 * iOS Capacitor 네이티브 앱 여부 확인.
 * 웹(Android 포함)에서는 false 반환.
 */
export function isNativeIOS() {
  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/**
 * 구독 시작
 *
 * iOS 네이티브 → Apple IAP (추후 구현)
 * 웹(Android 포함) → PortOne 카드 빌링
 *
 * @returns {{ ok: boolean, cancelled?: boolean, redirect?: string, error?: string }}
 */
export async function startSubscription({ plan, customerKey, email }) {
  if (isNativeIOS()) {
    return startAppleIAP({ plan, customerKey });
  }
  return startPortOne({ plan, customerKey, email });
}

/**
 * 구독 취소
 *
 * iOS 네이티브 → Apple IAP 취소 (추후 구현)
 * 웹(Android 포함) → PortOne cancel API
 *
 * @returns {{ ok: boolean, error?: string }}
 */
export async function cancelSubscription({ customerKey }) {
  if (isNativeIOS()) {
    return cancelAppleIAP({ customerKey });
  }
  return cancelPortOne({ customerKey });
}

// ─── iOS Apple IAP (플레이스홀더) ───────────────────────────────────────────

async function startAppleIAP({ plan, customerKey }) {
  // TODO: @capacitor-community/in-app-purchases 연동
  console.warn('[payment] Apple IAP not yet implemented', { plan: plan.id, customerKey });
  return { ok: false, error: 'iap_not_ready' };
}

async function cancelAppleIAP({ customerKey }) {
  // Apple IAP 구독 취소는 App Store 설정에서 직접 처리 (앱 내 취소 불가)
  console.warn('[payment] Apple IAP cancel not applicable', { customerKey });
  return { ok: false, error: 'iap_cancel_not_applicable' };
}

// ─── Web PortOne ─────────────────────────────────────────────────────────────

async function startPortOne({ plan, customerKey, email }) {
  const { default: PortOne } = await import('@portone/browser-sdk/v2');

  const callbackBase = resolveApiUrl('/api/payments/portone/billing-auth-callback');
  const params = new URLSearchParams({ plan: plan.id, customerKey });
  if (email?.trim()) params.set('email', email.trim());
  const redirectUrl = `${callbackBase}?${params.toString()}`;

  console.log('[PortOne] storeId:', process.env.NEXT_PUBLIC_PORTONE_STORE_ID);
  console.log('[PortOne] channelKey:', process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY);
  let issueResult;
  try {
    issueResult = await PortOne.requestIssueBillingKey({
      storeId:          process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
      channelKey:       process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
      billingKeyMethod: 'CARD',
      issueId:          `nock-${customerKey}-${Date.now()}`,
      issueName:        '노크 순공타이머 Premium',
      redirectUrl,
      customer: {
        customerId: customerKey,
        ...(email?.trim() ? { email: email.trim() } : {}),
      },
    });
    console.log('[PortOne] issueResult:', JSON.stringify(issueResult));
  } catch (e) {
    console.error('[PortOne] requestIssueBillingKey error:', e?.message, e?.code, JSON.stringify(e));
    throw e;
  }

  // 모바일 리다이렉트 모드: PortOne이 페이지 이동 → 여기까지 오지 않음
  if (issueResult?.code) {
    console.log('[PortOne] issueResult error code:', issueResult.code, issueResult.message);
    if (issueResult.code === 'PORTONE_USER_CANCELLED') {
      return { ok: false, cancelled: true };
    }
    return { ok: false, error: issueResult.message || 'issue_failed' };
  }

  // PC 팝업 모드: 빌링키 발급 완료 → 서버에 결제 요청
  const res = await fetch(resolveApiUrl('/api/payments/portone/billing-auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      billingKey:  issueResult.billingKey,
      customerKey,
      plan:        plan.id,
      ...(email?.trim() ? { email: email.trim() } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.message || 'charge_failed' };
  }

  return { ok: true, redirect: resolveApiUrl('/billing-result?status=success') };
}

async function cancelPortOne({ customerKey }) {
  const url = customerKey
    ? resolveApiUrl(`/api/payments/portone/cancel?customerKey=${encodeURIComponent(customerKey)}`)
    : resolveApiUrl('/api/payments/portone/cancel');

  const res = await fetch(url, { method: 'POST', credentials: 'include' });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) return { ok: false, error: body?.error || 'cancel_failed' };
  if (body?.rowsUpdated === 0) return { ok: false, error: 'not_found' };

  return { ok: true };
}
