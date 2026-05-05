'use client';
import { useState, useEffect } from 'react';
import { X, Check, Zap, CalendarRange, BarChart3, Clock3 } from 'lucide-react';
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

const FEATURES = [
  { icon: CalendarRange, ko: '할일 날짜 자유롭게 이동', en: 'Move tasks to any date' },
  { icon: BarChart3,    ko: '로그 기간 — 이번달·올해', en: 'Log range — month & year' },
  { icon: Zap,         ko: '주간·월간·연간 집계 차트',  en: 'Weekly/monthly/yearly charts' },
  { icon: Clock3,      ko: '시간표 (준비중)',           en: 'Timetable (coming soon)' },
];

/** 멤버십 카드 — 중앙정렬 그라디언트 카드, 날짜 포함 */
export function MembershipCard({ subscription, ko, onClick }) {
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrial  = subscription?.status === 'trialing';
  const plan     = PLANS.find((p) => p.id === subscription?.plan);

  const startFormatted = subscription?.created_at
    ? new Date(subscription.created_at).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const expireValue = isTrial ? subscription?.trial_end_at : subscription?.next_charge_at;
  const expireFormatted = expireValue
    ? new Date(expireValue).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  /* 비구독: 업그레이드 유도 카드 */
  if (!isActive) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg,#1e3a8a 0%,#312e81 40%,#4c1d95 100%)',
          border: 'none',
          borderRadius: 20,
          padding: '22px 20px 18px',
          cursor: 'pointer',
          textAlign: 'center',
          fontFamily: 'var(--font)',
          marginBottom: 20,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ position:'absolute', right:-24, top:-24, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.07)', pointerEvents:'none' }} />
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.4px', marginBottom:4 }}>
          {ko ? '순공타이머 Premium' : 'Nock Timer Premium'}
        </div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', marginBottom:18 }}>
          {ko ? '더 많은 기능을 사용해보세요' : 'Unlock all features'}
        </div>
        <div style={{
          background:'rgba(255,255,255,0.95)',
          borderRadius:12,
          padding:'11px 0',
          fontSize:14, fontWeight:700,
          color:'#1e3a8a',
          letterSpacing:'-0.1px',
        }}>
          {ko ? 'Premium 시작하기 →' : 'Start Premium →'}
        </div>
      </button>
    );
  }

  /* 구독 중 */
  const gradient = isTrial
    ? 'linear-gradient(135deg,#3b0764 0%,#6d28d9 55%,#4c1d95 100%)'
    : plan?.id === 'annual'
      ? 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#1d4ed8 100%)'
      : 'linear-gradient(135deg,#0c1445 0%,#1e40af 55%,#2563eb 100%)';

  const planLabel = isTrial
    ? (ko ? '무료체험 중' : 'Free Trial')
    : (ko ? (plan?.label ?? '월간') + ' Premium' : (plan?.labelEn ?? 'Monthly') + ' Premium');

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        background: gradient,
        border: 'none',
        borderRadius: 22,
        padding: '22px 20px 18px',
        cursor: 'pointer',
        textAlign: 'center',
        fontFamily: 'var(--font)',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 36px rgba(0,0,0,0.22)',
      }}
    >
      <div style={{ position:'absolute', right:-28, top:-28, width:110, height:110, borderRadius:'50%', background:'rgba(255,255,255,0.07)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', left:-20, bottom:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)', pointerEvents:'none' }} />

      {/* 앱명 */}
      <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.4px', marginBottom:8 }}>
        {ko ? '순공타이머 Premium' : 'Nock Timer Premium'}
      </div>

      {/* 플랜 배지 */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
        <span style={{
          fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
          color:'rgba(255,255,255,0.9)',
          background:'rgba(255,255,255,0.2)',
          borderRadius:20, padding:'3px 12px',
        }}>
          {planLabel}
        </span>
      </div>

      {/* 날짜 구분선 */}
      <div style={{ borderTop:'1px solid rgba(255,255,255,0.15)', paddingTop:12, display:'flex', justifyContent:'center', gap:24, flexWrap:'wrap' }}>
        {startFormatted && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:2 }}>
              {ko ? '시작' : 'Started'}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:500 }}>{startFormatted}</div>
          </div>
        )}
        {expireFormatted && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:2 }}>
              {isTrial ? (ko?'체험 종료':'Trial ends') : (ko?'다음 결제':'Renews')}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:500 }}>{expireFormatted}</div>
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

