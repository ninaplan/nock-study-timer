'use client';
import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import ClockWheelPicker from './ClockWheelPicker';
import { getDayWindowStartMin, getDayWindowEndMin, clampMinOfDay } from '@/app/lib/dayWindow';

export default function DayWindowTimeSheet({
  open,
  onClose,
  onApply,
  settings,
  t,
  ko,
}) {
  const [startMin, setStartMin] = useState(6 * 60);
  const [endMin, setEndMin] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStartMin(getDayWindowStartMin(settings));
    setEndMin(getDayWindowEndMin(settings));
  }, [open, settings]);

  const handleConfirm = () => {
    onApply({
      dayWindowStartMin: clampMinOfDay(startMin),
      dayWindowEndMin: clampMinOfDay(endMin),
      dayWindowStart: Math.floor(clampMinOfDay(startMin) / 60) % 24,
      dayWindowEnd: Math.floor(clampMinOfDay(endMin) / 60) % 24,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" aria-hidden />
        <div className="sheet-topbar">
          <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={onClose} aria-label={t.cancel}>
            <X size={22} strokeWidth={2.2} />
          </button>
          <span className="sheet-topbar-title">{t.prefDayWindow}</span>
          <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={handleConfirm} aria-label={t.save}>
            <Check size={22} strokeWidth={2.5} />
          </button>
        </div>
        <div className="sheet-body" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <p style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 14, lineHeight: 1.45 }}>{t.prefDayWindowHint}</p>
          <div className="day-window-wheel-grid">
            <div className="day-window-wheel-block">
              <div className="day-window-wheel-caption">{t.prefDayStart}</div>
              <ClockWheelPicker variant="wheels" valueMinutes={startMin} onChange={setStartMin} ko={ko} />
            </div>
            <div className="day-window-wheel-block">
              <div className="day-window-wheel-caption">{t.prefDayEnd}</div>
              <ClockWheelPicker variant="wheels" valueMinutes={endMin} onChange={setEndMin} ko={ko} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
