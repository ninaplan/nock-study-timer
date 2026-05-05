'use client';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import HourWheelPicker from './HourWheelPicker';
import { getDayWindowStartMin, getDayWindowEndMin, clampMinOfDay } from '@/app/lib/dayWindow';

function snapToHourBoundary(min) {
  const h = Math.floor(clampMinOfDay(min) / 60) % 24;
  return h * 60;
}

export default function DayWindowDropdown({
  open,
  onClose,
  onApply,
  settings,
  anchorRef,
  t,
  ko,
}) {
  const [startMin, setStartMin] = useState(6 * 60);
  const [endMin, setEndMin] = useState(0);
  const panelRef = useRef(null);
  const [box, setBox] = useState({ top: 0, left: 0, width: 320 });

  useEffect(() => {
    if (!open) return;
    setStartMin(snapToHourBoundary(getDayWindowStartMin(settings)));
    setEndMin(snapToHourBoundary(getDayWindowEndMin(settings)));
  }, [open, settings]);

  const layout = useCallback(() => {
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    if (!anchor || typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const panelW = Math.min(340, window.innerWidth - 24);
    let left = rect.right - panelW;
    left = Math.max(12, Math.min(left, window.innerWidth - panelW - 12));
    let top = rect.bottom + 8;
    const ph = panel?.offsetHeight ?? 300;
    if (top + ph > window.innerHeight - 12) {
      top = Math.max(12, rect.top - ph - 8);
    }
    setBox({ top, left, width: panelW });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    layout();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => layout());
    });
    const onWin = () => layout();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, layout, startMin, endMin]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSave = () => {
    const sm = snapToHourBoundary(startMin);
    const em = snapToHourBoundary(endMin);
    onApply({
      dayWindowStartMin: sm,
      dayWindowEndMin: em,
      dayWindowStart: Math.floor(sm / 60) % 24,
      dayWindowEnd: Math.floor(em / 60) % 24,
    });
    onClose();
  };

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <>
      <div
        className="backdrop"
        style={{ zIndex: 205 }}
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="day-window-dropdown-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-window-dropdown-title"
        style={{
          position: 'fixed',
          zIndex: 210,
          top: box.top,
          left: box.left,
          width: box.width,
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div id="day-window-dropdown-title" className="day-window-dropdown-title">
          {t.prefDayWindow}
        </div>
        <div className="day-window-wheel-grid">
          <div className="day-window-wheel-block">
            <div className="day-window-wheel-caption">{t.prefDayStart}</div>
            <HourWheelPicker valueMinutes={startMin} onChange={setStartMin} ko={ko} />
          </div>
          <div className="day-window-wheel-block">
            <div className="day-window-wheel-caption">{t.prefDayEnd}</div>
            <HourWheelPicker valueMinutes={endMin} onChange={setEndMin} ko={ko} />
          </div>
        </div>
        <div className="day-window-dropdown-footer">
          <button type="button" className="btn btn-dark btn-md btn-full" onClick={handleSave}>
            {t.save}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
