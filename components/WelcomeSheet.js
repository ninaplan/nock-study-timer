'use client';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { useSheetStackScrollFade } from './lib/useSheetStackScrollFade';
import { getSheetDockSurfaceStyle, useSheetKeyboardInset } from './lib/useSheetKeyboardInset';
import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_SPRING_CLOSE,
  SHEET_SPRING_OPEN,
  sheetPanelDragProps,
} from './lib/sheetMotion';

const WELCOME_KEY = 'nock_welcome_v1';

export default function WelcomeSheet({ visible, onClose }) {
  const scrollRef = useRef(null);
  const dragControls = useDragControls();
  useSheetStackScrollFade(scrollRef, visible);
  const keypadInset = useSheetKeyboardInset(visible);

  useEffect(() => {
    if (!visible) return undefined;
    const preventTouch = (e) => {
      if (scrollRef.current && scrollRef.current.contains(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventTouch, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventTouch);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="welcome-sheet-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SHEET_BACKDROP_TRANSITION}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--color-bg-overlay)',
              zIndex: 9998,
              animation: 'none',
            }}
          />
          <motion.div
            key="welcome-sheet-panel"
            className="welcome-sheet-panel"
            style={{
              ...getSheetDockSurfaceStyle(keypadInset),
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: SHEET_SPRING_CLOSE }}
            transition={SHEET_SPRING_OPEN}
            {...sheetPanelDragProps(dragControls, onClose)}
          >
            <div ref={scrollRef} className="sheet-stack-scroll">
              <div className="sheet-stack-head">
                <div
                  className="sheet-handle-wrap"
                  aria-hidden
                  onPointerDown={(e) => dragControls.start(e)}
                  role="presentation"
                >
                  <div className="sheet-handle" />
                </div>

                <div className="sheet-topbar sheet-topbar--flush">
                  <button
                    type="button"
                    onClick={onClose}
                    className="nav-circle-btn nav-circle-btn--dismiss"
                    aria-label="닫기"
                  >
                    <X strokeWidth={2.75} strokeLinecap="round" aria-hidden />
                  </button>
                  <span className="sheet-topbar-title">순공타이머</span>
                  <span className="sheet-topbar-spacer" aria-hidden />
                </div>
              </div>

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
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
