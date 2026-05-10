'use client';
import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

const VIEW_PAD = 12;
const GAP = 8;

/**
 * iOS 설정 스타일 인라인 드롭다운 팝오버. 배경 딤 없이 바깥 탭 시 닫힘.
 *
 * @param {Object} props
 * @param {string[]} props.options
 * @param {string} [props.selected]
 * @param {(value: string) => void} props.onSelect
 * @param {React.ReactNode} props.children 트리거(탭 시 열림)
 */
export default function InlineDropdown({ options = [], selected, onSelect, children, className = '' }) {
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [{ left, top }, setPos] = useState({ left: 0, top: 0 });
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const listId = useRef(`inline-dd-${Math.random().toString(36).slice(2, 9)}`);

  const close = useCallback(() => setOpen(false), []);

  const measureAndPlace = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const ar = anchor.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let l = ar.right + GAP;
    let t = ar.top;
    const fitsRight = l + pr.width <= vw - VIEW_PAD;
    const fitsLeft = ar.left - GAP - pr.width >= VIEW_PAD;

    if (!fitsRight && fitsLeft) {
      l = ar.left - GAP - pr.width;
    } else if (!fitsRight && !fitsLeft) {
      l = Math.min(Math.max(VIEW_PAD, ar.left), vw - VIEW_PAD - pr.width);
      t = ar.bottom + GAP;
    }

    if (t + pr.height > vh - VIEW_PAD) {
      t = Math.max(VIEW_PAD, vh - VIEW_PAD - pr.height);
    }
    if (t < VIEW_PAD) t = VIEW_PAD;
    if (l < VIEW_PAD) l = VIEW_PAD;
    if (l + pr.width > vw - VIEW_PAD) l = vw - VIEW_PAD - pr.width;

    setPos({ left: l, top: t });
    setPlaced(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(false);
      return undefined;
    }
    setPlaced(false);
    const id = requestAnimationFrame(() => {
      measureAndPlace();
    });
    return () => cancelAnimationFrame(id);
  }, [open, options, measureAndPlace]);

  useEffect(() => {
    if (!open) return undefined;
    const bump = () => {
      setPlaced(false);
      requestAnimationFrame(() => measureAndPlace());
    };
    window.addEventListener('resize', bump);
    window.visualViewport?.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    return () => {
      window.removeEventListener('resize', bump);
      window.visualViewport?.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
    };
  }, [open, measureAndPlace]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      const el = e.target;
      if (anchorRef.current?.contains(el) || panelRef.current?.contains(el)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  const handleTrigger = (e) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const handleSelect = (value) => {
    onSelect?.(value);
    setOpen(false);
  };

  if (!Array.isArray(options) || options.length === 0) {
    return <span className={className}>{children}</span>;
  }

  const portal =
    typeof document !== 'undefined' &&
    open &&
    createPortal(
      <div
        ref={panelRef}
        className="inline-dd-panel"
        role="listbox"
        id={listId.current}
        style={{
          left,
          top,
          opacity: placed ? 1 : 0,
          pointerEvents: placed ? 'auto' : 'none',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ul className="inline-dd-list">
          {options.map((opt) => {
            const isSel = selected === opt;
            return (
              <li key={opt} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  className={`inline-dd-option${isSel ? ' inline-dd-option--selected' : ''}`}
                  onClick={() => handleSelect(opt)}
                >
                  <span className="inline-dd-check" aria-hidden>
                    {isSel ? (
                      <Check size={17} strokeWidth={2.75} className="inline-dd-check-icon" />
                    ) : null}
                  </span>
                  <span className="inline-dd-label">{opt}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body
    );

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-dd-anchor ${className}`.trim()}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId.current : undefined}
        onClick={handleTrigger}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {children}
      </span>
      {portal}
    </>
  );
}
