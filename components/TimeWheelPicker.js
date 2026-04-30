'use client';
import { useEffect, useRef } from 'react';

const ITEM = 40;
const H_COL = 200;
const REPS = 5;

/**
 * Two-column hours (0–maxHours) + minutes (0–59), circular scroll.
 * maxHours=24 → 0…24 then wraps to 0.
 */
export default function TimeWheelPicker({ valueMin, onChange, maxHours = 24, ko = true }) {
  const hN = maxHours + 1;
  const mN = 60;
  const center = Math.floor(REPS / 2);

  const v = Math.max(0, Number(valueMin) || 0);
  const h = Math.min(maxHours, Math.floor(v / 60));
  const m = Math.min(59, v % 60);

  const hourRef = useRef(null);
  const minRef = useRef(null);
  const syncing = useRef(false);
  const snapTimer = useRef(null);
  const valueRef = useRef(v);
  valueRef.current = v;

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

  return (
    <div className="time-wheel" role="group" aria-label={ko ? '누적 시간' : 'Total time'}>
      <div className="time-wheel-labels">
        <span>{ko ? '시간' : 'hr'}</span>
        <span>{ko ? '분' : 'min'}</span>
      </div>
      <div className="time-wheel-inner">
        <div className="time-wheel-highlight" aria-hidden />
        <div
          ref={hourRef}
          className="time-wheel-col"
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
          className="time-wheel-col"
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
