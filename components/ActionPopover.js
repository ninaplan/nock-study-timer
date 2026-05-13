'use client';

/**
 * iOS 26 Notes 스타일 앵커 팝오버 메뉴.
 * 딤 없음 · 바깥 탭 닫기 · Escape · 서브페이지 슬라이드 내비게이션.
 *
 * pages 구조:
 *   [
 *     {                              // 루트 페이지 (index 0)
 *       sections: [
 *         { type: 'list', items: [
 *             { icon, label, onPress?, submenuPage?, checked?, destructive? }
 *         ]},
 *         { type: 'radio', value, onChange, items: [{ label, value }] },
 *         { type: 'custom', render: () => <JSX/> },
 *       ]
 *     },
 *     { title: '서브페이지', sections: [...] },  // index 1+
 *   ]
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { hapticLight } from './lib/haptics';

export default function ActionPopover({
  open,
  onClose,
  /** () => DOMRect | null — 앵커 요소의 getBoundingClientRect() */
  getAnchorRect,
  pages = [],
  dismissAriaLabel,
}) {
  const panelRef = useRef(null);
  const lastAnchorRectRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0, width: 250 });
  const [mounted, setMounted] = useState(!!open);
  const [closing, setClosing] = useState(false);
  /** 현재 보이는 페이지 인덱스 */
  const [pageIdx, setPageIdx] = useState(0);
  /** 슬라이드 방향: 'forward' | 'back' | null */
  const [slideDir, setSlideDir] = useState(null);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setMounted(true);
      setPageIdx(0);
      setSlideDir(null);
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
    if (reduced) { setMounted(false); setClosing(false); return undefined; }
    const t = window.setTimeout(() => { setMounted(false); setClosing(false); }, 280);
    return () => window.clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!mounted || typeof window === 'undefined') return undefined;
    let frame = null;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const fromFn = typeof getAnchorRect === 'function' ? getAnchorRect() : null;
        if (fromFn) lastAnchorRectRef.current = fromFn;
        const anchor = fromFn ?? lastAnchorRectRef.current;
        const panel = panelRef.current;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 10;
        const approxH = panel?.offsetHeight || 180;
        const w = Math.min(260, vw - margin * 2);

        if (!anchor) {
          setCoords({ left: vw - w - margin, top: margin + 50, width: w });
          return;
        }

        // 앵커 우측에 우측 정렬, 화면 밖 나가면 좌측으로 밀기
        let left = anchor.right - w;
        left = Math.min(Math.max(left, margin), vw - w - margin);

        let top = anchor.bottom + 6;
        if (top + approxH > vh - margin) top = anchor.top - approxH - 6;
        if (top < margin + 44) top = margin + 44;
        if (top + approxH > vh - margin) top = Math.max(margin + 44, vh - approxH - margin);

        setCoords({ left, top, width: w });
      });
    };

    position();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : null;
    if (panelRef.current) ro?.observe(panelRef.current);
    window.addEventListener('resize', position);
    const scrollHost = typeof document !== 'undefined' ? document.querySelector('.shell .content') : null;
    scrollHost?.addEventListener('scroll', position, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      scrollHost?.removeEventListener('scroll', position);
      ro?.disconnect();
    };
  }, [mounted, getAnchorRect, pageIdx]);

  const pushPage = useCallback((idx) => {
    hapticLight();
    setSlideDir('forward');
    setPageIdx(idx);
  }, []);

  const popPage = useCallback(() => {
    hapticLight();
    setSlideDir('back');
    setPageIdx(0);
  }, []);

  const handleItemPress = useCallback((item) => {
    if (item.submenuPage != null) {
      pushPage(item.submenuPage);
      return;
    }
    hapticLight();
    item.onPress?.();
    // 체크 토글 항목은 닫지 않음 — checked prop 있는 항목
    if (item.checked === undefined) onClose();
  }, [pushPage, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const currentPage = pages[pageIdx];
  const isRoot = pageIdx === 0;

  const slideClass = slideDir === 'forward'
    ? ' ap-page--slide-in-forward'
    : slideDir === 'back'
      ? ' ap-page--slide-in-back'
      : '';

  const node = (
    <>
      {/* 딤 없는 전면 닫기 버튼 */}
      <button
        type="button"
        className="ap-dismiss"
        onClick={onClose}
        aria-label={dismissAriaLabel ?? '닫기'}
      />
      <div
        ref={panelRef}
        className={`ap-panel${closing ? ' ap-panel--closing' : ''}`}
        style={{ left: coords.left, top: coords.top, width: coords.width }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 서브페이지 헤더 */}
        {!isRoot && (
          <div className="ap-subpage-header">
            <button
              type="button"
              className="ap-back-btn"
              onClick={popPage}
              aria-label="뒤로"
            >
              <ChevronLeft size={17} strokeWidth={2.5} aria-hidden />
            </button>
            <span className="ap-subpage-title">{currentPage?.title ?? ''}</span>
          </div>
        )}

        {/* 현재 페이지 콘텐츠 */}
        <div
          key={pageIdx}
          className={`ap-page-content${slideClass}`}
          onAnimationEnd={() => setSlideDir(null)}
        >
          {currentPage?.sections?.map((section, si) => (
            <div key={si}>
              {si > 0 && <div className="ap-separator" role="separator" />}

              {section.type === 'list' && (
                <div className="ap-list-section">
                  {section.items?.map((item, ii) => (
                    <button
                      key={ii}
                      type="button"
                      className={`ap-row${item.destructive ? ' ap-row--destructive' : ''}`}
                      onClick={() => handleItemPress(item)}
                    >
                      {item.icon != null && (
                        <span className="ap-row-icon" aria-hidden>{item.icon}</span>
                      )}
                      <span className="ap-row-label">{item.label}</span>
                      {item.checked !== undefined && (
                        <span className="ap-row-end" aria-hidden>
                          {item.checked
                            ? <Check size={16} strokeWidth={2.5} className="ap-row-check-icon" />
                            : <span className="ap-row-check-placeholder" />}
                        </span>
                      )}
                      {item.submenuPage != null && (
                        <ChevronRight size={15} strokeWidth={2} className="ap-row-chevron" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {section.type === 'radio' && (
                <div className="ap-list-section">
                  {section.items?.map((item, ii) => (
                    <button
                      key={ii}
                      type="button"
                      className="ap-row"
                      onClick={() => {
                        hapticLight();
                        section.onChange?.(item.value);
                      }}
                    >
                      <span className="ap-row-label">{item.label}</span>
                      <span className="ap-row-end" aria-hidden>
                        {section.value === item.value
                          ? <Check size={16} strokeWidth={2.5} className="ap-row-check-icon" />
                          : <span className="ap-row-check-placeholder" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {section.type === 'custom' && (
                <div className="ap-custom-section">
                  {section.render?.()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return createPortal(node, document.body);
}
