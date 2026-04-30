'use client';
import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { localDateKey } from '@/app/lib/dateUtils';

const PRESETS = ['thisWeek', 'thisMonth', 'thisYear'];

/**
 * 기간 설정 바텀시트 — 심플 칩 디자인:
 * [ 이번주 | 이번달 | 올해 | 직접 설정 ]
 * 직접 설정 선택 시 날짜 입력 2개만 표시
 */
export default function StatsPeriodSheet({
  open,
  onClose,
  onApply,
  weekStart,
  appliedPeriod,
  appliedCustomStart,
  appliedCustomEnd,
  statPeriodLabels,
  t,
  getPresetRange,
}) {
  const ko = t?.logPeriodLabel === '기간';
  const [draftPreset, setDraftPreset] = useState(null); // null = custom
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

  const selectCustom = () => {
    setDraftPreset(null);
    setError('');
    // 기본값: 지난 7일
    if (!draftStart) {
      const s = new Date();
      s.setDate(s.getDate() - 6);
      setDraftStart(localDateKey(s));
    }
    if (!draftEnd) {
      setDraftEnd(localDateKey());
    }
  };

  const onChangeStart = (v) => { setDraftPreset(null); setDraftStart(v); setError(''); };
  const onChangeEnd   = (v) => { setDraftPreset(null); setDraftEnd(v);   setError(''); };

  const handleApply = () => {
    let start = draftStart;
    let end   = draftEnd;
    if (!start || !end) { setError(t.statsPeriodInvalidRange); return; }
    if (start > end) { [start, end] = [end, start]; }
    if (draftPreset) {
      onApply({ period: draftPreset });
    } else {
      onApply({ period: 'custom', start, end });
    }
    onClose();
  };

  if (!open) return null;

  const chips = [
    ...PRESETS.map((p) => ({ id: p, label: statPeriodLabels[p], isPreset: true })),
    { id: 'custom', label: ko ? '직접 설정' : 'Custom', isPreset: false },
  ];

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

        <div className="sheet-body" style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}>

          {/* 기간 칩 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {chips.map(({ id, label, isPreset }) => {
              const active = isPreset ? draftPreset === id : draftPreset === null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => isPreset ? selectPreset(id) : selectCustom()}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 999,
                    border: active ? '2px solid var(--text)' : '1.5px solid var(--sep)',
                    background: active ? 'var(--text)' : 'transparent',
                    color: active ? 'var(--bg)' : 'var(--text2)',
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    transition: 'background .15s, color .15s, border-color .15s',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 직접 설정 날짜 입력 */}
          {draftPreset === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text3)',
                  width: 36,
                  flexShrink: 0,
                }}>
                  {t.statsPeriodStart}
                </span>
                <input
                  type="date"
                  className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                  value={draftStart}
                  onChange={(e) => onChangeStart(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text3)',
                  width: 36,
                  flexShrink: 0,
                }}>
                  {t.statsPeriodEnd}
                </span>
                <input
                  type="date"
                  className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                  value={draftEnd}
                  onChange={(e) => onChangeEnd(e.target.value)}
                  max={localDateKey()}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 14 }}>{error}</div>
          )}
        </div>
      </div>
    </>
  );
}
