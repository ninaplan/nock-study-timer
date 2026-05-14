'use client';

/**
 * 앵커 기준 팝오버 셸 — 우상단 더보기(ActionPopover)와 동일한
 * 투명 풀스크린 닫기 레이어, 글래스 패널, ap-in/out 애니메이션, ESC, 스크롤·리사이즈 재배치.
 *
 * 위치: useLayoutEffect에서 동기 측정(첫 페인트 전). rAF는 스크롤/리사이즈 디바운스용만 사용.
 * 첫 레이아웃 확정 전에는 `nock-popover-panel--awaiting-layout`으로 숨겨 (0,0) 플래시 방지.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => DOMRect | null | undefined} [props.getAnchorRect]
 * @param {import('react').RefObject<HTMLElement | null>} [props.anchorRef]
 * @param {'menu-end' | 'center-below' | 'stretch-center'} [props.placement]
 * @param {number} [props.width]
 * @param {number} [props.stretchMinWidth]
 * @param {number} [props.stretchExtraWidth]
 * @param {string} [props.dismissAriaLabel]
 * @param {string} [props.ariaLabel]
 * @param {string} [props.panelClassName]
 * @param {string} [props.dismissClassName]
 * @param {number} [props.zIndex]
 * @param {import('react').ReactNode} props.children
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const CLOSE_MS = 280;
const MENU_DEFAULT_W = 260;
const VIEW_MARGIN = 10;
const TOP_SAFE = 44;
const GAP_DEFAULT = 6;

/** @enum {string} */
export const NOCK_POPOVER_PLACEMENT = {
  MENU_END: 'menu-end',
  CENTER_BELOW: 'center-below',
  STRETCH_CENTER: 'stretch-center',
};

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

/** 레이아웃 뷰포트(모바일 주소창·visualViewport 반영) */
function readViewportSize() {
  if (typeof window === 'undefined') return { vw: 390, vh: 800 };
  const vv = window.visualViewport;
  const vw = Math.max(1, Math.round(vv?.width ?? window.innerWidth ?? document.documentElement.clientWidth ?? 1));
  const vh = Math.max(1, Math.round(vv?.height ?? window.innerHeight ?? document.documentElement.clientHeight ?? 1));
  return { vw, vh };
}


function readAnchor(getAnchorRect, anchorRef, lastRectRef) {
  let raw = null;
  if (typeof getAnchorRect === 'function') raw = getAnchorRect() ?? null;
  if (!raw && anchorRef?.current && typeof anchorRef.current.getBoundingClientRect === 'function') {
    raw = anchorRef.current.getBoundingClientRect();
  }
  if (raw) lastRectRef.current = raw;
  return raw ?? lastRectRef.current;
}

/** 수직: 아래/위 중 들어가는 쪽 선택, 둘 다 안 되면 여백이 큰 쪽 + clamp */
function pickVerticalTop({ anchor, ph, gap, pad, vh, preferBelowFirst }) {
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - ph - gap;
  const spaceBelow = vh - pad - belowTop;
  const spaceAbove = aboveTop - pad;
  const fitsBelow = ph <= spaceBelow;
  const fitsAbove = ph <= spaceAbove;

  let top;
  if (fitsBelow && fitsAbove) {
    top = preferBelowFirst ? belowTop : aboveTop;
  } else if (fitsBelow) {
    top = belowTop;
  } else if (fitsAbove) {
    top = aboveTop;
  } else if (spaceBelow >= spaceAbove) {
    top = belowTop;
  } else {
    top = aboveTop;
  }
  const maxTop = Math.max(pad, vh - pad - ph);
  return clamp(top, pad, maxTop);
}

