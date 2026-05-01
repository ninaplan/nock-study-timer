'use client';
import { useEffect, useRef, useState } from 'react';

const ITEM = 40;
const H_COL = 200;
const REPS = 5;

export function durationParts(valueMin, maxHours) {
  const v = Math.max(0, Number(valueMin) || 0);
  const h = Math.min(maxHours, Math.floor(v / 60));
  const m = Math.min(59, v % 60);
  return { h, m };
}

/** Single-line label for collapsed rows (e.g. edit sheet summary). */
export function formatAccumMinutesLabel(minutes, maxHours = 24, ko = true) {
  const cap = maxHours * 60;
  const v = Math.max(0, Math.min(cap, Math.round(Number(minutes) || 0)));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return ko ? `${h}시간 ${m}분` : `${h}h ${m}m`;
}

/**
 * Two-column hours (0–maxHours) + minutes (0–59), circular scroll.
 * - `variant="compact"`: `N시간 M분` (or `Nh Mm`) centered above wheels; tap each part to emphasize that column.
 * - `variant="sheet"`: label row + duration display (legacy; prefer collapsed row + `wheels` in sheets).
 * - `variant="wheels"`: scroll columns only (expand-in sheet).
 */
export default function TimeWheelPicker({
  valueMin,
  onChange,
  maxHours = 24,
  ko = true,
  variant = 'compact',
  topLabel,
}) {
  const hN = maxHours + 1;
  const mN = 60;
  const center = Math.floor(REPS / 2);

  const v = Math.max(0, Number(valueMin) || 0);
  const { h, m } = durationParts(v, maxHours);

  const hourRef = useRef(null);
  const minRef = useRef(null);
  const syncing = useRef(false);
  const snapTimer = useRef(null);
  const valueRef = useRef(v);
  valueRef.current = v;

  const [activeSegment, setActiveSegment] = useState(null);

  const idxToScroll = (i) => i * ITEM - (H_COL / 2 - ITEM / 2);
  const scrollToIdx = (t) => Math.round((t + H_COL / 2 - ITEM / 2) / ITEM);

  useEffect(() => {
    const he = hourRef.current;
    const me = minRef.current;
    if (!he || !me) return;
    syncing.current = true;
    he.scrollTop = idxToScroll(center * hN + h);
    me.scrollTop = idxToScroll(center * mN + m);
    const timer = setTimeout(() => {
      syncing.current = false;
    }, 80);
    return () => clearTimeout(timer);
  }, [h, m, hN, mN, center]);

  const snapColumn = (el, isHour) => {
    if (!el || syncing.current) return;
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const N = isHour ? hN : mN;
      const rawIdx = scrollToIdx(el.scrollTop);
      const wrapped = ((rawIdx % N) + N) % N;
      syncing.current = true;
      el.scrollTo({ top: idxToScroll(center * N + wrapped), behavior: 'smooth' });
      setTimeout(() => {
        syncing.current = false;
      }, 420);

      const cur = Math.max(0, Number(valueRef.current) || 0);
      if (isHour) {
        onChange(wrapped * 60 + (cur % 60));
      } else {
        const curH = Math.min(maxHours, Math.floor(cur / 60));
        onChange(curH * 60 + wrapped);
      }
    }, 80);
  };

  const hoursItems = Array.from({ length: REPS * hN }, (_, i) => i % hN);
  const minuteItems = Array.from({ length: REPS * mN }, (_, i) => i % mN);

  const displayControls = (
    <div
      className="time-wheel-display time-wheel-display--duration"
      role="group"
      aria-label={ko ? '시간·분' : 'Hours and minutes'}
    >
      <button
        type="button"
        className={`time-wheel-display-seg time-wheel-display-seg--h${activeSegment === 'h' ? ' is-active' : ''}`}
        onClick={() => setActiveSegment((s) => (s === 'h' ? null : 'h'))}
        aria-pressed={activeSegment === 'h'}
      >
        {ko ? `${h}시간` : `${h}h`}
      </button>
      <button
        type="button"
        className={`time-wheel-display-seg time-wheel-display-seg--m${activeSegment === 'm' ? ' is-active' : ''}`}
        onClick={() => setActiveSegment((s) => (s === 'm' ? null : 'm'))}
        aria-pressed={activeSegment === 'm'}
      >
        {ko ? `${m}분` : `${m}m`}
      </button>
    </div>
  );

  const hourDim = activeSegment === 'm';
  const minDim = activeSegment === 'h';

  const isSheet = variant === 'sheet' && topLabel;
  const wheelsOnly = variant === 'wheels';

  return (
    <div
      className={`time-wheel${isSheet ? ' time-wheel--sheet' : ''}${wheelsOnly ? ' time-wheel--wheels-only' : ''}`}
      role="group"
      aria-label={ko ? '누적 시간' : 'Total time'}
    >
      {!wheelsOnly && isSheet ? (
        <div className="time-wheel-sheet-head">
          <span className="time-wheel-sheet-label">{topLabel}</span>
          {displayControls}
        </div>
      ) : null}
      {!wheelsOnly && !isSheet ? (
        <div className="time-wheel-display-row time-wheel-display-row--compact">{displayControls}</div>
      ) : null}

      <div className="time-wheel-inner">
        <div className="time-wheel-highlight" aria-hidden />
        <div
          ref={hourRef}
          className={`time-wheel-col${hourDim ? ' time-wheel-col--dim' : ''}${activeSegment === 'h' ? ' time-wheel-col--emph' : ''}`}
          onScroll={() => snapColumn(hourRef.current, true)}
        >
          {hoursItems.map((n, i) => (
            <div key={`h-${i}`} className="time-wheel-cell">
              {n}
            </div>
          ))}
        </div>
        <div
          ref={minRef}
          className={`time-wheel-col${minDim ? ' time-wheel-col--dim' : ''}${activeSegment === 'm' ? ' time-wheel-col--emph' : ''}`}
          onScroll={() => snapColumn(minRef.current, false)}
        >
          {minuteItems.map((n, i) => (
            <div key={`m-${i}`} className="time-wheel-cell">
              {String(n).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
