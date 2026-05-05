'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import HourWheelPicker from './HourWheelPicker';
import { getDayWindowStartMin, getDayWindowEndMin, clampMinOfDay } from '@/app/lib/dayWindow';
import { hapticLight } from './lib/haptics';

function snapToHourBoundary(min) {
  const h = Math.floor(clampMinOfDay(min) / 60) % 24;
  return h * 60;
}

export default function DayWindowDropdown({ open, onClose, onApply, settings, t, ko }) {
  const [startMin, setStartMin] = useState(6 * 60);
  const [endMin, setEndMin] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStartMin(snapToHourBoundary(getDayWindowStartMin(settings)));
    setEndMin(snapToHourBoundary(getDayWindowEndMin(settings)));
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSave = () => {
    hapticLight();
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
      <div className="backdrop" style={{ zIndex: 205 }} aria-hidden onClick={() => { hapticLight(); onClose(); }} />
      <div
        className="db-picker-popup day-window-popup-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.prefDayWindow}
        style={{ zIndex: 210 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="db-picker-popup-header">
          <button
            type="button"
            className="nav-circle-btn nav-circle-btn--dismiss"
            onClick={() => {
              hapticLight();
              onClose();
            }}
            aria-label={t.close}
          >
            <X size={22} strokeWidth={2.2} />
          </button>
          <span style={{ flex: 1, minWidth: 0 }} aria-hidden />
          <button
            type="button"
            className="nav-circle-btn nav-circle-btn--confirm"
            onClick={handleSave}
            aria-label={t.save}
          >
            <Check size={22} strokeWidth={2.4} />
          </button>
        </div>
        <div className="db-picker-popup-body day-window-popup-body">
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
        </div>
      </div>
    </>,
    document.body
  );
}
