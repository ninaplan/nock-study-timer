'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Check, Calendar, BarChart3, Clock3, ArrowRight } from 'lucide-react';
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
  { icon: Clock3,    ko: '시간표 (출시 예정)',            en: 'Timetable (coming soon)' },
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
      <button type="button" onClick={onClick} style={{
        width: '100%', background: '#111', border: 'none', borderRadius: 18,
        padding: '20px 22px', cursor: 'pointer', textAlign: 'center',
        fontFamily: 'var(--font)', marginBottom: 20,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
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
    <button type="button" onClick={onClick} style={{
      width: '100%', background: '#111', border: 'none', borderRadius: 18,
      padding: '20px 22px', cursor: 'pointer', textAlign: 'center',
      fontFamily: 'var(--font)', marginBottom: 20,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
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

/** @deprecated */
export function ProMemberCard({ subscription, ko, onCancel }) {
  return <MembershipCard subscription={subscription} ko={ko} onClick={onCancel} />;
}

export default function SubscribeSheet({ open, onClose, customerKey, ko, subscription, onCancelled }) {
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
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open) { setErr(''); setCancelOpen(false); }
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
      const url = customerKey
        ? resolveApiUrl(`/api/subscription/cancel?customerKey=${encodeURIComponent(customerKey)}`)
        : resolveApiUrl('/api/subscription/cancel');
      const res = await fetch(url, { method: 'POST', credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error || '취소 처리 중 오류가 발생했어요.');
        setCancelOpen(false);
        return;
      }
      // rowsUpdated: 0이면 DB에서 행을 못 찾은 것 — 에러로 처리
      if (body?.rowsUpdated === 0) {
        setErr('취소 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
        setCancelOpen(false);
        return;
      }
      onCancelled?.();
      onClose();
    } catch {
      setErr('네트워크 오류가 발생했어요. 다시 시도해 주세요.');
      setCancelOpen(false);
    } finally {
      setCancelling(false);
      setCancelAck(false);
    }
  };

  const handleSubscribe = async () => {
    setErr('');
    setLoading(true);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const billing = tossPayments.payment({ customerKey });
      const plan = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
      await billing.requestBillingAuth({
        method: 'CARD',
        successUrl: resolveApiUrl(`/api/payments/toss/billing-auth?plan=${plan.id}`),
        failUrl: resolveApiUrl('/billing-result?status=fail&reason=user_cancel'),
      });
    } catch (e) {
      if (e?.code !== 'USER_CANCEL') setErr(e?.message || '결제 오류가 발생했어요');
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
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998,
        opacity: animateIn ? 1 : 0,
        transition: animateIn ? 'opacity 0.25s ease' : 'opacity 0.3s ease',
      }} />

      {/* 시트 */}
      <div className="subscribe-sheet-panel" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
        borderRadius: '22px 22px 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
        transition: animateIn
          ? 'transform 0.46s cubic-bezier(0.32,1.1,0.32,1)'
          : 'transform 0.32s cubic-bezier(0.55,0.05,0.65,0.95)',
        willChange: 'transform',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.12)',
        maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 핸들 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg4)' }} aria-hidden />
        </div>

        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          <div style={{ padding: '0 20px' }}>

            {/* ── 헤더 ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 20px' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 5 }}>
                  {ko ? '순공타이머' : 'Nock Timer'}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.6px', lineHeight: 1.1 }}>
                  {isActive
                    ? (ko ? '멤버십 관리' : 'Membership')
                    : (ko ? 'Premium' : 'Premium')}
                </div>
              </div>
              <button type="button" onClick={onClose} className="nav-circle-btn nav-circle-btn--dismiss" aria-label={ko ? '닫기' : 'Close'}>
                <X size={20} strokeWidth={2.3} />
              </button>
            </div>

            {/* ── 현재 구독 상태 (구독 중) ── */}
            {isActive && (
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--sep)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {isTrial
                      ? (ko ? '무료체험 진행 중' : 'Free trial active')
                      : (ko ? `${currentPlan?.label ?? '월간'} Premium` : `${currentPlan?.labelEn ?? 'Monthly'} Premium`)}
                  </div>
                  {expireFormatted && (
                    <div style={{ fontSize: 14, color: 'var(--text3)' }}>
                      {isTrial
                        ? (ko ? `${expireFormatted}까지` : `Until ${expireFormatted}`)
                        : isCancelled
                          ? (ko ? `${expireFormatted}까지 프리미엄 사용 가능` : `Premium until ${expireFormatted}`)
                          : (ko ? `다음 결제 ${expireFormatted}` : `Renews ${expireFormatted}`)}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: isTrial ? '#9333ea' : isCancelled ? '#c2660a' : '#16a34a',
                  background: isTrial ? 'rgba(147,51,234,0.1)' : isCancelled ? 'rgba(255,140,0,0.1)' : 'rgba(22,163,74,0.1)',
                  borderRadius: 20, padding: '4px 12px', flexShrink: 0,
                }}>
                  {isTrial ? (ko ? '체험중' : 'Trial') : isCancelled ? (ko ? '취소됨' : 'Cancelled') : (ko ? '구독중' : 'Active')}
                </span>
              </div>
            )}

            {/* ── 기능 목록 ── */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 14 }}>
                {ko ? 'Premium 기능' : 'Premium features'}
              </div>
              {FEATURES.map(({ ko: textKo, en: textEn }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={11} strokeWidth={3} color="var(--bg)" />
                  </div>
                  <span style={{ fontSize: 16, color: 'var(--text)', fontWeight: 400 }}>{ko ? textKo : textEn}</span>
                </div>
              ))}
            </div>

            {/* ── 플랜 카드 ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {PLANS.map((p) => {
                const isCurrentPlan = subscription?.plan === p.id && isActive;
                const isSelected    = selectedPlan === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px',
                      borderRadius: 14,
                      border: isSelected ? '2px solid #e8602c' : '1.5px solid var(--sep)',
                      background: isSelected ? 'var(--bg2)' : 'var(--bg2)',
                      cursor: 'pointer', fontFamily: 'var(--font)',
                      textAlign: 'left',
                      transition: 'border 0.12s, background 0.12s',
                    }}
                  >
                    <div>
                      {/* 플랜명 + 현재/무료체험 표시 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 18, fontWeight: 700,
                          color: 'var(--text)',
                          letterSpacing: '-0.3px',
                        }}>
                          {ko ? p.label : p.labelEn}
                        </span>
                        {isCurrentPlan && (
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: 'var(--text3)',
                            border: '1.5px solid var(--sep)',
                            borderRadius: 20, padding: '2px 8px',
                          }}>
                            {ko ? '현재' : 'Current'}
                          </span>
                        )}
                        {p.trial && !isCurrentPlan && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: isSelected ? '#e8602c' : 'var(--text3)',
                            borderRadius: 20, padding: '1px 7px',
                            border: `1px solid ${isSelected ? '#e8602c' : 'var(--sep)'}`,
                          }}>
                            {ko ? '7일 무료' : '7-day free'}
                          </span>
                        )}
                      </div>
                      {/* 월단가 */}
                      <div style={{ fontSize: 14, color: 'var(--text3)' }}>
                        {ko ? `월 ₩${p.perMonth.toLocaleString()}` : `₩${p.perMonth.toLocaleString()}/mo`}
                        {p.saving && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 12, fontWeight: 700,
                            color: isSelected ? '#e8602c' : 'var(--text3)',
                          }}>
                            {ko ? `${p.saving} 할인` : `${p.saving} off`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 총금액 */}
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{
                        fontSize: 22, fontWeight: 700,
                        color: 'var(--text)',
                        letterSpacing: '-0.5px',
                      }}>
                        ₩{p.amount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text4)' }}>
                        {p.months === 1 ? (ko ? '/월' : '/mo') : (ko ? '/년' : '/yr')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── CTA 버튼 ── */}
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={btnDisabled}
              style={{
                width: '100%', padding: '16px 20px',
                borderRadius: 14, border: 'none',
                background: btnDisabled ? 'var(--bg3)' : 'var(--text)',
                color: btnDisabled ? 'var(--text3)' : 'var(--bg)',
                fontWeight: 700, fontSize: 18, letterSpacing: '-0.2px',
                cursor: btnDisabled ? 'default' : 'pointer',
                marginBottom: 10, fontFamily: 'var(--font)',
                transition: 'opacity 0.15s',
              }}
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

            {err && <div style={{ fontSize: 14, color: 'var(--red)', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

            {/* 안내 문구 */}
            <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6, marginBottom: 4 }}>
              {isActive && !isCancelled
                ? (ko ? '플랜 변경 시 기존 카드로 즉시 결제됩니다' : 'Plan change will be charged to your saved card')
                : plan.trial
                  ? (ko ? `7일 무료 후 ₩${plan.amount.toLocaleString()}/년` : `₩${plan.amount.toLocaleString()}/yr after 7-day trial`)
                  : (ko ? '매월 자동 갱신' : 'Auto-renews monthly')}
            </div>

            {/* 구독 취소 / 취소 완료 안내 */}
            {isActive && !isCancelled && (
              <div style={{ textAlign: 'center', marginTop: 12, paddingBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  style={{ fontSize: 14, color: 'var(--text4)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'var(--font)' }}
                >
                  {ko ? '구독 취소' : 'Cancel subscription'}
                </button>
              </div>
            )}
            {isCancelled && withinPeriod && (
              <div style={{ textAlign: 'center', marginTop: 12, paddingBottom: 4, fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
                {ko ? '구독이 취소되었습니다.' : 'Subscription cancelled.'}
              </div>
            )}

            {!isActive && (
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ fontSize: 14, color: 'var(--text4)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'var(--font)' }}
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
          <div onClick={() => { setCancelOpen(false); setCancelAck(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000 }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 10001, background: 'var(--bg2)', borderRadius: 20, padding: '24px 22px',
            width: 'min(320px,90vw)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              {ko ? '구독을 취소할까요?' : 'Cancel subscription?'}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.6 }}>
              {ko
                ? '취소해도 현재 구독 기간이 끝날 때까지는 Premium 기능을 그대로 사용할 수 있어요. 기간이 끝나면 자동 결제 없이 무료 플랜으로 전환됩니다.'
                : 'You can keep using Premium until the end of your current period. After that, no charges — you\'ll move to the free plan.'}
            </div>
            {/* 이해 확인 체크박스 */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
              cursor: 'pointer', fontSize: 15, color: 'var(--text)', lineHeight: 1.5,
            }}>
              <div
                onClick={() => setCancelAck((v) => !v)}
                style={{
                  marginTop: 2, flexShrink: 0,
                  width: 20, height: 20, borderRadius: 6,
                  border: `2px solid ${cancelAck ? 'var(--text)' : 'var(--sep)'}`,
                  background: cancelAck ? 'var(--text)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                {cancelAck && <Check size={12} strokeWidth={3} color="var(--bg)" />}
              </div>
              <span onClick={() => setCancelAck((v) => !v)}>
                {ko ? '내용을 이해했으며 구독 취소를 진행합니다.' : 'I understand and want to cancel.'}
              </span>
            </label>
            <div className="popup-actions popup-actions--icons" style={{ marginTop: 0, marginBottom: 0, paddingTop: 0 }}>
              <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={() => { setCancelOpen(false); setCancelAck(false); }} aria-label={ko ? '유지' : 'Keep'}>
                <X size={22} strokeWidth={2.2} />
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
                {cancelling ? <span className="spin" style={{ width: 22, height: 22 }} /> : <Check size={22} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
