'use client';
import { useEffect, useRef, useState } from 'react';
import { clampMinOfDay } from '@/app/lib/dayWindow';

const ITEM = 40;
const H_COL = 200;
const REPS = 5;

function clockParts(valueMinutes) {
  const v = clampMinOfDay(valueMinutes);
  const h = Math.floor(v / 60) % 24;
  const m = v % 60;
  return { h, m };
}

/**
 * Clock time: hours 0–23 + minutes 0–59 (minutes since midnight in/out).
 */
export default function ClockWheelPicker({
  valueMinutes,
  onChange,
  ko = true,
  variant = 'compact',
}) {
  const hN = 24;
  const mN = 60;
  const center = Math.floor(REPS / 2);

  const v = clampMinOfDay(valueMinutes);
  const { h, m } = clockParts(v);

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

      const cur = clampMinOfDay(valueRef.current);
      if (isHour) {
        onChange(wrapped * 60 + (cur % 60));
      } else {
        const curH = Math.floor(cur / 60) % 24;
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
      aria-label={ko ? '시·분' : 'Hours and minutes'}
    >
      <button
        type="button"
        className={`time-wheel-display-seg time-wheel-display-seg--h${activeSegment === 'h' ? ' is-active' : ''}`}
        onClick={() => setActiveSegment((s) => (s === 'h' ? null : 'h'))}
        aria-pressed={activeSegment === 'h'}
      >
        {ko ? `${h}시` : `${h}h`}
      </button>
      <button
        type="button"
        className={`time-wheel-display-seg time-wheel-display-seg--m${activeSegment === 'm' ? ' is-active' : ''}`}
        onClick={() => setActiveSegment((s) => (s === 'm' ? null : 'm'))}
        aria-pressed={activeSegment === 'm'}
      >
        {String(m).padStart(2, '0')}
      </button>
    </div>
  );

  const hourDim = activeSegment === 'm';
  const minDim = activeSegment === 'h';

  const wheelsOnly = variant === 'wheels';

  return (
    <div
      className={`time-wheel${wheelsOnly ? ' time-wheel--wheels-only' : ''}`}
      role="group"
      aria-label={ko ? '시각' : 'Time of day'}
    >
      {!wheelsOnly ? (
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
            <div key={`ch-${i}`} className="time-wheel-cell">
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
            <div key={`cm-${i}`} className="time-wheel-cell">
              {String(n).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
