'use client';
import { useState } from 'react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

const METHODS = [
  { method: 'CARD', label: '카드', emoji: '💳' },
  { method: 'TOSSPAY', label: '토스페이', emoji: '🔵' },
  { method: 'KAKAOPAY', label: '카카오페이', emoji: '🟡' },
];

export default function SubscribeButton({ customerKey, disabled, t }) {
  const [loading, setLoading] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState(null);
  const [err, setErr] = useState('');

  const handleSubscribe = async (method) => {
    setErr('');
    setLoading(true);
    setLoadingMethod(method);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const billing = tossPayments.payment({ customerKey });

      const successUrl = `${window.location.origin}/api/payments/toss/billing-auth`;
      const failUrl = `${window.location.origin}/billing-result?status=fail&reason=user_cancel`;

      await billing.requestBillingAuth({
        method,
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
      setLoadingMethod(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {METHODS.map(({ method, label, emoji }) => (
          <button
            key={method}
            type="button"
            onClick={() => handleSubscribe(method)}
            disabled={disabled || loading}
            style={{
              padding: '13px 20px',
              borderRadius: 14,
              border: '1px solid var(--sep)',
              background: loading && loadingMethod === method
                ? 'var(--bg2, #f0f0f0)'
                : method === 'CARD'
                  ? '#111'
                  : 'var(--bg2, #f5f5f5)',
              color: loading && loadingMethod === method
                ? 'var(--text2, #888)'
                : method === 'CARD'
                  ? '#fff'
                  : 'var(--text, #111)',
              fontWeight: 700,
              fontSize: 15,
              cursor: disabled || loading ? 'default' : 'pointer',
              transition: 'background 0.15s',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: loading && loadingMethod !== method ? 0.4 : 1,
            }}
          >
            {loading && loadingMethod === method
              ? <span className="spin" />
              : <><span>{emoji}</span><span>{label}로 구독 · ₩4,900/월</span></>
            }
          </button>
        ))}
      </div>
      {err && <div style={{ fontSize: 13, color: 'var(--red, #e00)', marginTop: 4 }}>{err}</div>}
    </div>
  );
}
