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

/** 멤버십 카드 — Notion 갤러리뷰 스타일, Free/Pro 모두 표시 */
export function MembershipCard({ subscription, ko, onClick }) {
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrial = subscription?.status === 'trialing';
  const plan = PLANS.find((p) => p.id === subscription?.plan);

  const trialEnd = subscription?.trial_end_at
    ? new Date(subscription.trial_end_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { month: 'long', day: 'numeric' })
    : null;

  const tagLabel = isActive
    ? isTrial
      ? (ko ? `무료체험${trialEnd ? ` · ${trialEnd}까지` : ''}` : `Free Trial${trialEnd ? ` · until ${trialEnd}` : ''}`)
      : (ko ? (plan?.label ?? '월간') + ' Pro' : (plan?.labelEn ?? 'Monthly') + ' Pro')
    : (ko ? '무료' : 'Free');

  const tagStyle = isActive
    ? { background: 'rgba(211,229,239,0.9)', color: '#183f5d' }
    : { background: 'rgba(227,226,224,0.6)', color: '#787774' };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        background: 'var(--bg2)',
        border: '1px solid var(--sep)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font)',
        marginBottom: 20,
        padding: '16px 16px 16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'block',
      }}
    >
      {/* 아이콘 + 이름 한 줄 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <picture>
            <source srcSet="/onboarding-logo-dark.png?v=2" media="(prefers-color-scheme: dark)" />
            <img src="/onboarding-logo-light.png?v=2" alt="" width={36} height={36} style={{ borderRadius: 0, flexShrink: 0 }} />
          </picture>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
            노크 순공타이머
          </span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text3)' }} aria-hidden>›</span>
      </div>
      {/* 플랜 태그 */}
      <span style={{
        display: 'inline-block',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 4,
        padding: '2px 8px',
        ...tagStyle,
      }}>
        {tagLabel}
      </span>
    </button>
  );
}

/** @deprecated ProMemberCard는 MembershipCard로 대체됨 */
export function ProMemberCard({ subscription, ko, onCancel }) {
  return <MembershipCard subscription={subscription} ko={ko} onClick={onCancel} />;
}

/** 구독 바텀 시트 — 신규 구독 및 기존 구독 관리(플랜 변경·취소) */
export default function SubscribeSheet({ open, onClose, customerKey, ko, subscription, onCancelled }) {
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrial = subscription?.status === 'trialing';

  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [visible, setVisible] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (open) {
      setErr('');
      setCancelOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.classList.add('subscribe-sheet-open');
    } else {
      const t = setTimeout(() => {
        setVisible(false);
        document.body.classList.remove('subscribe-sheet-open');
      }, 300);
      return () => clearTimeout(t);
    }
    return () => document.body.classList.remove('subscribe-sheet-open');
  }, [open]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch('/api/subscription/cancel', { method: 'POST', credentials: 'include' });
      onCancelled?.();
      onClose();
    } catch { /* */ } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

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
          {/* 헤더 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.4px' }}>
              {isActive
                ? (ko ? '멤버십 관리' : 'Manage Membership')
                : (ko ? 'Pro로 업그레이드' : 'Upgrade to Pro')}
            </div>
            {isActive && (
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
                {isTrial
                  ? (ko ? '무료 체험 중이에요' : 'Currently in free trial')
                  : (ko ? '구독 중이에요' : 'Active subscription')}
              </div>
            )}
          </div>

          {/* 플랜 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {PLANS.map((p) => {
              const isCurrentPlan = subscription?.plan === p.id && isActive;
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
                    border: isSelected ? '2px solid var(--text)' : '1.5px solid var(--sep)',
                    background: isSelected ? 'var(--bg3)' : 'var(--bg2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    transition: 'border 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: isSelected ? '5px solid var(--text)' : '2px solid var(--bg4)',
                      flexShrink: 0, transition: 'border 0.15s',
                    }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                          {ko ? p.label : p.labelEn}
                        </span>
                        {isCurrentPlan && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(211,229,239,0.9)', color: '#183f5d', borderRadius: 4, padding: '1px 6px' }}>
                            {ko ? '현재' : 'Current'}
                          </span>
                        )}
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
                        fontSize: 11, fontWeight: 700, color: '#fff',
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

          {/* 구독 / 플랜 변경 버튼 */}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading || (isActive && subscription?.plan === selectedPlan)}
            style={{
              width: '100%', padding: '15px 20px', borderRadius: 14, border: 'none',
              background: (loading || (isActive && subscription?.plan === selectedPlan)) ? 'var(--bg3)' : 'var(--text)',
              color: (loading || (isActive && subscription?.plan === selectedPlan)) ? 'var(--text3)' : 'var(--bg)',
              fontWeight: 700, fontSize: 17,
              cursor: (loading || (isActive && subscription?.plan === selectedPlan)) ? 'default' : 'pointer',
              marginBottom: 10,
            }}
          >
            {loading ? <span className="spin" /> : isActive
              ? (subscription?.plan === selectedPlan
                  ? (ko ? '현재 플랜이에요' : 'Current plan')
                  : (ko ? '플랜 변경' : 'Change plan'))
              : (plan.trial
                  ? (ko ? '7일 무료체험 시작' : 'Start 7-day free trial')
                  : (ko ? '구독 시작' : 'Start subscription'))}
          </button>

          {err && <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', paddingBottom: isActive ? 0 : 4 }}>
            {isActive
              ? (ko ? '플랜 변경 시 기존 카드로 새 플랜이 결제돼요' : 'Changing plan will charge the new plan to your card')
              : plan.trial
                ? (ko ? '7일 무료 후 ₩49,900/년 자동 결제 · 언제든지 취소 가능' : '₩49,900/yr after 7-day trial · Cancel anytime')
                : (ko ? '언제든지 취소 가능 · 자동 갱신' : 'Cancel anytime · Auto-renews')}
          </div>

          {/* 구독 취소 */}
          {isActive && (
            <div style={{ textAlign: 'center', marginTop: 16, paddingBottom: 4 }}>
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                style={{ fontSize: 13, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
              >
                {ko ? '구독 취소' : 'Cancel subscription'}
              </button>
            </div>
          )}
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
              {ko ? '현재 기간이 끝나면 Pro 기능을 더 이상 사용할 수 없어요.' : "You'll lose access to Pro features at the end of the current period."}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCancelOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--sep)', background: 'var(--bg2)', color: 'var(--text)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {ko ? '유지' : 'Keep'}
              </button>
              <button onClick={handleCancel} disabled={cancelling} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {cancelling ? '...' : (ko ? '취소' : 'Cancel')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
