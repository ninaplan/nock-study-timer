'use client';
import { useEffect, useRef } from 'react';
import { clampMinOfDay } from '@/app/lib/dayWindow';

const ITEM = 40;
const H_COL = 200;
const REPS = 5;

function hourFromMinutes(valueMinutes) {
  const v = clampMinOfDay(valueMinutes);
  return Math.floor(v / 60) % 24;
}

/**
 * 시(0–23)만 선택; 저장값은 항상 정각(분 0).
 */
export default function HourWheelPicker({ valueMinutes, onChange, ko = true }) {
  const hN = 24;
  const center = Math.floor(REPS / 2);

  const v = clampMinOfDay(valueMinutes);
  const h = hourFromMinutes(v);

  const hourRef = useRef(null);
  const syncing = useRef(false);
  const snapTimer = useRef(null);

  const idxToScroll = (i) => i * ITEM - (H_COL / 2 - ITEM / 2);
  const scrollToIdx = (t) => Math.round((t + H_COL / 2 - ITEM / 2) / ITEM);

  useEffect(() => {
    const he = hourRef.current;
    if (!he) return;
    syncing.current = true;
    he.scrollTop = idxToScroll(center * hN + h);
    const timer = setTimeout(() => {
      syncing.current = false;
    }, 80);
    return () => clearTimeout(timer);
  }, [h, hN, center]);

  const snapColumn = (el) => {
    if (!el || syncing.current) return;
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const rawIdx = scrollToIdx(el.scrollTop);
      const wrapped = ((rawIdx % hN) + hN) % hN;
      syncing.current = true;
      el.scrollTo({ top: idxToScroll(center * hN + wrapped), behavior: 'smooth' });
      setTimeout(() => {
        syncing.current = false;
      }, 420);
      onChange(wrapped * 60);
    }, 80);
  };

  const hoursItems = Array.from({ length: REPS * hN }, (_, i) => i % hN);

  return (
    <div className="time-wheel time-wheel--wheels-only time-wheel--hour-only" role="group" aria-label={ko ? '시각(시)' : 'Hour'}>
      <div className="time-wheel-inner">
        <div className="time-wheel-highlight" aria-hidden />
        <div
          ref={hourRef}
          className="time-wheel-col"
          onScroll={() => snapColumn(hourRef.current)}
        >
          {hoursItems.map((n, i) => (
            <div key={`ch-${i}`} className="time-wheel-cell">
              {String(n).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
