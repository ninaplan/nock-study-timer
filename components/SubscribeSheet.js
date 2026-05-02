'use client';
import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { resolveApiUrl } from './lib/apiClient';

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
    id: 'annual',
    label: '연간',
    labelEn: 'Annual',
    amount: 33000,
    perMonth: 2750,
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
      ? (ko ? '무료체험' : 'Free Trial')
      : (ko ? (plan?.label ?? '월간') + ' Pro' : (plan?.labelEn ?? 'Monthly') + ' Pro')
    : (ko ? '무료' : 'Free');

  const tagStyle = isActive
    ? { background: 'rgba(211,229,239,0.9)', color: '#183f5d' }
    : { background: 'rgba(227,226,224,0.6)', color: '#787774' };

  const dateLabel = isTrial && trialEnd
    ? (ko ? `${trialEnd}까지` : `Until ${trialEnd}`)
    : null;

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
      {/* 플랜 태그 + 날짜 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        {dateLabel && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {dateLabel}
          </span>
        )}
      </div>
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
  const [animateIn, setAnimateIn] = useState(false);
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
      // 두 프레임 후 애니메이션 시작 (translateY(100%) → translateY(0))
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimateIn(true))
      );
      return () => cancelAnimationFrame(raf);
    } else {
      setAnimateIn(false);
      document.body.classList.remove('subscribe-sheet-open');
      const t = setTimeout(() => setVisible(false), 380);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(resolveApiUrl('/api/subscription/cancel'), { method: 'POST', credentials: 'include' });
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
      const successUrl = resolveApiUrl(`/api/payments/toss/billing-auth?plan=${plan.id}`);
      const failUrl = resolveApiUrl('/billing-result?status=fail&reason=user_cancel');
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
          zIndex: 9998,
          opacity: animateIn ? 1 : 0,
          transition: animateIn ? 'opacity 0.28s ease' : 'opacity 0.32s ease',
        }}
      />
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          background: 'var(--bg2)',
          borderRadius: '20px 20px 0 0',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: animateIn
            ? 'transform 0.5s cubic-bezier(0.34, 1.2, 0.32, 1)'
            : 'transform 0.34s cubic-bezier(0.55, 0.05, 0.65, 0.95)',
          willChange: 'transform',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
      >
        <div style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg4)' }} aria-hidden />
          </div>
          <div className="sheet-topbar" style={{ paddingTop: 4, paddingBottom: 14 }}>
            <button
              type="button"
              className="nav-circle-btn nav-circle-btn--dismiss"
              onClick={onClose}
              aria-label={ko ? '닫기' : 'Close'}
            >
              <X size={22} strokeWidth={2.2} />
            </button>
            <span className="sheet-topbar-title">
              {isActive
                ? (ko ? '멤버십 관리' : 'Manage Membership')
                : (ko ? 'Pro로 업그레이드' : 'Upgrade to Pro')}
            </span>
            <span className="sheet-topbar-spacer" aria-hidden />
          </div>
        </div>

        <div style={{ padding: '4px 20px 0' }}>
          {isActive && (
            <div
              style={{
                fontSize: 15,
                fontWeight: 400,
                color: 'var(--text3)',
                marginBottom: 20,
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              {isTrial
                ? (ko ? '무료 체험 중이에요' : 'Currently in free trial')
                : (ko ? '구독 중이에요' : 'Active subscription')}
            </div>
          )}

          {/* 플랜 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {PLANS.map((p) => {
              const isCurrentPlan = subscription?.plan === p.id && isActive;
              const isSelected = selectedPlan === p.id;
              // Notion 스타일 배지 색상
              const badgeStyle = p.trial
                ? { background: 'rgba(232,222,238,0.9)', color: '#44337a' }   // purple
                : p.months >= 6
                  ? { background: 'rgba(211,229,239,0.9)', color: '#183f5d' } // blue
                  : { background: 'rgba(219,237,219,0.9)', color: '#1c7a4a' }; // green
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 16px',
                    borderRadius: 14,
                    border: isSelected ? '2px solid var(--text)' : '1.5px solid var(--sep)',
                    background: 'var(--bg2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    transition: 'border 0.15s',
                    textAlign: 'left',
                  }}
                >
                  {/* 왼쪽: 플랜명 + 월단가 */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                        {ko ? p.label : p.labelEn}
                      </span>
                      {isCurrentPlan && (
                        <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(211,229,239,0.9)', color: '#183f5d', borderRadius: 4, padding: '1px 7px' }}>
                          {ko ? '현재' : 'Current'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text3)' }}>
                        {ko ? `월 ₩${p.perMonth.toLocaleString()}` : `₩${p.perMonth.toLocaleString()}/mo`}
                      </span>
                      {p.badge && (
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          borderRadius: 4, padding: '1px 7px',
                          ...badgeStyle,
                        }}>
                          {ko ? p.badge : p.badgeEn}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 오른쪽: 총금액 */}
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                      ₩{p.amount.toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 구독 / 플랜 변경 버튼 */}
          {(() => {
            const isSamePlan = isActive && subscription?.plan === selectedPlan;
            return (
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={loading || isSamePlan}
                style={{
                  width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
                  background: (loading || isSamePlan) ? 'var(--bg3)' : 'var(--text)',
                  color: (loading || isSamePlan) ? 'var(--text3)' : 'var(--bg)',
                  fontWeight: 500, fontSize: 18, letterSpacing: '-0.2px',
                  cursor: (loading || isSamePlan) ? 'default' : 'pointer',
                  marginBottom: 10,
                  fontFamily: 'var(--font)',
                }}
              >
                {loading ? <span className="spin" /> : isActive
                  ? (isSamePlan
                      ? (ko ? '현재 플랜이에요' : 'Current plan')
                      : (ko ? '플랜 변경' : 'Change plan'))
                  : (plan.trial
                      ? (ko ? '7일 무료체험 시작' : 'Start 7-day free trial')
                      : (ko ? '구독 시작' : 'Start subscription'))}
              </button>
            );
          })()}

          {err && <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

          <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text3)', textAlign: 'center', paddingBottom: isActive ? 0 : 4, lineHeight: 1.5 }}>
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
                style={{ fontSize: 14, fontWeight: 400, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'var(--font)' }}
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
            <div className="popup-actions popup-actions--icons" style={{ marginTop: 0, marginBottom: 0, paddingTop: 4 }}>
              <button
                type="button"
                className="nav-circle-btn nav-circle-btn--dismiss"
                onClick={() => setCancelOpen(false)}
                aria-label={ko ? '구독 유지' : 'Keep subscription'}
              >
                <X size={22} strokeWidth={2.2} />
              </button>
              <span className="popup-actions-spacer" aria-hidden />
              <button
                type="button"
                className="nav-circle-btn nav-circle-btn--confirm"
                onClick={handleCancel}
                disabled={cancelling}
                aria-label={ko ? '구독 취소 확정' : 'Confirm cancel'}
              >
                {cancelling ? <span className="spin" style={{ width: 22, height: 22 }} /> : <Check size={22} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
