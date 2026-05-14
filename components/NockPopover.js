'use client';

/**
 * 앵커 기준 팝오버 셸 — 우상단 더보기(ActionPopover)와 동일한
 * 투명 풀스크린 닫기 레이어, 글래스 패널, ap-in/out 애니메이션, ESC, 스크롤·리사이즈 재배치.
 *
 * 트리거는 부모가 렌더링하고, open/onClose + getAnchorRect 또는 anchorRef로 연결한다.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => DOMRect | null | undefined} [props.getAnchorRect] — 앵커 rect (우선)
 * @param {import('react').RefObject<HTMLElement | null>} [props.anchorRef]
 * @param {'menu-end' | 'center-below' | 'stretch-center'} [props.placement]
 * @param {number} [props.width] — menu-end: 목표 폭(기본 260). stretch-center: 상한에만 쓰지 않고 내부 계산에 사용
 * @param {number} [props.stretchMinWidth] — stretch-center 기본 260
 * @param {number} [props.stretchExtraWidth] — stretch-center에서 앵커 너비 + 여백
 * @param {string} [props.dismissAriaLabel]
 * @param {string} [props.ariaLabel] — dialog 접근성 이름
 * @param {string} [props.panelClassName] — 패널에 추가 클래스 (콘텐츠·패딩용)
 * @param {string} [props.dismissClassName] — 닫기 버튼에 추가 클래스
 * @param {number} [props.zIndex] — 패널 z-index (닫기는 -1)
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
  /** 우상단 더보기와 동일: 앵커 오른쪽 끝 맞춤 */
  MENU_END: 'menu-end',
  /** 앵커 아래, 수평 중앙(translateX -50%) — 미니 달력 */
  CENTER_BELOW: 'center-below',
  /** 앵커 폭 + 여백과 최소 폭 중 큰 값, 수평 중앙 — 타임블록 할 일 피커 */
  STRETCH_CENTER: 'stretch-center',
};

function readAnchor(getAnchorRect, anchorRef, lastRectRef) {
  let raw = null;
  if (typeof getAnchorRect === 'function') raw = getAnchorRect() ?? null;
  if (!raw && anchorRef?.current && typeof anchorRef.current.getBoundingClientRect === 'function') {
    raw = anchorRef.current.getBoundingClientRect();
  }
  if (raw) lastRectRef.current = raw;
  return raw ?? lastRectRef.current;
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
  const [coords, setCoords] = useState(() => ({
    left: 0,
    top: 0,
    width: undefined,
    transform: undefined,
  }));
  const [mounted, setMounted] = useState(!!open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setMounted(true);
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
      return undefined;
    }
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
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

    let frame = null;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = readAnchor(getAnchorRect, anchorRef, lastAnchorRectRef);
        const panel = panelRef.current;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = VIEW_MARGIN;
        const approxH = panel?.offsetHeight || 200;
        const gap = GAP_DEFAULT;

        if (placement === 'center-below') {
          const pad = Math.max(
            8,
            Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-screen-x')) || 14
          );
          if (!anchor) {
            const pw = panel?.offsetWidth || 296;
            const top = margin + TOP_SAFE;
            const left = vw / 2;
            setCoords({ left, top, width: undefined, transform: 'translateX(-50%)' });
            return;
          }
          const pw = panel?.offsetWidth || 296;
          const ph = panel?.offsetHeight || 300;
          let top = anchor.bottom + gap;
          let left = anchor.left + anchor.width / 2;
          const half = pw / 2;
          left = Math.max(pad + half, Math.min(vw - pad - half, left));
          if (top + ph > vh - pad) top = Math.max(pad, anchor.top - ph - gap);
          setCoords({ left, top, width: undefined, transform: 'translateX(-50%)' });
          return;
        }

        if (placement === 'stretch-center') {
          const safeL = margin;
          const safeR = margin;
          if (!anchor) {
            const w = Math.min(300, vw - 2 * margin);
            const left = (vw - w) / 2;
            const top = Math.max(margin + TOP_SAFE, Math.min(vh * 0.14, vh - approxH - margin));
            setCoords({ left, top, width: w, transform: undefined });
            return;
          }
          const w = Math.min(
            Math.max(anchor.width + stretchExtraWidth, stretchMinWidth),
            vw - safeL - safeR
          );
          let left = anchor.left + (anchor.width - w) / 2;
          left = Math.min(Math.max(left, safeL), vw - safeR - w);
          let top = anchor.bottom + gap;
          if (top + approxH > vh - margin) {
            top = anchor.top - approxH - gap;
          }
          if (top < margin + TOP_SAFE) top = margin + TOP_SAFE;
          if (top + approxH > vh - margin) {
            top = Math.max(margin + TOP_SAFE, vh - approxH - margin);
          }
          setCoords({ left, top, width: w, transform: undefined });
          return;
        }

        /* menu-end */
        const targetW = widthProp ?? MENU_DEFAULT_W;
        const w = Math.min(targetW, vw - margin * 2);
        if (!anchor) {
          setCoords({ left: vw - w - margin, top: margin + TOP_SAFE, width: w, transform: undefined });
          return;
        }
        let left = anchor.right - w;
        left = Math.min(Math.max(left, margin), vw - w - margin);
        let top = anchor.bottom + gap;
        if (top + approxH > vh - margin) top = anchor.top - approxH - gap;
        if (top < margin + TOP_SAFE) top = margin + TOP_SAFE;
        if (top + approxH > vh - margin) top = Math.max(margin + TOP_SAFE, vh - approxH - margin);
        setCoords({ left, top, width: w, transform: undefined });
      });
    };

    position();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : null;
    if (panelRef.current) ro?.observe(panelRef.current);
    window.addEventListener('resize', position);
    const scrollHost = typeof document !== 'undefined' ? document.querySelector('.shell .content') : null;
    scrollHost?.addEventListener('scroll', position, { passive: true });
    window.addEventListener('scroll', position, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      scrollHost?.removeEventListener('scroll', position);
      window.removeEventListener('scroll', position, true);
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

  if (!mounted || typeof document === 'undefined') return null;

  const panelCls = [
    'nock-popover-panel',
    closing ? 'nock-popover-panel--closing' : '',
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
