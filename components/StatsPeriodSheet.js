'use client';
import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { localDateKey } from '@/app/lib/dateUtils';

const PRESETS = ['thisWeek', 'thisMonth', 'thisYear'];

/** Bottom sheet: presets + start/end dates. */
export default function StatsPeriodSheet({
  open,
  onClose,
  onApply,
  appliedPeriod,
  appliedCustomStart,
  appliedCustomEnd,
  statPeriodLabels,
  t,
  getPresetRange,
}) {
  const [draftPreset, setDraftPreset] = useState(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (appliedPeriod === 'custom' && appliedCustomStart && appliedCustomEnd) {
      setDraftPreset(null);
      setDraftStart(appliedCustomStart);
      setDraftEnd(appliedCustomEnd);
    } else if (appliedPeriod && appliedPeriod !== 'custom') {
      setDraftPreset(appliedPeriod);
      const r = getPresetRange(appliedPeriod);
      setDraftStart(r.start);
      setDraftEnd(r.end);
    } else {
      const r = getPresetRange('thisWeek');
      setDraftPreset('thisWeek');
      setDraftStart(r.start);
      setDraftEnd(r.end);
    }
  }, [open, appliedPeriod, appliedCustomStart, appliedCustomEnd, getPresetRange]);

  const selectPreset = (p) => {
    setDraftPreset(p);
    const r = getPresetRange(p);
    setDraftStart(r.start);
    setDraftEnd(r.end);
    setError('');
  };

  const onChangeStart = (v) => {
    setDraftPreset(null);
    setDraftStart(v);
    setError('');
  };

  const onChangeEnd = (v) => {
    setDraftPreset(null);
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
    if (draftPreset) {
      onApply({ period: draftPreset });
    } else {
      onApply({ period: 'custom', start, end });
    }
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
          <span className="sheet-topbar-title">{t.logPeriodLabel}</span>
          <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={handleApply} aria-label={t.statsApply}>
            <Check size={22} strokeWidth={2.5} />
          </button>
        </div>
        <div className="sheet-body" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>{t.statsPresetSection}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => selectPreset(p)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: draftPreset === p ? '2px solid var(--text)' : '1.5px solid var(--sep)',
                  background: draftPreset === p ? 'var(--bg3)' : 'var(--bg2)',
                  fontFamily: 'var(--font)',
                  fontSize: 16,
                  fontWeight: draftPreset === p ? 700 : 500,
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {statPeriodLabels[p]}
              </button>
            ))}
          </div>

          <div
            style={{
              height: 1,
              background: 'var(--sep)',
              marginBottom: 16,
            }}
          />

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>{t.statsCustomSection}</div>
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
