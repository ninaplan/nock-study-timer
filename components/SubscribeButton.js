'use client';
import { useState } from 'react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

/**
 * 구독하기 버튼.
 * customerKey = /api/subscription 에서 내려주는 값.
 */
export default function SubscribeButton({ customerKey, disabled, t }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubscribe = async () => {
    setErr('');
    setLoading(true);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const billing = tossPayments.payment({ customerKey });

      const successUrl = `${window.location.origin}/api/payments/toss/billing-auth`;
      const failUrl = `${window.location.origin}/billing-result?status=fail&reason=user_cancel`;

      await billing.requestBillingAuth({
        method: 'CARD',
        successUrl,
        failUrl,
      });
    } catch (e) {
      if (e?.code === 'USER_CANCEL') {
        setErr('');
      } else {
        setErr(e?.message || '결제 오류가 발생했어요');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={disabled || loading}
        style={{
          padding: '13px 20px',
          borderRadius: 14,
          border: 'none',
          background: loading || disabled ? 'var(--bg2, #f0f0f0)' : '#111',
          color: loading || disabled ? 'var(--text2, #888)' : '#fff',
          fontWeight: 700,
          fontSize: 16,
          cursor: disabled || loading ? 'default' : 'pointer',
          transition: 'background 0.15s',
          width: '100%',
        }}
      >
        {loading ? <span className="spin" /> : (t?.subscribePro || 'Pro 구독하기 · ₩4,900/월')}
      </button>
      {err && <div style={{ fontSize: 13, color: 'var(--red, #e00)' }}>{err}</div>}
    </div>
  );
}
