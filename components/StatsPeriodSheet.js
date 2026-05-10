'use client';
import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { localDateKey } from '@/app/lib/dateUtils';

/** Bottom sheet: start/end date only. */
export default function StatsPeriodSheet({
  open,
  onClose,
  onApply,
  appliedPeriod,
  appliedCustomStart,
  appliedCustomEnd,
  t,
  getPresetRange,
}) {
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (appliedPeriod === 'custom' && appliedCustomStart && appliedCustomEnd) {
      setDraftStart(appliedCustomStart);
      setDraftEnd(appliedCustomEnd);
    } else {
      const r = getPresetRange('thisWeek');
      setDraftStart(r.start);
      setDraftEnd(r.end);
    }
  }, [open, appliedPeriod, appliedCustomStart, appliedCustomEnd, getPresetRange]);

  const onChangeStart = (v) => {
    setDraftStart(v);
    setError('');
  };

  const onChangeEnd = (v) => {
    setDraftEnd(v);
    setError('');
  };

  const handleApply = () => {
    let start = draftStart;
    let end = draftEnd;
    if (!start || !end) {
      setError(t.statsPeriodInvalidRange);
      return;
    }
    if (start > end) {
      const z = start;
      start = end;
      end = z;
    }
    onApply({ period: 'custom', start, end });
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
            <X size={18} strokeWidth={2.2} />
          </button>
          <span className="sheet-topbar-title">{t.statsCustomSection}</span>
          <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={handleApply} aria-label={t.statsApply}>
            <Check size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="sheet-body" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <p style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 12, lineHeight: 1.45 }}>{t.statsCustomHint}</p>
          <div className="sheet-form-card" style={{ marginBottom: 12 }}>
            <div className="sheet-form-row">
              <span className="sheet-form-label">{t.statsPeriodStart}</span>
              <input
                type="date"
                className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                value={draftStart}
                onChange={(e) => onChangeStart(e.target.value)}
              />
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label">{t.statsPeriodEnd}</span>
              <input
                type="date"
                className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                value={draftEnd}
                onChange={(e) => onChangeEnd(e.target.value)}
                max={localDateKey()}
              />
            </div>
          </div>
          {error ? (
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>{error}</div>
          ) : null}
        </div>
      </div>
    </>
  );
}
