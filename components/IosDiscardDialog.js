'use client';

import { useEffect, useState } from 'react';

/**
 * 미리 알림 등 iOS 확인 카드 비슷한 흐름: 배경 탭 유지 · 파괴적 액션 한 개
 */
export default function IosDiscardDialog({
  open,
  title,
  message,
  discardLabel,
  onDiscard,
  onKeep,
  zBase = 10040,
}) {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
      return () => cancelAnimationFrame(r);
    }
    setAnimateIn(false);
    const t = setTimeout(() => setVisible(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  if (!visible) return null;

  return (
    <>
      <div
        role="presentation"
        className="ios-discard-overlay"
        onClick={onKeep}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: zBase,
          background: animateIn ? 'var(--color-bg-overlay)' : 'transparent',
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.22s ease, background-color 0.22s ease',
        }}
      />
      <div
        className="ios-discard-center"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: zBase + 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 28px',
          pointerEvents: 'none',
        }}
      >
        <div
          className={`ios-discard-card${animateIn ? ' ios-discard-card--in' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-discard-title"
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: 'auto', width: '100%', maxWidth: 300 }}
        >
          <h2 id="ios-discard-title" className="ios-discard-title">
            {title}
          </h2>
          {message ? <p className="ios-discard-body">{message}</p> : null}
          <button type="button" className="ios-discard-action" onClick={onDiscard}>
            {discardLabel}
          </button>
        </div>
      </div>
    </>
  );
}
