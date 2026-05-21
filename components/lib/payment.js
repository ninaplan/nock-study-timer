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
  return startPortOne({ customerKey, email });
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

// ─── iOS Apple IAP ───────────────────────────────────────────────────────────

const APPLE_MONTHLY_PRODUCT_ID = 'com.nock.studytimer.premium.monthly';

function getNockIAP() {
  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.Plugins?.NockIAP ?? null;
  } catch {
    return null;
  }
}

async function startAppleIAP({ plan, customerKey }) {
  const NockIAP = getNockIAP();
  if (!NockIAP) return { ok: false, error: 'iap_plugin_unavailable' };

  if (plan?.id !== 'monthly') return { ok: false, error: 'unknown_plan' };
  const productId = APPLE_MONTHLY_PRODUCT_ID;

  let purchaseResult;
  try {
    purchaseResult = await NockIAP.purchase({ productId });
  } catch (e) {
    console.error('[payment] Apple IAP purchase error', e);
    return { ok: false, error: e?.message || 'purchase_failed' };
  }

  if (purchaseResult.cancelled) return { ok: false, cancelled: true };
  if (purchaseResult.pending)   return { ok: false, error: 'purchase_pending' };

  // 서버 검증 + Supabase 업데이트
  try {
    const res = await fetch(resolveApiUrl('/api/payments/apple-iap/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        jwsToken:              purchaseResult.jwsToken,
        transactionId:         purchaseResult.transactionId,
        originalTransactionId: purchaseResult.originalTransactionId,
        productId:             purchaseResult.productId,
        customerKey,
        plan: 'monthly',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'verify_failed' };
    return { ok: true };
  } catch (e) {
    console.error('[payment] Apple IAP verify error', e);
    return { ok: false, error: 'verify_network_error' };
  }
}

async function cancelAppleIAP() {
  // Apple IAP 구독은 앱 내에서 직접 취소 불가 — App Store 구독 관리 화면으로 안내
  const NockIAP = getNockIAP();
  if (NockIAP?.openManageSubscriptions) {
    try {
      await NockIAP.openManageSubscriptions();
    } catch (e) {
      console.warn('[payment] openManageSubscriptions failed', e);
    }
  }
  // appleManage: true 를 보고 SubscribeSheet가 특별 처리함
  return { ok: true, appleManage: true };
}

// ─── Web PortOne ─────────────────────────────────────────────────────────────

function portoneIssueCustomerEmail(customerKey, email) {
  const e = email?.trim();
  if (e) return e;
  const safe = String(customerKey || 'user').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${safe || 'user'}@billing.placeholder.nock.kr`;
}

/** 모바일·인앱 브라우저에서만 리다이렉트 강제 (PC 팝업 UX 유지) */
function shouldForcePortoneBillingRedirect() {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

async function startPortOne({ customerKey, email }) {
  const { default: PortOne } = await import('@portone/browser-sdk/v2');

  const issueEmail = portoneIssueCustomerEmail(customerKey, email);
  const callbackBase = resolveApiUrl('/api/payments/portone/billing-auth-callback');
  const params = new URLSearchParams({ plan: 'monthly', customerKey });
  params.set('email', issueEmail);

  const redirectUrl = `${callbackBase}?${params.toString()}`;
  const issueResult = await PortOne.requestIssueBillingKey({
    storeId:          process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
    channelKey:       process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
    billingKeyMethod: 'CARD',
    issueId:          `nock-${customerKey.slice(-26)}-${String(Date.now()).slice(-8)}`,
    issueName:        '노크 순공타이머 Premium',
    displayAmount:    4900,
    currency:         'KRW',
    redirectUrl,
    ...(shouldForcePortoneBillingRedirect() ? { forceRedirect: true } : {}),
    /** 콜백 쿼리 유실 시 서버에서 복구 */
    customData: JSON.stringify({
      nockCk: customerKey,
      nockPlan: 'monthly',
      nockEm: issueEmail,
    }),
    customer: {
      customerId: customerKey,
      email: issueEmail,
      phoneNumber: '01000000000',
      fullName: '노크사용자',
    },
    offerPeriod: {
      range: {
        from: new Date().toISOString(),
        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
    },
  });

  // 모바일 리다이렉트 모드: PortOne이 페이지 이동 → 여기까지 오지 않음
  if (issueResult?.code) {
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
      plan:        'monthly',
      email:       issueEmail,
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
