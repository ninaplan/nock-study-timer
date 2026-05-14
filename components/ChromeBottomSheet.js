'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getSheetDockSurfaceStyle, useSheetKeyboardInset } from './lib/useSheetKeyboardInset';
import { useSheetStackScrollFade } from './lib/useSheetStackScrollFade';

/**
 * Log / Settings 등 앱 상단에서 열리는 풀-하이트 바텀 시트 (SubscribeSheet와 유사한 이징)
 * 패널 상·하단은 경계로 갈수록 불투명해지는 그라데이션( globals.css )
 * — fixed는 .shell transform에 잡히지 않도록 기본 document.body 포털 + 스크롤 잠금.
 */
export default function ChromeBottomSheet({
  open,
  onClose,
  title,
  children,
  closeLabel,
  trailing,
  /** 피커형: 우측 X 없음 — 바깥 스크림만으로 닫기 */
  omitDismissButton,
  /** 제목 행 전체 커스텀(타임블록 피커 등). 있으면 omitDismissButton/title/trailing 무시 */
  customTitleRow,
  /** customTitleRow 행에 추가 클래스 */
  titleRowClassName,
  /** document.body 로 포털 (기본 true — 하단 아일랜드에 가려짐 방지) */
  portal = true,
  /** 열릴 때 body 스크롤 잠금 (뒷배경·셸 콘텐츠 스크롤 억제) */
  lockBodyScroll = true,
}) {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const scrollHostRef = useRef(null);
  useSheetStackScrollFade(scrollHostRef, open && visible);

  const keypadInset = useSheetKeyboardInset(open && visible);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(raf);
    }
    setAnimateIn(false);
    const t = setTimeout(() => setVisible(false), 340);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (!lockBodyScroll || !open) return undefined;
    const prev = document.body.style.overflow;
    document.documentElement.classList.add('nock-chrome-sheet-open');
    document.body.classList.add('nock-chrome-sheet-open');
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('nock-chrome-sheet-open');
      document.body.classList.remove('nock-chrome-sheet-open');
      document.body.style.overflow = prev;
    };
  }, [open, lockBodyScroll]);

  if (!visible) return null;

  const sheet = (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-bg-overlay)',
          zIndex: 9990,
          opacity: animateIn ? 1 : 0,
          transition: animateIn ? 'opacity 0.28s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'opacity 0.22s ease-out',
          touchAction: 'none',
        }}
        aria-hidden
      />
      <div
        className="chrome-bottom-sheet-panel chrome-bottom-sheet-panel--docked"
        style={{
          ...getSheetDockSurfaceStyle(keypadInset),
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: animateIn
            ? 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), bottom 0.22s ease, max-height 0.22s ease'
            : 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.2s ease, max-height 0.2s ease',
          willChange: 'transform',
        }}
      >
        <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--top" aria-hidden />
        <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--bottom" aria-hidden />
        <div ref={scrollHostRef} className="chrome-bottom-sheet-scroll-host">
          <div className="sheet-stack-head">
            <div className="chrome-bottom-sheet-handle-wrap">
              <div className="chrome-bottom-sheet-handle" aria-hidden />
            </div>
            <div
              className={[
                'chrome-bottom-sheet-title-row',
                'sheet-topbar--flush',
                titleRowClassName || '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {customTitleRow ? (
                customTitleRow
              ) : (
                <>
                  {omitDismissButton ? (
                    <span className="chrome-bottom-sheet-title-spacer" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      className="nav-circle-btn nav-circle-btn--dismiss"
                      onClick={onClose}
                      aria-label={closeLabel || 'Close'}
                    >
                      <X strokeWidth={2.75} aria-hidden strokeLinecap="round" />
                    </button>
                  )}
                  <span className="chrome-bottom-sheet-title">{title}</span>
                  {trailing ?? <span className="chrome-bottom-sheet-title-spacer" aria-hidden />}
                </>
              )}
            </div>
          </div>
          <div className="chrome-bottom-sheet-body">{children}</div>
        </div>
      </div>
    </>
  );

  if (portal && typeof document !== 'undefined') {
    return createPortal(sheet, document.body);
  }
  return sheet;
}
