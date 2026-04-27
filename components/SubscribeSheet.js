'use client';
import { useState, useEffect } from 'react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

function StarsBg() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      viewBox="0 0 340 160"
      preserveAspectRatio="xMidYMid slice"
    >
      {[
        [20,18],[60,8],[110,22],[155,6],[200,16],[245,9],[295,20],[320,12],
        [35,45],[80,38],[130,50],[175,35],[225,48],[270,40],[310,52],
        [15,75],[55,68],[105,80],[160,65],[210,78],[260,70],[305,82],
        [40,105],[90,98],[140,110],[190,100],[240,108],[285,102],[325,112],
        [25,135],[70,128],[120,140],[170,130],[215,138],[265,132],[308,142],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 1.2 : 0.7} fill="white" opacity={0.3 + (i % 5) * 0.1} />
      ))}
    </svg>
  );
}

/** Pro 멤버 카드 — 구독 중일 때 표시 */
export function ProMemberCard({ subscription, ko }) {
  const since = subscription?.created_at
    ? new Date(subscription.created_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const nextDate = subscription?.next_charge_at
    ? new Date(subscription.next_charge_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)',
        padding: '22px 20px 20px',
        marginBottom: 20,
        minHeight: 100,
      }}
    >
      <StarsBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', marginBottom: 4 }}>
          노크 순공타이머 Pro
        </div>
        {since && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
            {ko ? `${since}부터 시작` : `Member since ${since}`}
          </div>
        )}
        {nextDate && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            {ko ? `다음 결제일 ${nextDate}` : `Renews ${nextDate}`}
          </div>
        )}
      </div>
    </div>
  );
}

/** 구독 바텀 시트 */
export default function SubscribeSheet({ open, onClose, customerKey, ko }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible) return null;

  const handleSubscribe = async () => {
    setErr('');
    setLoading(true);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const billing = tossPayments.payment({ customerKey });
      const successUrl = `${window.location.origin}/api/payments/toss/billing-auth`;
      const failUrl = `${window.location.origin}/billing-result?status=fail&reason=user_cancel`;
      await billing.requestBillingAuth({ method: 'CARD', successUrl, failUrl });
    } catch (e) {
      if (e?.code !== 'USER_CANCEL') setErr(e?.message || '결제 오류가 발생했어요');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 딤 배경 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 9998,
          opacity: open ? 1 : 0,
          transition: 'opacity 0.25s',
        }}
      />
      {/* 시트 */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          background: 'var(--bg2)',
          borderRadius: '20px 20px 0 0',
          padding: '0 0 max(28px, env(safe-area-inset-bottom))',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* 핸들 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg4)' }} />
        </div>

        <div style={{ padding: '12px 20px 0' }}>
          {/* 헤더 */}
          <div
            style={{
              position: 'relative',
              borderRadius: 16,
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)',
              padding: '20px 18px',
              marginBottom: 20,
            }}
          >
            <StarsBg />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                노크 순공타이머 Pro
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                {ko ? '집중한 시간을 더 깊게' : 'Deeper focus, deeper insights'}
              </div>
            </div>
          </div>

          {/* 혜택 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {[
              ['📊', ko ? '주간·월간·연간 통계' : 'Weekly, monthly & yearly stats'],
              ['📝', ko ? 'Daily Report 자동 기록' : 'Auto daily report logging'],
              ['🗂', ko ? '타임블록 플래너 뷰' : 'Timeblock planner view'],
              ['⏱', ko ? '무제한 타이머 & 할 일' : 'Unlimited timer & tasks'],
            ].map(([emoji, text]) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{emoji}</span>
                <span style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>{text}</span>
              </div>
            ))}
          </div>

          {/* 가격 */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>
              ₩4,900
            </span>
            <span style={{ fontSize: 15, color: 'var(--text3)', marginLeft: 4 }}>
              {ko ? '/ 월' : '/ month'}
            </span>
          </div>

          {/* 구독 버튼 */}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px 20px',
              borderRadius: 14,
              border: 'none',
              background: loading ? 'var(--bg3)' : '#111',
              color: loading ? 'var(--text3)' : '#fff',
              fontWeight: 700,
              fontSize: 17,
              cursor: loading ? 'default' : 'pointer',
              marginBottom: 10,
            }}
          >
            {loading ? <span className="spin" /> : (ko ? '카드로 구독 시작' : 'Start subscription')}
          </button>

          {err && <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
            {ko ? '언제든지 취소 가능 · 자동 갱신' : 'Cancel anytime · Auto-renews monthly'}
          </div>
        </div>
      </div>
    </>
  );
}
