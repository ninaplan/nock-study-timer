/**
 * POST /payments/{id}/billing-key (PayWithBillingKey) 응답 판별.
 * V2는 성공 시 { payment: { status: 'PAID', ... } } 형태.
 */
export function isPayWithBillingKeyPaid(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.payment?.status === 'PAID') return true;
  if (body.status === 'PAID') return true;
  return false;
}
