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
          position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 9998,
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* 시트 */}
      <div
        className="welcome-sheet-panel"
        style={{
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: animateIn
            ? 'transform 0.46s cubic-bezier(0.32,1.1,0.32,1)'
            : 'transform 0.32s cubic-bezier(0.55,0.05,0.65,0.95)',
          willChange: 'transform',
        }}
      >
        <div className="sheet-handle-wrap" aria-hidden>
          <div className="sheet-handle" />
        </div>

        <div className="sheet-topbar">
          <button
            type="button"
            onClick={onClose}
            className="nav-circle-btn nav-circle-btn--dismiss"
            aria-label="닫기"
          >
            <X strokeWidth={2.25} aria-hidden />
          </button>
          <span className="sheet-topbar-title">순공타이머</span>
          <span className="sheet-topbar-spacer" aria-hidden />
        </div>

        <div
          ref={scrollRef}
          className="welcome-sheet-scroll"
        >
          <div className="welcome-sheet-body">
            <div className="sheet-form-card sheet-inset-pad">
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
              <strong style={{ fontWeight: 'var(--font-weight-bold)' }}>설정 → 오류 신고</strong>
              로 알려주세요.
              더 안정적이고 오래 쓸 수 있는 앱으로 계속 다듬어 나가겠습니다.
            </p>
            <p style={{ color: 'var(--color-text-tertiary)', marginBottom: 0 }}>
              — 노크 올림
            </p>
            </div>
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
