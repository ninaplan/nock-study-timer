'use client';
import { useState, useLayoutEffect } from 'react';
import { Check, X, Database } from 'lucide-react';
import { hapticLight } from './lib/haptics';
import { prefersNativeSettingsSelect, IosInlineSelect } from './lib/nativeForm';

export default function DbPicker({
  label,
  value,
  databases,
  onChange,
  placeholder,
  showDescription = false,
  nameFontSize = 18,
  labelFontSize = 18,
  LeadingIcon = Database,
  compact = true,
  busy = false,
  expandBelow = false,
}) {
  const [open, setOpen] = useState(false);
  const [useNativeIos, setUseNativeIos] = useState(false);
  useLayoutEffect(() => {
    setUseNativeIos(prefersNativeSettingsSelect());
  }, []);

  const selected = databases.find((db) => db.id === value);
  const faceText = selected ? selected.title : placeholder;
  const inlineExpand = Boolean(compact && expandBelow && !useNativeIos);

  const pickDb = (id) => {
    onChange(id);
    setOpen(false);
  };

  const nativeOptions = databases.map((db) => ({
    value: db.id,
    label: typeof db.title === 'string' ? db.title.trim() || db.id : db.id,
  }));

  /** iOS 시스템 피커: 모달 팝업·아래 펼침 없이 행 우측 `<select>` 로 통일 */
  if (compact && useNativeIos) {
    const v = typeof value === 'string' ? value.trim() : '';
    const mergedOptions =
      databases.length === 0
        ? [{ value: '', label: placeholder || '—' }]
        : [{ value: '', label: placeholder || '\u2014' }, ...nativeOptions];

    const faceExtra = selected
      ? {
          fontSize: nameFontSize,
          fontWeight: 'var(--font-weight-regular)',
          color: 'var(--color-text-secondary)',
        }
      : {
          fontSize: nameFontSize,
          fontWeight: 'var(--font-weight-regular)',
          color: 'var(--color-text-tertiary)',
        };

    return (
      <div
        role="presentation"
        className="list-row notion-field-map-row db-picker-compact"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          opacity: busy ? 0.55 : 1,
          pointerEvents: busy ? 'none' : 'auto',
        }}
      >
        <div className="settings-row-icon" aria-hidden>
          <LeadingIcon size={18} strokeWidth={2} color="var(--color-text-tertiary)" />
        </div>
        <span
          style={{
            fontSize: labelFontSize,
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)',
            flex: '0 1 48%',
            minWidth: 0,
            maxWidth: '52%',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.2,
          }}
        >
          {label}
        </span>
        <div className="notion-field-map-right" style={{ minWidth: 0, flexShrink: 0 }}>
          <IosInlineSelect
            ariaLabel={label}
            value={mergedOptions.some((o) => o.value === v) ? v : ''}
            options={mergedOptions}
            disabled={busy}
            faceStyle={faceExtra}
            onChange={(e) => {
              hapticLight();
              onChange(e.target.value);
            }}
          />
        </div>
      </div>
    );
  }

  const renderDbOptions = () => (
    <>
      {databases.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 12px', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
          데이터베이스가 없어요
        </div>
      )}
      {databases.map((db) => (
        <button
          key={db.id}
          type="button"
          className={`db-picker-option-btn${value === db.id ? ' is-selected' : ''}`}
          onClick={() => pickDb(db.id)}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={18} strokeWidth={2} color="var(--color-text-tertiary)" style={{ flexShrink: 0 }} aria-hidden />
            <div
              style={{
                fontSize: 'inherit',
                fontWeight: 'inherit',
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={db.title}
            >
              {db.title}
            </div>
          </div>
          {value === db.id && <Check size={18} strokeWidth={2.1} style={{ flexShrink: 0 }} />}
        </button>
      ))}
    </>
  );

  return (
    <>
      {!compact && <label className="label">{label}</label>}

      <button
        type="button"
        onClick={() => {
          if (busy) return;
          if (inlineExpand) {
            hapticLight();
            setOpen((o) => !o);
          } else {
            setOpen(true);
          }
        }}
        disabled={busy}
        aria-expanded={inlineExpand ? open : undefined}
        className={compact ? 'list-row notion-field-map-row db-picker-compact' : ''}
        style={{
          width: '100%',
          padding: compact ? undefined : '13px 16px',
          background: compact ? 'transparent' : 'var(--bg3)',
          border: compact ? 'none' : '1.5px solid transparent',
          borderRadius: compact ? 0 : 'var(--r)',
          fontFamily: 'var(--font)',
          cursor: busy ? 'wait' : 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: compact ? 8 : 12,
          opacity: busy ? 0.55 : 1,
          pointerEvents: busy ? 'none' : 'auto',
        }}
      >
        {compact ? (
          <>
            <div className="settings-row-icon" aria-hidden>
              <LeadingIcon size={18} strokeWidth={2} color="var(--color-text-tertiary)" />
            </div>
            <span
              style={{
                fontSize: labelFontSize,
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
                flex: '0 1 48%',
                minWidth: 0,
                maxWidth: '52%',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                lineHeight: 1.2,
              }}
            >
              {label}
            </span>
            <div className="notion-field-map-right">
              <div className="settings-select-shell">
                <span
                  className="settings-select-face"
                  style={{
                    fontSize: nameFontSize,
                    fontWeight: 'var(--font-weight-regular)',
                    color: selected ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                  }}
                  title={faceText || ''}
                >
                  {faceText}
                </span>
                {inlineExpand ? (
                  <span
                    className="settings-chevron"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                      transform: open ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                    aria-hidden
                  >
                    ›
                  </span>
                ) : (
                  <span className="settings-chevron" aria-hidden>
                    ›
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              {selected ? (
                <>
                  <div
                    style={{
                      fontSize: nameFontSize,
                      fontWeight: 'var(--font-weight-regular)',
                      color: 'var(--color-text-tertiary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {selected.title}
                  </div>
                  {showDescription && selected.description && (
                    <div
                      style={{
                        fontSize: 'var(--font-size-caption)',
                        color: 'var(--color-text-tertiary)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {selected.description}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 'var(--font-size-subhead)', color: 'var(--color-text-tertiary)' }}>{placeholder}</span>
              )}
            </div>
            <span className="settings-chevron" aria-hidden style={{ flexShrink: 0 }}>
              ›
            </span>
          </>
        )}
      </button>

      {open && inlineExpand && (
        <div className="db-picker-inline-panel" role="listbox" aria-label={label}>
          {renderDbOptions()}
        </div>
      )}

      {open && !inlineExpand && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="db-picker-popup" role="dialog" aria-modal="true" aria-labelledby="db-picker-popup-title">
            <div className="db-picker-popup-header">
              <button
                type="button"
                className="nav-circle-btn nav-circle-btn--dismiss"
                onClick={() => setOpen(false)}
                aria-label="닫기"
              >
                <X strokeWidth={2.75} aria-hidden />
              </button>
              <span id="db-picker-popup-title" className="db-picker-popup-title">
                {label}
              </span>
              <span style={{ width: 44, flexShrink: 0 }} aria-hidden />
            </div>
            <div className="db-picker-popup-body">{renderDbOptions()}</div>
          </div>
        </>
      )}
    </>
  );
}
