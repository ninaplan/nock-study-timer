'use client';
import { useState, useLayoutEffect, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateKey } from '@/app/lib/dateUtils';
import { hapticLight } from './lib/haptics';

function ymFromYmd(dateStr) {
  const m = typeof dateStr === 'string' ? dateStr.match(/^(\d{4})-(\d{2})/) : null;
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]) - 1 };
}

function padYmd(y, mo0, day) {
  return `${y}-${String(mo0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(v, delta) {
  const d = new Date(v.y, v.mo + delta, 1);
  return { y: d.getFullYear(), mo: d.getMonth() };
}

/**
 * 홈 상단 날짜 라벨 anchor 바로 아래에 붙는 월 그리드(포털).
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.RefObject<HTMLElement>} props.anchorRef
 * @param {string} props.selectedDate — YYYY-MM-DD
 * @param {(ymd: string) => void} props.onSelectDate
 * @param {boolean} props.ko
 * @param {(ymd: string) => string} [props.pickAriaLabel] — 날짜 셀 `aria-label`
 * @param {string} [props.dismissLabel] — 스크린용 스크림 라벨
 * @param {boolean} [props.showJumpToday] — «오늘» 이동(해당 월로 스크롤 + 날짜 선택)
 * @param {string} [props.jumpTodayLabel] — `showJumpToday`일 때 버튼 문구·aria-label
 * @param {string} [props.ariaLabel] — dialog `aria-label` (기본: 날짜 선택 / Choose date)
 */
export default function HomeTopDatePopover({
  open,
  onClose,
  anchorRef,
  selectedDate,
  onSelectDate,
  ko,
  pickAriaLabel,
  dismissLabel,
  showJumpToday = false,
  jumpTodayLabel,
  ariaLabel,
}) {
  const panelRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(() => {
    const p = ymFromYmd(localDateKey());
    if (p && Number.isFinite(p.y) && Number.isFinite(p.mo)) return { y: p.y, mo: p.mo };
    const now = new Date();
    return { y: now.getFullYear(), mo: now.getMonth() };
  });

  useEffect(() => {
    if (!open) return;
    const p = ymFromYmd(selectedDate || localDateKey());
    if (p && Number.isFinite(p.y) && Number.isFinite(p.mo)) setVisible({ y: p.y, mo: p.mo });
  }, [open, selectedDate]);

  const place = useCallback(() => {
    if (!open || typeof window === 'undefined') return;
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const ar = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth || 296;
    const ph = panel.offsetHeight || 300;
    const pad = Math.max(
      8,
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-screen-x')) || 14
    );
    let top = ar.bottom + 6;
    let left = ar.left + ar.width / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const half = pw / 2;
    left = Math.max(pad + half, Math.min(vw - pad - half, left));
    if (top + ph > vh - pad) top = Math.max(pad, ar.top - ph - 6);
    setCoords({ top, left });
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => place());
    };
    place();
    raf = requestAnimationFrame(place);
    window.addEventListener('resize', run);
    window.addEventListener('scroll', run, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', run);
      window.removeEventListener('scroll', run, true);
    };
  }, [open, place, visible.y, visible.mo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const jumpToToday = useCallback(() => {
    hapticLight();
    const tk = localDateKey();
    const p = ymFromYmd(tk);
    if (p && Number.isFinite(p.y) && Number.isFinite(p.mo)) setVisible({ y: p.y, mo: p.mo });
    onSelectDate(tk);
  }, [onSelectDate]);

  const today = localDateKey();
  const vy = Number.isFinite(visible.y) ? visible.y : new Date().getFullYear();
  const vm = Number.isFinite(visible.mo) ? visible.mo : new Date().getMonth();
  const title = ko
    ? `${vy}년 ${vm + 1}월`
    : new Date(vy, vm, 15).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDow = new Date(vy, vm, 1).getDay();
  const dim = new Date(vy, vm + 1, 0).getDate();
  const weekLabels = ko ? ['일', '월', '화', '수', '목', '금', '토'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const slots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let day = 1; day <= dim; day++) arr.push({ day, dateStr: padYmd(vy, vm, day) });
    const rows = Math.ceil(arr.length / 7);
    const total = Math.min(42, rows * 7);
    while (arr.length < total) arr.push(null);
    return arr;
  }, [vy, vm, dim, firstDow]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className="home-top-date-popover-scrim"
        tabIndex={-1}
        aria-label={dismissLabel || (ko ? '닫기' : 'Close')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (ko ? '날짜 선택' : 'Choose date')}
        className="home-top-date-popover"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          transform: 'translateX(-50%)',
          zIndex: 270,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="home-top-date-popover-head">
          <button
            type="button"
            className="home-top-date-popover-nav"
            aria-label={ko ? '이전 달' : 'Previous month'}
            onClick={() => {
              hapticLight();
              setVisible((v) => shiftMonth(v, -1));
            }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} aria-hidden />
          </button>
          <div className="home-top-date-popover-title">{title}</div>
          <button
            type="button"
            className="home-top-date-popover-nav"
            aria-label={ko ? '다음 달' : 'Next month'}
            onClick={() => {
              hapticLight();
              setVisible((v) => shiftMonth(v, 1));
            }}
          >
            <ChevronRight size={22} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        {showJumpToday && jumpTodayLabel ? (
          <div className="home-top-date-popover-today-row">
            <button
              type="button"
              className="home-top-date-popover-today-btn"
              onClick={jumpToToday}
              aria-label={jumpTodayLabel}
            >
              {jumpTodayLabel}
            </button>
          </div>
        ) : null}
        <div className="home-top-date-popover-weekdays" aria-hidden>
          {weekLabels.map((w, i) => (
            <div key={`w-${String(i)}`} className="home-top-date-popover-weekday">
              {w}
            </div>
          ))}
        </div>
        <div className="home-top-date-popover-grid">
          {slots.map((cell, idx) =>
            cell == null ? (
              <div key={`e-${String(idx)}`} className="home-top-date-popover-slot home-top-date-popover-slot--empty" />
            ) : (
              <button
                key={cell.dateStr}
                type="button"
                className={`home-top-date-popover-day${cell.dateStr === selectedDate ? ' is-selected' : ''}${
                  cell.dateStr === today ? ' is-today' : ''
                }`}
                aria-label={
                  pickAriaLabel
                    ? (() => {
                        try {
                          return pickAriaLabel(cell.dateStr);
                        } catch {
                          return cell.dateStr;
                        }
                      })()
                    : cell.dateStr
                }
                aria-pressed={cell.dateStr === selectedDate}
                onClick={() => {
                  hapticLight();
                  onSelectDate(cell.dateStr);
                }}
              >
                {cell.day}
              </button>
            )
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
