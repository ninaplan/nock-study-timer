'use client';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Log / Settings 등 앱 상단에서 열리는 풀-하이트 바텀 시트 (SubscribeSheet와 유사한 이징)
 * 패널 상·하단은 경계로 갈수록 불투명해지는 그라데이션( globals.css )
 */
export default function ChromeBottomSheet({ open, onClose, title, children, closeLabel, trailing }) {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
      return () => cancelAnimationFrame(raf);
    }
    setAnimateIn(false);
    const t = setTimeout(() => setVisible(false), 360);
    return () => clearTimeout(t);
  }, [open]);

  if (!visible) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-bg-overlay)',
          zIndex: 9990,
          opacity: animateIn ? 1 : 0,
          transition: animateIn ? 'opacity 0.28s ease' : 'opacity 0.3s ease',
        }}
        aria-hidden
      />
      <div
        className="chrome-bottom-sheet-panel chrome-bottom-sheet-panel--docked"
        style={{
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: animateIn
            ? 'transform 0.5s cubic-bezier(0.34, 1.2, 0.32, 1)'
            : 'transform 0.34s cubic-bezier(0.55, 0.05, 0.65, 0.95)',
          willChange: 'transform',
        }}
      >
        <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--top" aria-hidden />
        <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--bottom" aria-hidden />
        <div className="chrome-bottom-sheet-header">
          <div className="chrome-bottom-sheet-handle-wrap">
            <div className="chrome-bottom-sheet-handle" aria-hidden />
          </div>
          <div className="chrome-bottom-sheet-title-row sheet-topbar--flush">
            <button
              type="button"
              className="nav-circle-btn nav-circle-btn--dismiss"
              onClick={onClose}
              aria-label={closeLabel || 'Close'}
            >
              <X strokeWidth={2.75} aria-hidden strokeLinecap="round" />
            </button>
            <span className="chrome-bottom-sheet-title">{title}</span>
            {trailing ?? <span className="chrome-bottom-sheet-title-spacer" aria-hidden />}
          </div>
        </div>
        <div className="chrome-bottom-sheet-body">
          {children}
        </div>
      </div>
    </>
  );
}
