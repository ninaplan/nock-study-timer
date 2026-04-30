'use client';
import { useEffect, useRef } from 'react';

const ITEM = 40;
const PAD = 80;

/** Two-column hours (0–maxH) + minutes (0–59). `valueMin` / `onChange(totalMin)`. */
export default function TimeWheelPicker({ valueMin, onChange, maxHours = 99, ko = true }) {
  const hMax = Math.max(0, Math.min(maxHours, 999));
  const v = Math.max(0, Number(valueMin) || 0);
  const h = Math.min(hMax, Math.floor(v / 60));
  const m = Math.min(59, v % 60);

  const hourRef = useRef(null);
  const minRef = useRef(null);
  const settling = useRef(false);
  const settleTimer = useRef(null);
  const valueRef = useRef(v);
  valueRef.current = v;

  useEffect(() => {
    const he = hourRef.current;
    const me = minRef.current;
    if (!he || !me) return;
    settling.current = true;
    he.scrollTop = h * ITEM;
    me.scrollTop = m * ITEM;
    const t = setTimeout(() => {
      settling.current = false;
    }, 60);
    return () => clearTimeout(t);
  }, [h, m]);

  const snapColumn = (el, isHour) => {
    if (!el || settling.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM);
      const clamped = isHour ? Math.min(hMax, Math.max(0, idx)) : Math.min(59, Math.max(0, idx));
      el.scrollTo({ top: clamped * ITEM, behavior: 'smooth' });
      const cur = Math.max(0, Number(valueRef.current) || 0);
      if (isHour) {
        const curM = cur % 60;
        onChange(clamped * 60 + curM);
      } else {
        const curH = Math.min(hMax, Math.floor(cur / 60));
        onChange(curH * 60 + clamped);
      }
    }, 80);
  };

  const hours = Array.from({ length: hMax + 1 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="time-wheel" role="group" aria-label={ko ? '누적 시간' : 'Total time'}>
      <div className="time-wheel-labels">
        <span>{ko ? '시간' : 'hr'}</span>
        <span>{ko ? '분' : 'min'}</span>
      </div>
      <div className="time-wheel-highlight" aria-hidden />
      <div className="time-wheel-inner">
        <div
          ref={hourRef}
          className="time-wheel-col"
          onScroll={() => snapColumn(hourRef.current, true)}
        >
          <div style={{ height: PAD }} />
          {hours.map((n) => (
            <div key={`h-${n}`} className="time-wheel-cell">
              {n}
            </div>
          ))}
          <div style={{ height: PAD }} />
        </div>
        <div
          ref={minRef}
          className="time-wheel-col"
          onScroll={() => snapColumn(minRef.current, false)}
        >
          <div style={{ height: PAD }} />
          {minutes.map((n) => (
            <div key={`m-${n}`} className="time-wheel-cell">
              {String(n).padStart(2, '0')}
            </div>
          ))}
          <div style={{ height: PAD }} />
        </div>
      </div>
    </div>
  );
}
