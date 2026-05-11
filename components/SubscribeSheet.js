'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Check, Calendar, BarChart3, Clock3 } from 'lucide-react';
import { resolveApiUrl } from './lib/apiClient';
import { startSubscription, cancelSubscription, isNativeIOS } from './lib/payment';

const PLANS = [
  {
    id: 'monthly',
    label: '월간',
    labelEn: 'Monthly',
    amount: 4900,
    perMonth: 4900,
    months: 1,
    trial: false,
  },
  {
    id: 'annual',
    label: '연간',
    labelEn: 'Annual',
    amount: 33000,
    perMonth: 2750,
    months: 12,
    trial: true,
    saving: '44%',
  },
];

const FEATURES = [
  { icon: Calendar,  ko: '할일 날짜 자유롭게 이동',      en: 'Move tasks to any date' },
  { icon: BarChart3, ko: '이번달·올해 통계 & 기간 비교', en: 'Monthly & yearly stats' },
  { icon: BarChart3, ko: '주간·월간·연간 집계 차트',     en: 'Weekly/monthly/yearly charts' },
  { icon: Clock3,    ko: '타임블록으로 오늘 할 일에 시간 붙이기', en: 'Plan today with time blocks' },
];

/** 멤버십 카드 — 심플 블랙 카드, 날짜 포함 */
export function MembershipCard({ subscription, ko, onClick }) {
  const isCancelled = subscription?.status === 'cancelled';
  const withinPeriod = subscription?.next_charge_at && new Date(subscription.next_charge_at) > new Date();
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing' || (isCancelled && withinPeriod);
  const isTrial  = subscription?.status === 'trialing';
  const plan     = PLANS.find((p) => p.id === subscription?.plan);

  const startFormatted = subscription?.created_at
    ? new Date(subscription.created_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const expireValue = isTrial ? subscription?.trial_end_at : subscription?.next_charge_at;
  const expireFormatted = expireValue
    ? new Date(expireValue).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  if (!isActive) {
    return (
      <button type="button" onClick={onClick} className="membership-card-btn" style={{
        width: '100%', background: '#111', border: 'none',
        padding: '20px 22px', cursor: 'pointer', textAlign: 'center',
        fontFamily: 'var(--font)', marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
          {ko ? '순공타이머' : 'Nock Timer'}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: 18 }}>
          {ko ? 'Premium' : 'Premium'}
        </div>
        <div style={{ background: '#fff', borderRadius: 10, padding: '13px 0', fontSize: 16, fontWeight: 700, color: '#111' }}>
          {ko ? '시작하기 →' : 'Get started →'}
        </div>
      </button>
    );
  }

  const planLabel = isTrial
    ? (ko ? '무료체험' : 'Free Trial')
    : (ko ? (plan?.label ?? '월간') + ' Premium' : (plan?.labelEn ?? 'Monthly') + ' Premium');

  return (
    <button type="button" onClick={onClick} className="membership-card-btn" style={{
      width: '100%', background: '#111', border: 'none',
      padding: '20px 22px', cursor: 'pointer', textAlign: 'center',
      fontFamily: 'var(--font)', marginBottom: 20,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
        {ko ? '순공타이머' : 'Nock Timer'}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: isCancelled ? 8 : 16 }}>
        {planLabel}
      </div>
      {isCancelled && expireFormatted && (
        <div style={{ fontSize: 13, color: 'rgba(255,140,0,0.85)', fontWeight: 600, marginBottom: 16 }}>
          {ko ? `취소됨 · ${expireFormatted}까지 이용 가능` : `Cancelled · Access until ${expireFormatted}`}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
        {startFormatted && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              {ko ? '시작' : 'Started'}
            </div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{startFormatted}</div>
          </div>
        )}
        {expireFormatted && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              {isTrial ? (ko ? '종료' : 'Ends') : isCancelled ? (ko ? '만료' : 'Expires') : (ko ? '갱신' : 'Renews')}
            </div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{expireFormatted}</div>
          </div>
        )}
      </div>
    </button>
  );
}

export default function SubscribeSheet({ open, onClose, customerKey, ko, subscription, onCancelled, onSubscribed }) {
  const nativeIOS = isNativeIOS();

  const st = subscription?.status;
  const withinPeriod = subscription?.next_charge_at && new Date(subscription.next_charge_at) > new Date();
  const isActive     = st === 'active' || st === 'trialing' || (st === 'cancelled' && withinPeriod);
  const isTrial      = st === 'trialing';
  const isCancelled  = st === 'cancelled';

  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState('');
  const [visible,      setVisible]      = useState(false);
  const [animateIn,    setAnimateIn]    = useState(false);
  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [cancelling,   setCancelling]   = useState(false);
  const [cancelAck,    setCancelAck]    = useState(false);
  // iOS IAP 구독 성공 후 잠깐 표시할 확인 메시지
  const [iapSuccess,   setIapSuccess]   = useState(false);
  const scrollRef = useRef(null);
  const [sessionEmail, setSessionEmail] = useState(null);

  useEffect(() => {
    if (!open) {
      setSessionEmail(null);
      return;
    }
    let cancelled = false;
    fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.email) setSessionEmail(d.email);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (open) { setErr(''); setCancelOpen(false); setIapSuccess(false); }
  }, [open]);


  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.classList.add('subscribe-sheet-open');
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));

      // iOS에서 body overflow:hidden 만으로는 .content 스크롤이 막히지 않으므로
      // 시트 스크롤 영역 외부의 touchmove를 직접 차단
      const preventTouch = (e) => {
        if (scrollRef.current && scrollRef.current.contains(e.target)) return;
        e.preventDefault();
      };
      document.addEventListener('touchmove', preventTouch, { passive: false });

      return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('touchmove', preventTouch);
      };
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
      const result = await cancelSubscription({ customerKey });

      // iOS: App Store 관리 화면을 열었을 뿐 — 실제 취소는 App Store에서 처리됨
      if (result.appleManage) {
        setCancelOpen(false);
        setCancelling(false);
        setCancelAck(false);
        return;
      }

      if (!result.ok) {
        setErr(
          result.error === 'not_found'
            ? (ko ? '취소 처리에 실패했어요. 잠시 후 다시 시도해주세요.' : 'Cancel failed. Please try again.')
            : (ko ? '취소 처리 중 오류가 발생했어요.' : 'Error processing cancellation.')
        );
        setCancelOpen(false);
        return;
      }
      onCancelled?.();
      onClose();
    } catch {
      setErr(ko ? '네트워크 오류가 발생했어요. 다시 시도해 주세요.' : 'Network error. Please try again.');
      setCancelOpen(false);
    } finally {
      setCancelling(false);
      setCancelAck(false);
    }
  };

  const handleSubscribe = async () => {
    if (!customerKey) {
      setErr(ko ? '사용자 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.' : 'Loading user info. Please try again.');
      return;
    }
    setErr('');
    setLoading(true);
    try {
      const plan = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
      const result = await startSubscription({ plan, customerKey, email: sessionEmail || undefined });
      if (result.cancelled) return;
      if (!result.ok) {
        setErr(result.error || (ko ? '결제 오류가 발생했어요.' : 'Payment error.'));
        return;
      }
      if (result.redirect) {
        window.location.href = result.redirect;
        return;
      }
      // iOS IAP 성공 (redirect 없음) — 성공 메시지 잠깐 표시 후 닫기
      setIapSuccess(true);
      onSubscribed?.();
      setTimeout(() => { setIapSuccess(false); onClose(); }, 1800);
    } catch {
      setErr(ko ? '결제 오류가 발생했어요. 다시 시도해주세요.' : 'Payment error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const plan        = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
  const isSamePlan  = isActive && subscription?.plan === selectedPlan;
  const btnDisabled = loading || isSamePlan;

  const currentPlan     = PLANS.find((p) => p.id === subscription?.plan);
  const expireValue     = isTrial ? subscription?.trial_end_at : subscription?.next_charge_at;
  const expireFormatted = expireValue
    ? new Date(expireValue).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <>
      {/* 딤 */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 9998,
        opacity: animateIn ? 1 : 0,
        transition: animateIn ? 'opacity 0.25s ease' : 'opacity 0.3s ease',
      }} />

      {/* 시트 */}
      <div className="subscribe-sheet-panel" style={{
        transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
        transition: animateIn
          ? 'transform 0.46s cubic-bezier(0.32,1.1,0.32,1)'
          : 'transform 0.32s cubic-bezier(0.55,0.05,0.65,0.95)',
        willChange: 'transform',
      }}>
        <div className="sheet-handle-wrap" aria-hidden>
          <div className="sheet-handle" />
        </div>

        <div className="sheet-topbar sheet-topbar--flush">
          <button type="button" onClick={onClose} className="nav-circle-btn nav-circle-btn--dismiss" aria-label={ko ? '닫기' : 'Close'}>
            <X strokeWidth={2} strokeLinecap="round" aria-hidden />
          </button>
          <span className="sheet-topbar-title">
            {isActive ? (ko ? '멤버십 관리' : 'Membership') : (ko ? 'Premium' : 'Premium')}
          </span>
          <span className="sheet-topbar-spacer" aria-hidden />
        </div>

        <div ref={scrollRef} className="subscribe-sheet-scroll">
          <div className="subscribe-sheet-scroll-inner subscribe-sheet-stack">

            {/* ── 현재 구독 상태 (구독 중) ── */}
            {isActive && (
              <div className="sheet-form-card">
                <div className="subscribe-sheet-status-inner">
                <div>
                  <div style={{ fontSize: 'var(--font-size-callout)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', marginBottom: 4 }}>
                    {isTrial
                      ? (ko ? '무료체험 진행 중' : 'Free trial active')
                      : (ko ? `${currentPlan?.label ?? '월간'} Premium` : `${currentPlan?.labelEn ?? 'Monthly'} Premium`)}
                  </div>
                  {expireFormatted && (
                    <div style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-tertiary)' }}>
                      {isTrial
                        ? (ko ? `${expireFormatted}까지` : `Until ${expireFormatted}`)
                        : isCancelled
                          ? (ko ? `${expireFormatted}까지 프리미엄 사용 가능` : `Premium until ${expireFormatted}`)
                          : (ko ? `다음 결제 ${expireFormatted}` : `Renews ${expireFormatted}`)}
                    </div>
                  )}
                </div>
                <span
                  className={`subscribe-status-pill${isTrial ? ' subscribe-status-pill--trial' : isCancelled ? ' subscribe-status-pill--cancelled' : ' subscribe-status-pill--active'}`}
                >
                  {isTrial ? (ko ? '체험중' : 'Trial') : isCancelled ? (ko ? '취소됨' : 'Cancelled') : (ko ? '구독중' : 'Active')}
                </span>
                </div>
              </div>
            )}

            <div className="sheet-section-header">{ko ? 'Premium 기능' : 'Premium features'}</div>
            <div className="sheet-form-card subscribe-sheet-feature-card">
              {FEATURES.map(({ ko: textKo, en: textEn }, i) => (
                <div key={i} className="subscribe-sheet-feature-row">
                  <div className="subscribe-sheet-feature-icon">
                    <Check size={11} strokeWidth={3} color="var(--color-bg-app)" aria-hidden />
                  </div>
                  <span className="subscribe-sheet-feature-label">{ko ? textKo : textEn}</span>
                </div>
              ))}
            </div>

            {/* ── 플랜 카드 ── */}
            <div className="sheet-section-header">{ko ? '플랜' : 'Plans'}</div>
            <div className="subscribe-plan-grid">
              {PLANS.map((p) => {
                const isCurrentPlan = subscription?.plan === p.id && isActive;
                const isSelected    = selectedPlan === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id)}
                    className="subscribe-plan-option"
                    data-selected={isSelected ? 'true' : 'false'}
                  >
                    <div>
                      <div className="subscribe-plan-option-label">
                        <span className="subscribe-plan-option-title">{ko ? p.label : p.labelEn}</span>
                        {isCurrentPlan && (
                          <span className="subscribe-plan-badge">{ko ? '현재' : 'Current'}</span>
                        )}
                        {p.trial && !isCurrentPlan && (
                          <span className="subscribe-plan-badge subscribe-plan-badge--trial">{ko ? '7일 무료' : '7-day free'}</span>
                        )}
                      </div>
                      <div className="subscribe-plan-subline">
                        {ko ? `월 ₩${p.perMonth.toLocaleString()}` : `₩${p.perMonth.toLocaleString()}/mo`}
                        {p.saving ? (
                          <span className="subscribe-plan-save">
                            {ko ? `${p.saving} 할인` : `${p.saving} off`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="subscribe-plan-price-block">
                      <div className="subscribe-plan-price">₩{p.amount.toLocaleString()}</div>
                      <div className="subscribe-plan-period">{p.months === 1 ? (ko ? '/월' : '/mo') : (ko ? '/년' : '/yr')}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── CTA 버튼 ── */}
            {iapSuccess && (
              <div className="subscribe-sheet-success-banner">
                <Check size={20} strokeWidth={2.5} aria-hidden />
                {ko ? '구독이 시작됐어요!' : 'Subscription started!'}
              </div>
            )}
            {!iapSuccess && (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={btnDisabled}
              className="subscribe-sheet-primary-cta"
            >
              {loading
                ? <span className="spin" />
                : isActive
                  ? (isSamePlan
                      ? (ko ? '현재 플랜이에요' : 'Current plan')
                      : (ko ? '플랜 변경하기' : 'Change plan'))
                  : (plan.trial
                      ? (ko ? '7일 무료체험 시작' : 'Start 7-day free trial')
                      : (ko ? '구독 시작하기' : 'Start subscription'))}
            </button>

            )}

            {err && <div style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-action-red)', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

            {/* 안내 문구 */}
            {!iapSuccess && (
            <div style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.6, marginBottom: 4 }}>
              {isActive && !isCancelled
                ? (nativeIOS
                    ? (ko ? 'App Store 구독으로 관리됩니다' : 'Managed via App Store')
                    : (ko ? '플랜 변경 시 기존 카드로 즉시 결제됩니다' : 'Plan change will be charged to your saved card'))
                : plan.trial
                  ? (ko ? `7일 무료 후 ₩${plan.amount.toLocaleString()}/년` : `₩${plan.amount.toLocaleString()}/yr after 7-day trial`)
                  : (ko ? '매월 자동 갱신 · App Store 청구' : 'Auto-renews monthly via App Store')}
            </div>
            )}

            {/* 구독 취소 / 취소 완료 안내 */}
            {isActive && !isCancelled && !iapSuccess && (
              <div style={{ textAlign: 'center', marginTop: 12, paddingBottom: 4 }}>
                {nativeIOS ? (
                  // iOS: App Store에서 취소 안내
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'var(--font)' }}
                  >
                    {ko ? '구독 취소 (App Store)' : 'Cancel via App Store'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'var(--font)' }}
                  >
                    {ko ? '구독 취소' : 'Cancel subscription'}
                  </button>
                )}
              </div>
            )}
            {isCancelled && withinPeriod && (
              <div style={{ textAlign: 'center', marginTop: 12, paddingBottom: 4, fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                {ko ? '구독이 취소되었습니다.' : 'Subscription cancelled.'}
              </div>
            )}

            {!isActive && (
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'var(--font)' }}
                >
                  {ko ? '나중에 하기' : 'Maybe later'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 취소 확인 팝업 */}
      {cancelOpen && (
        <>
          <div onClick={() => { setCancelOpen(false); setCancelAck(false); }} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 10000 }} />
          <div
            className="liquid-overlay-card"
            style={{
              zIndex: 10001,
              width: 'min(320px,90vw)',
            }}
          >
            {nativeIOS ? (
              /* iOS: App Store 구독 관리로 안내 */
              <>
                <div style={{ fontSize: 'var(--list-row-label-size)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', marginBottom: 10 }}>
                  {ko ? 'App Store에서 취소하기' : 'Cancel via App Store'}
                </div>
                <div style={{ fontSize: 'var(--font-size-subhead)', color: 'var(--color-text-tertiary)', marginBottom: 22, lineHeight: 1.6 }}>
                  {ko
                    ? 'Apple IAP 구독은 App Store 구독 관리 화면에서 취소할 수 있어요. 취소해도 현재 기간이 끝날 때까지 Premium을 이용할 수 있어요.'
                    : 'Apple subscriptions are managed in the App Store. You can cancel there — Premium stays active until your period ends.'}
                </div>
                <div className="popup-actions popup-actions--icons" style={{ marginTop: 0, marginBottom: 0, paddingTop: 0 }}>
                  <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={() => { setCancelOpen(false); setCancelAck(false); }} aria-label={ko ? '닫기' : 'Close'}>
                    <X strokeWidth={2.2} aria-hidden />
                  </button>
                  <span className="popup-actions-spacer" aria-hidden />
                  <button
                    type="button"
                    className="nav-circle-btn nav-circle-btn--confirm"
                    onClick={handleCancel}
                    disabled={cancelling}
                    aria-label={ko ? 'App Store 열기' : 'Open App Store'}
                  >
                    {cancelling ? <span className="spin" style={{ width: 18, height: 18 }} /> : <Check strokeWidth={2.5} aria-hidden />}
                  </button>
                </div>
              </>
            ) : (
              /* 웹: 기존 취소 확인 플로우 */
              <>
                <div style={{ fontSize: 'var(--list-row-label-size)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', marginBottom: 10 }}>
                  {ko ? '구독을 취소할까요?' : 'Cancel subscription?'}
                </div>
                <div style={{ fontSize: 'var(--font-size-subhead)', color: 'var(--color-text-tertiary)', marginBottom: 18, lineHeight: 1.6 }}>
                  {ko
                    ? '취소해도 현재 구독 기간이 끝날 때까지는 Premium 기능을 그대로 사용할 수 있어요. 기간이 끝나면 자동 결제 없이 무료 플랜으로 전환됩니다.'
                    : 'You can keep using Premium until the end of your current period. After that, no charges — you\'ll move to the free plan.'}
                </div>
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
                  cursor: 'pointer', fontSize: 'var(--font-size-subhead)', color: 'var(--color-text-primary)', lineHeight: 1.5,
                }}>
                  <div
                    onClick={() => setCancelAck((v) => !v)}
                    style={{
                      marginTop: 2, flexShrink: 0,
                      width: 20, height: 20, borderRadius: 6,
                      border: `2px solid ${cancelAck ? 'var(--color-text-primary)' : 'var(--color-separator)'}`,
                      background: cancelAck ? 'var(--color-text-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                  >
                    {cancelAck && <Check size={12} strokeWidth={3} color="var(--color-bg-app)" />}
                  </div>
                  <span onClick={() => setCancelAck((v) => !v)}>
                    {ko ? '내용을 이해했으며 구독 취소를 진행합니다.' : 'I understand and want to cancel.'}
                  </span>
                </label>
                <div className="popup-actions popup-actions--icons" style={{ marginTop: 0, marginBottom: 0, paddingTop: 0 }}>
                  <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={() => { setCancelOpen(false); setCancelAck(false); }} aria-label={ko ? '유지' : 'Keep'}>
                    <X strokeWidth={2.2} aria-hidden />
                  </button>
                  <span className="popup-actions-spacer" aria-hidden />
                  <button
                    type="button"
                    className="nav-circle-btn nav-circle-btn--confirm"
                    onClick={handleCancel}
                    disabled={cancelling || !cancelAck}
                    style={{ opacity: cancelAck ? 1 : 0.35 }}
                    aria-label={ko ? '취소 확정' : 'Confirm'}
                  >
                    {cancelling ? <span className="spin" style={{ width: 18, height: 18 }} /> : <Check strokeWidth={2.5} aria-hidden />}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
