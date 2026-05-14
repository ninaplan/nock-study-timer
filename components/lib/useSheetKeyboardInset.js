'use client';

import { useEffect, useRef, useState } from 'react';

/** visualViewport·window resize 연속 이벤트 종료 후 이 시간만큼 조용할 때 inset 반영 */
export const SHEET_KEYBOARD_INSET_DEBOUNCE_MS = 50;

/**
 * 키보드가 완전히 올라오기 전 중간 inset을 0으로 무시 (일시적 layout 떨림 방지).
 */
export const SHEET_MIN_KEYBOARD_INSET_PX = 20;

/**
 * `:root`의 `--sheet-viewport-top-clearance` 계산 결과(px). dock 레이아웃에 사용.
 */
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

const SHEET_DOCK_MIN_HEIGHT_PX = 160;

/**
 * 바텀시트 dock: 명목 높이 = layout에서 `height: calc(100dvh - topClearance)` 에 대응하는 px.
 * bottom = 키보드 inset. 상단이 topClearance 위로 넘어가면 top을 클램프하고 높이만 가용 세로에 맞춤.
 */
export function getSheetDockMotionTarget(keyboardInsetPx = 0) {
  if (typeof window === 'undefined') {
    return { bottom: 0, top: 100, height: 600 };
  }
  const k = Math.max(0, Math.round(Number(keyboardInsetPx) || 0));
  const inner = window.innerHeight;
  const topC = readSheetViewportTopClearancePx();
  const Hnom = Math.max(SHEET_DOCK_MIN_HEIGHT_PX, inner - topC);
  const naturalTop = inner - k - Hnom;

  if (naturalTop >= topC) {
    return { bottom: k, top: naturalTop, height: Hnom };
  }
  return {
    bottom: k,
    top: topC,
    height: Math.max(SHEET_DOCK_MIN_HEIGHT_PX, inner - topC - k),
  };
}

function subscribeSheetDockLayout(cb) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', cb);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', cb);
  vv?.addEventListener('scroll', cb);
  return () => {
    window.removeEventListener('resize', cb);
    vv?.removeEventListener('resize', cb);
    vv?.removeEventListener('scroll', cb);
  };
}

/**
 * getSheetDockMotionTarget와 동일하되, inset·layout viewport·visualViewport 변화 시 재계산.
 */
export function useSheetDockMotionTarget(keyboardInsetPx = 0) {
  const insetRef = useRef(keyboardInsetPx);
  insetRef.current = keyboardInsetPx;
  const [dock, setDock] = useState(() =>
    typeof window !== 'undefined' ? getSheetDockMotionTarget(keyboardInsetPx) : { bottom: 0, top: 100, height: 600 }
  );

  useEffect(() => {
    const sync = () => setDock(getSheetDockMotionTarget(insetRef.current));
    sync();
    return subscribeSheetDockLayout(sync);
  }, [keyboardInsetPx]);

  return dock;
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
 * 비-framer/폴백용: dock 높이·위치(명목 높이 + 키보드). (대부분 패널은 motion + getSheetDockMotionTarget 사용)
 */
export function getSheetDockSurfaceStyle(keyboardInsetPx = 0) {
  if (typeof window === 'undefined') {
    return { bottom: 0, top: 100, height: 'calc(100dvh - var(--sheet-viewport-top-clearance))' };
  }
  const t = getSheetDockMotionTarget(keyboardInsetPx);
  return {
    bottom: t.bottom,
    top: t.top,
    height: t.height,
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