export default function NockPopover({
  open,
  onClose,
  getAnchorRect,
  anchorRef,
  placement = 'menu-end',
  width: widthProp,
  stretchMinWidth = 260,
  stretchExtraWidth = 20,
  dismissAriaLabel = '닫기',
  ariaLabel,
  panelClassName = '',
  dismissClassName = '',
  zIndex = 220,
  children,
}) {
  const panelRef = useRef(null);
  const lastAnchorRectRef = useRef(null);
  const rafScrollRef = useRef(0);
  /** `center-below` 적용 직전 계산값 — paint 이후 콘솔 디버그용 */
  const centerBelowDebugRef = useRef(null);
  const [coords, setCoords] = useState(() => ({
    left: 0,
    top: 0,
    width: undefined,
    transform: undefined,
  }));
  const [coordsPositioned, setCoordsPositioned] = useState(false);
  const [mounted, setMounted] = useState(!!open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setMounted(true);
      setCoordsPositioned(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open && mounted) setClosing(true);
  }, [open, mounted]);

  useEffect(() => {
    if (!closing) return undefined;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) {
      setMounted(false);
      setClosing(false);
      setCoordsPositioned(false);
      return undefined;
    }
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      setCoordsPositioned(false);
    }, CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!mounted || typeof window === 'undefined') return undefined;

    const margin = VIEW_MARGIN;
    const gap = GAP_DEFAULT;

    const applyPosition = () => {
      const { vw, vh } = readViewportSize();
      const pad = Math.max(
        margin,
        Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-screen-x')) || 14
      );

      const anchor = readAnchor(getAnchorRect, anchorRef, lastAnchorRectRef);
      const panel = panelRef.current;
      const measuredW = panel?.offsetWidth ?? 0;
      const measuredH = panel?.offsetHeight ?? 0;

      const setBoth = (next) => {
        setCoords(next);
        setCoordsPositioned(true);
      };

      if (placement === 'center-below') {
        console.log('[NockPopover] center-below applyPosition (unconditional)', {
          placement,
          panelExists: !!panel,
          mounted,
        });
        const rect = panel?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
        const pw = Math.max(1, Math.ceil(Number(rect.width) || 0) || measuredW || 296);
        const ph = Math.max(1, Math.ceil(Number(rect.height) || 0) || measuredH || 280);

        const lo = pad;
        const hi = Math.max(lo, vw - pw - pad);

        /* 가로: 항상 뷰포트 중앙(앵커는 위아래 배치만 참고) */
        let left = vw / 2 - pw / 2;
        left = clamp(left, lo, hi);

        const top = anchor
          ? pickVerticalTop({
              anchor,
              ph,
              gap,
              pad,
              vh,
              preferBelowFirst: true,
            })
          : pad + TOP_SAFE;

        const visualLeft = left;
        const visualRight = left + pw;

        centerBelowDebugRef.current = {
          phase: !anchor ? 'no-anchor' : 'with-anchor',
          horizontal: 'viewport-center',
          vw,
          vh,
          pad,
          pw,
          ph,
          rectWidthRaw: rect.width,
          rectHeightRaw: rect.height,
          measuredW,
          measuredH,
          lo,
          hi,
          left,
          top,
          visualLeft,
          visualRight,
          anchor: !anchor
            ? null
            : {
                left: anchor.left,
                top: anchor.top,
                right: anchor.right,
                bottom: anchor.bottom,
                width: anchor.width,
                height: anchor.height,
              },
        };

        setBoth({
          left,
          top,
          width: undefined,
          transform: undefined,
        });
        return;
      }

      if (placement === 'stretch-center') {
        const approxH = Math.max(measuredH || 260, 1);
        const safeL = pad;
        const safeR = pad;
        if (!anchor) {
          const w = Math.min(Math.max(stretchMinWidth, 260), vw - safeL - safeR);
          const left = (vw - w) / 2;
          const top = clamp(margin + TOP_SAFE, pad, vh - approxH - pad);
          setBoth({ left, top, width: w, transform: undefined });
          return;
        }

        let w = Math.min(
          Math.max(anchor.width + stretchExtraWidth, stretchMinWidth),
          vw - safeL - safeR
        );
        w = clamp(w, stretchMinWidth, vw - safeL - safeR);

        let left = anchor.left + (anchor.width - w) / 2;
        left = clamp(left, safeL, vw - safeR - w);

        const top = pickVerticalTop({
          anchor,
          ph: approxH,
          gap,
          pad,
          vh,
          preferBelowFirst: true,
        });

        setBoth({ left, top, width: w, transform: undefined });
        return;
      }

      /* menu-end — 예전 ActionPopover와 동일한 정렬, 뷰포트 clamp + 수평 flip */
      const targetW = widthProp ?? MENU_DEFAULT_W;
      const w = clamp(Math.min(targetW, vw - margin * 2), 1, vw - margin * 2);
      const approxH = Math.max(measuredH || 180, 1);

      if (!anchor) {
        setBoth({
          left: vw - w - margin,
          top: margin + TOP_SAFE,
          width: w,
          transform: undefined,
        });
        return;
      }

      /* 기본: 패널 오른쪽 = 앵커 오른쪽 */
      let left = anchor.right - w;
      const fitsAsEnd = left >= margin && left + w <= vw - margin;
      if (!fitsAsEnd && anchor.left + w <= vw - margin) {
        /* 반대: 패널 왼쪽 = 앵커 왼쪽 */
        left = anchor.left;
      }
      left = clamp(left, margin, vw - w - margin);

      let top = pickVerticalTop({
        anchor,
        ph: approxH,
        gap,
        pad: margin,
        vh,
        preferBelowFirst: true,
      });
      top = Math.max(top, margin + TOP_SAFE);
      top = clamp(top, margin + TOP_SAFE, vh - margin - approxH);

      setBoth({ left, top, width: w, transform: undefined });
    };

    /* 동기 1회: 페인트 전 좌표 확정 (예전 ActionPopover의 rAF 한 프레임 지연 제거) */
    applyPosition();

    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      ro = new ResizeObserver(() => applyPosition());
      ro.observe(panelRef.current);
    }

    const scheduleScroll = () => {
      cancelAnimationFrame(rafScrollRef.current);
      rafScrollRef.current = requestAnimationFrame(() => applyPosition());
    };

    window.addEventListener('resize', scheduleScroll);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleScroll);
    vv?.addEventListener('scroll', scheduleScroll);

    const scrollHost = typeof document !== 'undefined' ? document.querySelector('.shell .content') : null;
    scrollHost?.addEventListener('scroll', scheduleScroll, { passive: true });
    window.addEventListener('scroll', scheduleScroll, true);

    return () => {
      cancelAnimationFrame(rafScrollRef.current);
      window.removeEventListener('resize', scheduleScroll);
      vv?.removeEventListener('resize', scheduleScroll);
      vv?.removeEventListener('scroll', scheduleScroll);
      scrollHost?.removeEventListener('scroll', scheduleScroll);
      window.removeEventListener('scroll', scheduleScroll, true);
      ro?.disconnect();
    };
  }, [
    mounted,
    getAnchorRect,
    anchorRef,
    placement,
    widthProp,
    stretchMinWidth,
    stretchExtraWidth,
  ]);

  /* center-below: 레이아웃·스타일 반영 후(다음 프레임들) 실제 화면 좌표 로깅 */
  useLayoutEffect(() => {
    if (
      placement !== 'center-below' ||
      typeof window === 'undefined' ||
      !open ||
      !mounted ||
      closing ||
      !coordsPositioned
    ) {
      return undefined;
    }

    let alive = true;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        if (!alive) return;
        const panelEl = panelRef.current;
        if (!panelEl) return;

        const rect = panelEl.getBoundingClientRect();
        const cs = window.getComputedStyle(panelEl);
        const vv = window.visualViewport;

        console.log('[NockPopover center-below] post-paint rect', {
          calculated: centerBelowDebugRef.current,
          boundingClientRect: {
            x: rect.x,
            y: rect.y,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          computedStylePosition: { left: cs.left, top: cs.top, transform: cs.transform, width: cs.width },
          appliedReactStyle: {
            left: coords.left,
            top: coords.top,
            width: coords.width,
            transform: coords.transform,
          },
          viewport: {
            visualViewport: vv
              ? {
                  width: vv.width,
                  height: vv.height,
                  offsetLeft: vv.offsetLeft,
                  offsetTop: vv.offsetTop,
                  scale: vv.scale,
                }
              : null,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            documentElementClientWidth: document.documentElement?.clientWidth,
            documentElementClientHeight: document.documentElement?.clientHeight,
          },
        });
      });
    });

    return () => {
      alive = false;
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [
    placement,
    open,
    mounted,
    closing,
    coordsPositioned,
    coords.left,
    coords.top,
    coords.width,
    coords.transform,
  ]);

  if (!mounted || typeof document === 'undefined') return null;

  const awaitingLayout = !closing && !coordsPositioned;

  const panelCls = [
    'nock-popover-panel',
    closing ? 'nock-popover-panel--closing' : '',
    awaitingLayout ? 'nock-popover-panel--awaiting-layout' : '',
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const node = (
    <>
      <button
        type="button"
        className={['nock-popover-dismiss', dismissClassName].filter(Boolean).join(' ')}
        style={{ zIndex: zIndex - 1 }}
        onClick={onClose}
        aria-label={dismissAriaLabel}
      />
      <div
        ref={panelRef}
        className={panelCls}
        style={{
          left: coords.left,
          top: coords.top,
          width: coords.width,
          transform: coords.transform,
          zIndex,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );

  return createPortal(node, document.body);
}
