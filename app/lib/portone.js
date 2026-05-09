/**
 * POST /payments/{id}/billing-key (PayWithBillingKey) 응답 판별.
 * - 일반: { payment: { status: 'PAID', ... } }
 * - PortOne은 성공 시 status 없이 BillingKeyPaymentSummary 형태
 *   { payment: { pgTxId, paidAt } } 만 주는 경우가 있음 (문서·실측).
 */
export function isPayWithBillingKeyPaid(body) {
  if (!body || typeof body !== 'object') return false;
  const p = body.payment;
  if (p && typeof p === 'object') {
    if (p.failure != null) return false;
    const st = p.status;
    if (st === 'FAILED' || st === 'Failed' || st === 'CANCELLED' || st === 'Cancelled') return false;
    if (st === 'PAID' || (typeof st === 'string' && st.toUpperCase() === 'PAID')) return true;
    // 결제 완료 요약만 오는 성공 응답
    if (p.pgTxId && p.paidAt) return true;
  }
  const top = body.status;
  if (top === 'PAID' || (typeof top === 'string' && top.toUpperCase() === 'PAID')) return true;
  return false;
}

/**
 * 빌링 결제 API에서 buyer email 필수인 PG 대비 (노션 OAuth에 이메일 없을 때 포함).
 * 실제 수신용 주소가 아님.
 */
export function portoneBillingCustomerEmail(customerKey, email) {
  const e = email?.trim();
  if (e) return e;
  const safe = String(customerKey || 'user').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${safe || 'user'}@billing.placeholder.nock.kr`;
}

/**
 * PortOne V2 빌링 결제 요청 본문 (storeId·channelKey 포함).
 */
export function buildPayWithBillingKeyBody({
  billingKey,
  customerKey,
  email,
  orderName,
  amountTotal,
  currency = 'KRW',
}) {
  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
  const customerEmail = portoneBillingCustomerEmail(customerKey, email);
  return {
    ...(storeId ? { storeId } : {}),
    ...(channelKey ? { channelKey } : {}),
    billingKey,
    orderName,
    customer: {
      id: customerKey,
      email: customerEmail,
    },
    amount: { total: amountTotal },
    currency,
  };
}

/** API 오류 응답에서 메시지 추출 */
export function portoneErrorMessage(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.message) return String(body.message);
  if (body.payment?.failure?.message) return String(body.payment.failure.message);
  if (body.payment?.message) return String(body.payment.message);
  if (body.type) return String(body.type);
  return null;
}
