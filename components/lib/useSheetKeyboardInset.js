'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * visualViewport 기준 하단에 가려진 영역(키보드 등) 높이(px).
 * layout innerHeight - (offsetTop + height) 로 계산.
 */
export function readVisualViewportKeyboardInsetPx() {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const inset = window.innerHeight - vv.offsetTop - vv.height;
  return inset > 12 ? Math.round(inset) : 0;
}

/**
 * `enabled`일 때만 visualViewport·window resize 시 inset 갱신.
 */
export function useSheetKeyboardInset(enabled = true) {
  const [insetPx, setInsetPx] = useState(0);

  const sync = useCallback(() => {
    if (!enabled) {
      setInsetPx(0);
      return;
    }
    setInsetPx(readVisualViewportKeyboardInsetPx());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setInsetPx(0);
      return undefined;
    }
    const vv = window.visualViewport;
    sync();
    window.addEventListener('resize', sync);
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    return () => {
      window.removeEventListener('resize', sync);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, [enabled, sync]);

  return insetPx;
}

/**
 * 시트 패널(fixed bottom) 공통: 키보드만큼만 bottom 올림 + 상단 여유(--sheet-viewport-top-clearance) 반영 max-height.
 */
export function getSheetDockSurfaceStyle(keyboardInsetPx = 0) {
  const k = Math.max(0, Number(keyboardInsetPx) || 0);
  const maxH =
    k > 0
      ? `calc(100dvh - var(--sheet-viewport-top-clearance) - ${k}px)`
      : 'calc(100dvh - var(--sheet-viewport-top-clearance))';
  return {
    bottom: k,
    maxHeight: maxH,
  };
}

/** 스크롤 호스트 안에서 포커스 필드가 보이도록(키보드 위) */
export function scrollSheetFieldIntoView(fieldEl, { behavior = 'smooth' } = {}) {
  if (!fieldEl || typeof fieldEl.scrollIntoView !== 'function') return;
  requestAnimationFrame(() => {
    try {
      fieldEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
    } catch {
      try {
        fieldEl.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch {
        /* noop */
      }
    }
  });
}
