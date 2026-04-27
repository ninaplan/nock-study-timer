'use client';
import { useState, useEffect } from 'react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

const PLANS = [
  {
    id: 'monthly',
    label: '월간',
    labelEn: 'Monthly',
    amount: 4900,
    perMonth: 4900,
    months: 1,
    badge: null,
  },
  {
    id: 'quarterly',
    label: '3개월',
    labelEn: '3 Months',
    amount: 12900,
    perMonth: 4300,
    months: 3,
    badge: '12% 할인',
    badgeEn: '12% off',
  },
  {
    id: 'biannual',
    label: '6개월',
    labelEn: '6 Months',
    amount: 24900,
    perMonth: 4150,
    months: 6,
    badge: '15% 할인',
    badgeEn: '15% off',
  },
  {
    id: 'annual',
    label: '연간',
    labelEn: 'Annual',
    amount: 49900,
    perMonth: 4158,
    months: 12,
    badge: '7일 무료체험',
    badgeEn: '7-day free trial',
    trial: true,
  },
];

function StarsBg() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      viewBox="0 0 340 120"
      preserveAspectRatio="xMidYMid slice"
    >
      {[
        [20,10],[60,5],[110,14],[155,4],[200,12],[245,6],[295,13],[320,8],
        [35,35],[80,28],[130,38],[175,25],[225,36],[270,30],[310,40],
        [15,60],[55,53],[105,65],[160,50],[210,63],[260,55],[305,67],
        [40,90],[90,83],[140,95],[190,85],[240,92],[285,87],[325,97],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 1.2 : 0.7} fill="white" opacity={0.25 + (i % 5) * 0.1} />
      ))}
    </svg>
  );
}

/** Pro 멤버 카드 — 구독 중일 때 표시 */
export function ProMemberCard({ subscription, ko, onCancel }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const since = subscription?.created_at
    ? new Date(subscription.created_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const nextDate = subscription?.next_charge_at
    ? new Date(subscription.next_charge_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const isTrial = subscription?.status === 'trialing';
  const trialEnd = subscription?.trial_end_at
    ? new Date(subscription.trial_end_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { month: 'long', day: 'numeric' })
    : null;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch('/api/subscription/cancel', { method: 'POST', credentials: 'include' });
      onCancel?.();
    } catch { /* */ } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'relative',
          borderRadius: 18,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)',
          padding: '22px 20px 18px',
          marginBottom: 20,
        }}
      >
        <StarsBg />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', marginBottom: 4 }}>
                노크 순공타이머 Pro
              </div>
              {isTrial && trialEnd ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  {ko ? `무료 체험 중 · ${trialEnd}까지` : `Free trial · until ${trialEnd}`}
                </div>
              ) : since ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                  {ko ? `${since}부터 시작` : `Member since ${since}`}
                </div>
              ) : null}
              {nextDate && !isTrial && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginTop: 5 }}>
                  {ko ? `다음 결제일 ${nextDate}` : `Renews ${nextDate}`}
                </div>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0f0f1a', background: 'rgba(255,255,255,0.85)', borderRadius: 7, padding: '3px 9px', flexShrink: 0 }}>
              PRO
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {ko ? '구독 취소' : 'Cancel subscription'}
          </button>
        </div>
      </div>

      {/* 취소 확인 팝업 */}
      {cancelOpen && (
        <>
          <div onClick={() => setCancelOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000 }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 10001, background: 'var(--bg2)', borderRadius: 18, padding: '24px 20px',
            width: 'min(320px, 90vw)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              {ko ? '구독을 취소할까요?' : 'Cancel subscription?'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.5 }}>
              {ko ? '현재 기간이 끝나면 Pro 기능을 더 이상 사용할 수 없어요.' : 'You\'ll lose access to Pro features at the end of the current period.'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCancelOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--sep)', background: 'var(--bg2)', color: 'var(--text)', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                {ko ? '유지' : 'Keep'}
              </button>
              <button onClick={handleCancel} disabled={cancelling} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                {cancelling ? '...' : (ko ? '취소' : 'Cancel')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** 구독 바텀 시트 */
export default function SubscribeSheet({ open, onClose, customerKey, ko }) {
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      // 탭바 숨기기
      const tabBar = document.querySelector('.tab-bar');
      if (tabBar) tabBar.style.display = 'none';
    } else {
      const t = setTimeout(() => {
        setVisible(false);
        // 탭바 복원
        const tabBar = document.querySelector('.tab-bar');
        if (tabBar) tabBar.style.display = '';
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible) return null;

  const plan = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];

  const handleSubscribe = async () => {
    setErr('');
    setLoading(true);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const billing = tossPayments.payment({ customerKey });
      const successUrl = `${window.location.origin}/api/payments/toss/billing-auth?plan=${plan.id}`;
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
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 9998, opacity: open ? 1 : 0, transition: 'opacity 0.25s',
        }}
      />
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          background: 'var(--bg2)',
          borderRadius: '20px 20px 0 0',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
      >
        {/* 핸들 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg4)' }} />
        </div>

        <div style={{ padding: '8px 20px 0' }}>
          {/* 헤더 카드 */}
          <div style={{
            position: 'relative', borderRadius: 16, overflow: 'hidden',
            background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)',
            padding: '18px 18px 16px', marginBottom: 20,
          }}>
            <StarsBg />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                노크 순공타이머 Pro
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                {ko ? '집중한 시간을 더 깊게' : 'Deeper focus, deeper insights'}
              </div>
            </div>
          </div>

          {/* 플랜 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {PLANS.map((p) => {
              const isSelected = selectedPlan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '13px 14px',
                    borderRadius: 13,
                    border: isSelected ? '2px solid #111' : '1.5px solid var(--sep)',
                    background: isSelected ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? '#1a1a2e' : '#f0f0ff') : 'var(--bg2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    transition: 'border 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: isSelected ? '5px solid #111' : '2px solid var(--bg4)',
                      flexShrink: 0,
                      transition: 'border 0.15s',
                    }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                        {ko ? p.label : p.labelEn}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                        {ko ? `₩${p.perMonth.toLocaleString()}/월` : `₩${p.perMonth.toLocaleString()}/mo`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      ₩{p.amount.toLocaleString()}
                    </span>
                    {p.badge && (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: p.trial ? '#fff' : '#fff',
                        background: p.trial ? '#5856D6' : '#34C759',
                        borderRadius: 6, padding: '2px 7px',
                      }}>
                        {ko ? p.badge : p.badgeEn}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 구독 버튼 */}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading}
            style={{
              width: '100%', padding: '15px 20px', borderRadius: 14, border: 'none',
              background: loading ? 'var(--bg3)' : '#111',
              color: loading ? 'var(--text3)' : '#fff',
              fontWeight: 700, fontSize: 17, cursor: loading ? 'default' : 'pointer',
              marginBottom: 10,
            }}
          >
            {loading ? <span className="spin" /> : (
              plan.trial
                ? (ko ? '7일 무료체험 시작' : 'Start 7-day free trial')
                : (ko ? '구독 시작' : 'Start subscription')
            )}
          </button>

          {err && <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', paddingBottom: 4 }}>
            {plan.trial
              ? (ko ? '7일 무료 후 ₩49,900/년 자동 결제 · 언제든지 취소 가능' : '₩49,900/yr after 7-day trial · Cancel anytime')
              : (ko ? '언제든지 취소 가능 · 자동 갱신' : 'Cancel anytime · Auto-renews')}
          </div>
        </div>
      </div>
    </>
  );
}
