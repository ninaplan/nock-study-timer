'use client';

import { useEffect, useRef, useState } from 'react';

/** visualViewport·window resize 연속 이벤트 종료 후 이 시간만큼 조용할 때 inset 반영 */
export const SHEET_KEYBOARD_INSET_DEBOUNCE_MS = 50;

/**
 * 키보드가 완전히 올라오기 전 중간 inset을 0으로 무시 (일시적 layout 떨림 방지).
 */
export const SHEET_MIN_KEYBOARD_INSET_PX = 20;

const MAX_H_BASE = 'calc(100dvh - var(--sheet-viewport-top-clearance))';

/** `:root`의 `--sheet-viewport-top-clearance` 계산(px) — 키보드 시 max-height 보강에 사용 */
export function readSheetViewportTopClearancePx() {
  if (typeof window === 'undefined') return 100;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--sheet-viewport-top-clearance').trim();
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  } catch {
    /* noop */
  }
  return 100;
}

/**
 * 바텀시트 dock: bottom = 키보드 inset, max-height로 상단 여유 + 키보드 반영.
 * 키보드 있을 때: calc에 더해 visualViewport 높이로 상한을 두어(100dvh 미축소 브라우저) 헤더가 잘리지 않게 함.
 */
export function getSheetDockMotionTarget(keyboardInsetPx = 0) {
  const k = Math.max(0, Math.round(Number(keyboardInsetPx) || 0));
  if (k === 0) {
    return { bottom: 0, maxHeight: MAX_H_BASE };
  }
  const calcMax = `calc(100dvh - var(--sheet-viewport-top-clearance) - ${k}px)`;
  if (typeof window !== 'undefined' && window.visualViewport) {
    const topC = readSheetViewportTopClearancePx();
    const capPx = Math.max(200, Math.floor(window.visualViewport.height - topC));
    return { bottom: k, maxHeight: `min(${calcMax}, ${capPx}px)` };
  }
  return { bottom: k, maxHeight: calcMax };
}

/**
 * visualViewport 기준 하단에 가려진 영역(키보드 등) 높이(px).
 * layout innerHeight - (offsetTop + height) 로 계산.
 */
export function readVisualViewportKeyboardInsetPx() {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const inset = window.innerHeight - vv.offsetTop - vv.height;
  return inset > SHEET_MIN_KEYBOARD_INSET_PX ? Math.round(inset) : 0;
}

/**
 * `enabled`일 때만 visualViewport·window resize·scroll를 디바운스해 inset 갱신.
 * (드로어 애니메이션·키보드 상승 중간값을 읽지 않도록 안정화 후 읽음)
 */
export function useSheetKeyboardInset(enabled = true) {
  const [insetPx, setInsetPx] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setInsetPx(0);
      return undefined;
    }

    const schedule = () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        setInsetPx(readVisualViewportKeyboardInsetPx());
      }, SHEET_KEYBOARD_INSET_DEBOUNCE_MS);
    };

    const vv = window.visualViewport;
    window.addEventListener('resize', schedule);
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      window.removeEventListener('resize', schedule);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
    };
  }, [enabled]);

  return insetPx;
}

/**
 * 시트 패널(fixed bottom) 공통: 키보드만큼 bottom 올림 + max-height.
 */
export function getSheetDockSurfaceStyle(keyboardInsetPx = 0) {
  return getSheetDockMotionTarget(keyboardInsetPx);
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