/** 구독 바텀 시트 */
export default function SubscribeSheet({ open, onClose, customerKey, ko, subscription, onCancelled }) {
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrial  = subscription?.status === 'trialing';

  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState('');
  const [visible,      setVisible]      = useState(false);
  const [animateIn,    setAnimateIn]    = useState(false);
  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [cancelling,   setCancelling]   = useState(false);

  useEffect(() => {
    if (open) { setErr(''); setCancelOpen(false); }
  }, [open]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.classList.add('subscribe-sheet-open');
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
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
      const cancelUrl = customerKey
        ? resolveApiUrl(`/api/subscription/cancel?customerKey=${encodeURIComponent(customerKey)}`)
        : resolveApiUrl('/api/subscription/cancel');
      await fetch(cancelUrl, { method: 'POST', credentials: 'include' });
      onCancelled?.();
      onClose();
    } catch { /* */ } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const handleSubscribe = async () => {
    setErr('');
    setLoading(true);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const billing      = tossPayments.payment({ customerKey });
      const plan         = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
      const successUrl   = resolveApiUrl(`/api/payments/toss/billing-auth?plan=${plan.id}`);
      const failUrl      = resolveApiUrl('/billing-result?status=fail&reason=user_cancel');
      await billing.requestBillingAuth({ method: 'CARD', successUrl, failUrl });
    } catch (e) {
      if (e?.code !== 'USER_CANCEL') setErr(e?.message || '결제 오류가 발생했어요');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const plan         = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
  const isSamePlan   = isActive && subscription?.plan === selectedPlan;
  const btnDisabled  = loading || isSamePlan;

  const currentPlan  = PLANS.find((p) => p.id === subscription?.plan);
  const dateValue    = isTrial ? subscription?.trial_end_at : subscription?.next_charge_at;
  const dateFormatted = dateValue
    ? new Date(dateValue).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { year:'numeric', month:'long', day:'numeric' })
    : null;

  return (
    <>
      {/* 딤 배경 */}
      <div
        onClick={onClose}
        style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          zIndex:9998,
          opacity: animateIn ? 1 : 0,
          transition: animateIn ? 'opacity 0.28s ease' : 'opacity 0.32s ease',
        }}
      />

      {/* 시트 패널 */}
      <div
        className="subscribe-sheet-panel"
        style={{
          position:'fixed', left:0, right:0, bottom:0,
          zIndex:9999,
          borderRadius:'24px 24px 0 0',
          paddingBottom:'max(24px, env(safe-area-inset-bottom))',
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: animateIn
            ? 'transform 0.48s cubic-bezier(0.34,1.2,0.32,1)'
            : 'transform 0.34s cubic-bezier(0.55,0.05,0.65,0.95)',
          willChange:'transform',
          boxShadow:'0 -8px 48px rgba(0,0,0,0.18)',
          maxHeight:'92dvh',
          display:'flex',
          flexDirection:'column',
          overflow:'hidden',
        }}
      >
        {/* 핸들 */}
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0', flexShrink:0 }}>
          <div style={{ width:36, height:4, borderRadius:2, background:'var(--bg4)' }} aria-hidden />
        </div>

        {/* 스크롤 영역 */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>

          {/* ── 히어로 헤더 ── */}
          {!isActive && (
            <div style={{
              margin:'12px 16px 0',
              borderRadius:20,
              background:'linear-gradient(135deg,#0f172a 0%,#1e3a8a 45%,#4f46e5 100%)',
              padding:'24px 22px 22px',
              position:'relative',
              overflow:'hidden',
            }}>
              {/* 장식 */}
              <div style={{ position:'absolute', right:-30, top:-30, width:130, height:130, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />
              <div style={{ position:'absolute', right:30, bottom:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />

              <div style={{ position:'relative' }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'rgba(255,255,255,0.5)', textTransform:'uppercase', marginBottom:8 }}>
                  {ko ? '노크 Premium' : 'Nock Premium'}
                </div>
                <div style={{ fontSize:24, fontWeight:800, color:'#fff', letterSpacing:'-0.5px', lineHeight:1.2, marginBottom:6 }}>
                  {ko ? '더 깊이 집중하세요' : 'Focus deeper'}
                </div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.6)', fontWeight:400 }}>
                  {ko ? '할일 관리부터 장기 통계까지' : 'From task management to long-term stats'}
                </div>
              </div>
            </div>
          )}

          {/* 관리 상태 헤더 */}
          {isActive && (
            <div style={{ padding:'16px 20px 4px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:20, fontWeight:800, color:'var(--text)', letterSpacing:'-0.4px' }}>
                {ko ? '멤버십 관리' : 'Manage Membership'}
              </span>
              <button type="button" onClick={onClose} className="nav-circle-btn nav-circle-btn--dismiss" aria-label={ko?'닫기':'Close'}>
                <X size={20} strokeWidth={2.3} />
              </button>
            </div>
          )}

          <div style={{ padding: isActive ? '0 20px' : '0 16px' }}>

            {/* ── 기능 목록 (비구독) ── */}
            {!isActive && (
              <div style={{ marginTop:16, marginBottom:20 }}>
                {FEATURES.map(({ icon: Icon, ko: textKo, en: textEn }) => (
                  <div key={textKo} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 2px' }}>
                    <div style={{
                      width:32, height:32, borderRadius:10, flexShrink:0,
                      background:'linear-gradient(135deg,rgba(37,99,235,0.15),rgba(124,58,237,0.15))',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      <Icon size={16} strokeWidth={2.1} color='var(--notion)' />
                    </div>
                    <span style={{ fontSize:15, color:'var(--text)', fontWeight:400 }}>{ko ? textKo : textEn}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 현재 구독 정보 (구독 중) */}
            {isActive && (
              <div style={{
                margin:'16px 0 20px',
                padding:'16px 18px',
                borderRadius:16,
                background:'var(--bg2)',
                border:'1.5px solid var(--sep)',
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: dateFormatted ? 8 : 0 }}>
                  <span style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>
                    {isTrial
                      ? (ko ? '무료체험 진행 중' : 'Free trial active')
                      : (ko ? `${currentPlan?.label ?? '월간'} Premium` : `${currentPlan?.labelEn ?? 'Monthly'} Premium`)}
                  </span>
                  <span style={{
                    fontSize:11, fontWeight:700,
                    color:isTrial?'#6d28d9':'#1d4ed8',
                    background:isTrial?'rgba(109,40,217,0.1)':'rgba(29,78,216,0.1)',
                    borderRadius:20, padding:'3px 10px',
                  }}>
                    {isTrial ? (ko?'체험중':'Trial') : (ko?'구독중':'Active')}
                  </span>
                </div>
                {dateFormatted && (
                  <div style={{ fontSize:13, color:'var(--text3)' }}>
                    {isTrial
                      ? (ko?`${dateFormatted}까지 무료체험`:`Free trial until ${dateFormatted}`)
                      : (ko?`다음 결제 ${dateFormatted}`:`Renews ${dateFormatted}`)}
                  </div>
                )}
              </div>
            )}

            {/* ── 플랜 카드 ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              {PLANS.map((p) => {
                const isCurrentPlan = subscription?.plan === p.id && isActive;
                const isSelected    = selectedPlan === p.id;
                const isRecommended = p.id === 'annual';

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id)}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding: isRecommended ? '0' : '14px 16px',
                      borderRadius:16,
                      border: isSelected ? '2.5px solid var(--text)' : '1.5px solid var(--sep)',
                      background: isSelected && isRecommended
                        ? 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#2563eb 100%)'
                        : 'var(--bg2)',
                      cursor:'pointer',
                      fontFamily:'var(--font)',
                      textAlign:'left',
                      transition:'border 0.15s, background 0.2s',
                      overflow:'hidden',
                      position:'relative',
                    }}
                  >
                    {/* 연간 추천 — 상단 컬러 스트라이프 */}
                    {isRecommended && !isSelected && (
                      <div style={{
                        position:'absolute', top:0, left:0, right:0, height:3,
                        background:'linear-gradient(90deg,#2563eb,#7c3aed)',
                        borderRadius:'16px 16px 0 0',
                      }} />
                    )}

                    <div style={{ padding: isRecommended ? '14px 16px' : '0', display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                          <span style={{
                            fontSize:17, fontWeight:600,
                            color: isSelected && isRecommended ? 'rgba(255,255,255,0.95)' : 'var(--text)',
                            letterSpacing:'-0.2px',
                          }}>
                            {ko ? p.label : p.labelEn}
                          </span>
                          {isRecommended && (
                            <span style={{
                              fontSize:10, fontWeight:700, letterSpacing:'0.04em',
                              color: isSelected ? 'rgba(255,255,255,0.8)' : '#fff',
                              background: isSelected ? 'rgba(255,255,255,0.2)' : 'linear-gradient(90deg,#2563eb,#7c3aed)',
                              borderRadius:20, padding:'2px 8px',
                            }}>
                              {ko ? '추천' : 'Best'}
                            </span>
                          )}
                          {isCurrentPlan && (
                            <span style={{
                              fontSize:10, fontWeight:700,
                              color: isSelected && isRecommended ? 'rgba(255,255,255,0.7)' : '#183f5d',
                              background: isSelected && isRecommended ? 'rgba(255,255,255,0.15)' : 'rgba(211,229,239,0.9)',
                              borderRadius:20, padding:'2px 8px',
                            }}>
                              {ko?'현재':'Current'}
                            </span>
                          )}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{
                            fontSize:13, color: isSelected && isRecommended ? 'rgba(255,255,255,0.55)' : 'var(--text3)',
                          }}>
                            {ko ? `월 ₩${p.perMonth.toLocaleString()}` : `₩${p.perMonth.toLocaleString()}/mo`}
                          </span>
                          {p.badge && (
                            <span style={{
                              fontSize:10, fontWeight:700,
                              color: isSelected ? 'rgba(255,255,255,0.85)' : '#5b21b6',
                              background: isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(124,58,237,0.12)',
                              borderRadius:20, padding:'2px 8px',
                            }}>
                              {ko ? p.badge : p.badgeEn}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                        <div style={{
                          fontSize:22, fontWeight:700,
                          color: isSelected && isRecommended ? '#fff' : 'var(--text)',
                          letterSpacing:'-0.5px',
                        }}>
                          ₩{p.amount.toLocaleString()}
                        </div>
                        <div style={{ fontSize:11, color: isSelected && isRecommended ? 'rgba(255,255,255,0.45)' : 'var(--text4)' }}>
                          {p.months === 1 ? (ko?'/월':'/mo') : (ko?'/년':'/yr')}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* CTA 버튼 */}
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={btnDisabled}
              style={{
                width:'100%', padding:'17px 20px',
                borderRadius:16, border:'none',
                background: btnDisabled
                  ? 'var(--bg3)'
                  : 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 50%,#2563eb 100%)',
                color: btnDisabled ? 'var(--text3)' : '#fff',
                fontWeight:700, fontSize:17, letterSpacing:'-0.2px',
                cursor: btnDisabled ? 'default' : 'pointer',
                marginBottom:10,
                fontFamily:'var(--font)',
                boxShadow: btnDisabled ? 'none' : '0 4px 20px rgba(37,99,235,0.35)',
                transition:'opacity 0.15s',
              }}
            >
              {loading ? <span className="spin" style={{ borderTopColor:'#fff' }} /> : isActive
                ? (isSamePlan
                    ? (ko ? '현재 플랜이에요' : 'Current plan')
                    : (ko ? '플랜 변경하기' : 'Change plan'))
                : (plan.trial
                    ? (ko ? '7일 무료체험 시작하기' : 'Start 7-day free trial')
                    : (ko ? '구독 시작하기' : 'Start subscription'))}
            </button>

            {err && (
              <div style={{ fontSize:13, color:'var(--red)', textAlign:'center', marginBottom:8 }}>{err}</div>
            )}

            <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', lineHeight:1.6, paddingBottom:4 }}>
              {isActive
                ? (ko ? '플랜 변경 시 기존 카드로 새 플랜이 결제돼요' : 'Plan change will be charged to your saved card')
                : plan.trial
                  ? (ko ? `7일 무료 후 ₩${plan.amount.toLocaleString()}/년 자동 결제 · 언제든 취소 가능` : `₩${plan.amount.toLocaleString()}/yr after 7-day trial · Cancel anytime`)
                  : (ko ? '언제든지 취소 가능 · 매월 자동 갱신' : 'Cancel anytime · Auto-renews monthly')}
            </div>

            {/* 구독 취소 */}
            {isActive && (
              <div style={{ textAlign:'center', marginTop:14, paddingBottom:4 }}>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  style={{ fontSize:13, color:'var(--text4)', background:'none', border:'none', cursor:'pointer', padding:'4px 8px', fontFamily:'var(--font)' }}
                >
                  {ko ? '구독 취소' : 'Cancel subscription'}
                </button>
              </div>
            )}

            {/* 닫기 버튼 (비구독) */}
            {!isActive && (
              <div style={{ display:'flex', justifyContent:'center', marginTop:10, paddingBottom:2 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ fontSize:13, color:'var(--text4)', background:'none', border:'none', cursor:'pointer', padding:'4px 8px', fontFamily:'var(--font)' }}
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
          <div onClick={() => setCancelOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:10000 }} />
          <div style={{
            position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
            zIndex:10001, background:'var(--bg2)', borderRadius:20, padding:'26px 22px',
            width:'min(320px,90vw)', textAlign:'center',
          }}>
            <div style={{ fontSize:17, fontWeight:700, color:'var(--text)', marginBottom:8 }}>
              {ko ? '구독을 취소할까요?' : 'Cancel subscription?'}
            </div>
            <div style={{ fontSize:14, color:'var(--text3)', marginBottom:22, lineHeight:1.5 }}>
              {ko ? '현재 기간이 끝나면 Premium 기능을 더 이상 사용할 수 없어요.' : "You'll lose access to Premium features at the end of the current period."}
            </div>
            <div className="popup-actions popup-actions--icons" style={{ marginTop:0, marginBottom:0, paddingTop:4 }}>
              <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={() => setCancelOpen(false)} aria-label={ko?'구독 유지':'Keep subscription'}>
                <X size={22} strokeWidth={2.2} />
              </button>
              <span className="popup-actions-spacer" aria-hidden />
              <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={handleCancel} disabled={cancelling} aria-label={ko?'구독 취소 확정':'Confirm cancel'}>
                {cancelling ? <span className="spin" style={{ width:22, height:22 }} /> : <Check size={22} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
