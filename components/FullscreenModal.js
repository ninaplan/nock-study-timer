'use client';
import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const TRANSITION_DURATION = 320;

/**
 * iOS Safari PWA 키보드 버그 없는 풀스크린 슬라이드업 모달.
 * framer-motion 없이 순수 CSS transition으로 애니메이션 처리.
 *
 * props: open, onClose, children, title
 * 선택: rightAction — 헤더 오른쪽에 렌더할 엘리먼트 (저장 버튼 등)
 */
export default function FullscreenModal({
  open = true,
  onClose,
  children,
  title,
  rightAction,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const closeTimerRef = useRef(null);
  const openedRef = useRef(false);

  // 입장 애니메이션: mount 또는 open=true 전환 시
  useEffect(() => {
    if (!open) {
      if (openedRef.current) {
        // 부모가 open=false로 바꾼 경우 퇴장 처리
        setIsVisible(false);
        closeTimerRef.current = setTimeout(onClose, TRANSITION_DURATION);
      }
      return;
    }
    openedRef.current = true;
    // 브라우저가 translateY(100%) 초기값을 한 프레임 그린 뒤 전환
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setIsVisible(true))
    );
    return () => cancelAnimationFrame(id);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  // body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.classList.add('nock-sheet-open');
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.classList.remove('nock-sheet-open');
      document.body.style.overflow = prev;
      document.body.style.overscrollBehavior = '';
    };
  }, [open]);

  const handleClose = () => {
    setIsVisible(false);
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(onClose, TRANSITION_DURATION);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      {/* 배경 오버레이 */}
      <div
        aria-hidden
        onClick={handleClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 0,
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${TRANSITION_DURATION}ms`,
        }}
      />

      {/* 모달 본체 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '92dvh',
          zIndex: 1,
          borderRadius: '20px 20px 0 0',
          background: 'var(--color-bg-app, #fff)',
          display: 'flex',
          flexDirection: 'column',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: `transform ${TRANSITION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          willChange: 'transform',
        }}
      >
        {/* 핸들바 */}
        <div
          className="sheet-handle-wrap"
          aria-hidden
          role="presentation"
          style={{ flexShrink: 0 }}
        >
          <div className="sheet-handle" />
        </div>

        {/* 헤더 */}
        <div className="sheet-topbar sheet-topbar--flush" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className="nav-circle-btn nav-circle-btn--dismiss"
            onClick={handleClose}
            aria-label="닫기"
          >
            <X strokeWidth={2.75} strokeLinecap="round" aria-hidden />
          </button>
          <span className="sheet-topbar-title">{title}</span>
          {rightAction ?? <span className="sheet-topbar-spacer" aria-hidden />}
        </div>

        {/* body 슬롯 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>

        {/* footer 안전 영역 */}
        <div
          style={{
            flexShrink: 0,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        />
      </div>
    </div>
  );
}
