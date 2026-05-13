'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { localDateKey } from '@/app/lib/dateUtils';
import { useSheetStackScrollFade } from './lib/useSheetStackScrollFade';

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
  const scrollRef = useRef(null);
  useSheetStackScrollFade(scrollRef, open);
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
        <div ref={scrollRef} className="sheet-stack-scroll">
          <div className="sheet-stack-head">
            <div className="sheet-handle-wrap" aria-hidden>
              <div className="sheet-handle" />
            </div>
            <div className="sheet-topbar sheet-topbar--flush">
              <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={onClose} aria-label={t.cancel}>
                <X strokeWidth={2.75} strokeLinecap="round" aria-hidden />
              </button>
              <span className="sheet-topbar-title">{t.statsCustomSection}</span>
              <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={handleApply} aria-label={t.statsApply}>
                <Check strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
              </button>
            </div>
          </div>
        <div className="sheet-body sheet-body--safe-bottom sheet-body--stacked">
          <p className="sheet-hint-text">{t.statsCustomHint}</p>
          <div className="sheet-form-card">
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
          {error ? <div className="sheet-field-error-text">{error}</div> : null}
        </div>
        </div>
      </div>
    </>
  );
}
