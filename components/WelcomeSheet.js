'use client';
import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const WELCOME_KEY = 'nock_welcome_v1';

export default function WelcomeSheet({ visible, onClose }) {
  const [animateIn, setAnimateIn] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (visible) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
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
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {/* 딤 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998,
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* 시트 */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: 'var(--bg)',
        borderRadius: '22px 22px 0 0',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        maxHeight: '88dvh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.14)',
        transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
        transition: animateIn
          ? 'transform 0.46s cubic-bezier(0.32,1.1,0.32,1)'
          : 'transform 0.32s cubic-bezier(0.55,0.05,0.65,0.95)',
        willChange: 'transform',
      }}>
        {/* 핸들 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg4)' }} aria-hidden />
        </div>

        {/* 헤더: X 버튼 왼쪽 */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px 4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            className="nav-circle-btn nav-circle-btn--dismiss"
            aria-label="닫기"
          >
            <X size={20} strokeWidth={2.3} />
          </button>
        </div>

        {/* 본문 */}
        <div
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          <div style={{ padding: '8px 28px 24px', fontSize: 18, lineHeight: 1.75, color: 'var(--text)' }}>
            <p style={{ marginBottom: '1.4em' }}>
              노크의 순공시간 스터디 플래너를 사용해주셔서 진심으로 감사드립니다.
            </p>
            <p style={{ marginBottom: '1.4em' }}>
              노션 플래너는 데이터가 자동으로 계산되고, 기록이 차곡차곡 쌓이고, 검색도 편리하다는 게 큰 매력이죠.
              그런데 막상 순공시간을 재려고 하면 조금 번거로웠잖아요.
              그 불편함을 덜어드리고 싶어서 순공 타이머 앱을 만들었습니다.
            </p>
            <p style={{ marginBottom: '1.4em' }}>
              아직 출시한 지 얼마 되지 않아, 모든 기기와 환경에서 충분히 테스트하지 못했어요.
              사용 중 예상치 못한 오류가 생기면 번거로우시더라도{' '}
              <strong style={{ fontWeight: 700 }}>설정 → 오류 신고</strong>
              로 알려주세요.
              더 안정적이고 오래 쓸 수 있는 앱으로 계속 다듬어 나가겠습니다.
            </p>
            <p style={{ color: 'var(--text3)', marginBottom: 0 }}>
              — 노크 올림
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/** localStorage에 기록이 없으면 true를 반환 (처음 방문 여부) */
export function shouldShowWelcome() {
  if (typeof window === 'undefined') return false;
  try { return !localStorage.getItem(WELCOME_KEY); } catch { return false; }
}

/** 확인 완료 표시 */
export function markWelcomeSeen() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch {}
}
