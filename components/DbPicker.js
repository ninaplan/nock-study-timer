'use client';
import { useState } from 'react';
import { Check, X, Database } from 'lucide-react';

export default function DbPicker({
  label,
  value,
  databases,
  onChange,
  placeholder,
  showDescription = false,
  nameFontSize = 18,
  /** Left column (TO-DO* 등) */
  labelFontSize = 18,
  /** 한 줄 레이아웃 · DB 아이콘 · 긴 이름 줄임표 */
  compact = true,
  /** 저장·속성 불러오기 중 */
  busy = false,
}) {
  const [open, setOpen] = useState(false);
  const selected = databases.find((db) => db.id === value);
  const faceText = selected ? selected.title : placeholder;

  return (
    <>
      {!compact && <label className="label">{label}</label>}

      <button
        type="button"
        onClick={() => !busy && setOpen(true)}
        disabled={busy}
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
          alignItems: compact ? 'center' : 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          opacity: busy ? 0.55 : 1,
          pointerEvents: busy ? 'none' : 'auto',
        }}
      >
        {compact ? (
          <>
            <div className="settings-row-icon" aria-hidden>
              <Database size={18} strokeWidth={2} color="var(--text3)" />
            </div>
            <span
              style={{
                fontSize: labelFontSize,
                fontWeight: 500,
                color: 'var(--text)',
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
                    fontWeight: 500,
                    color: selected ? 'var(--text)' : 'var(--text4)',
                  }}
                  title={faceText || ''}
                >
                  {faceText}
                </span>
                <span className="settings-chevron" aria-hidden>
                  ›
                </span>
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
                      fontWeight: 500,
                      color: 'var(--text)',
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
                        fontSize: 12,
                        color: 'var(--text4)',
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
                <span style={{ fontSize: 15, color: 'var(--text4)' }}>{placeholder}</span>
              )}
            </div>
            <span className="settings-chevron" aria-hidden style={{ flexShrink: 0 }}>
              ›
            </span>
          </>
        )}
      </button>

      {open && (
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
                <X size={22} strokeWidth={2.2} />
              </button>
              <span id="db-picker-popup-title" className="db-picker-popup-title">
                {label}
              </span>
              <span style={{ width: 44, flexShrink: 0 }} aria-hidden />
            </div>
            <div className="db-picker-popup-body">
              {databases.length === 0 && (
                <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text3)', fontSize: 14 }}>
                  데이터베이스가 없어요
                </div>
              )}
              {databases.map((db) => (
                <button
                  key={db.id}
                  type="button"
                  onClick={() => {
                    onChange(db.id);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 12px',
                    background: value === db.id ? 'var(--bg3)' : 'transparent',
                    border: 'none',
                    borderRadius: 10,
                    fontFamily: 'var(--font)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 2,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Database size={18} strokeWidth={2} color="var(--text3)" style={{ flexShrink: 0 }} aria-hidden />
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 500,
                        color: 'var(--text)',
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
            </div>
          </div>
        </>
      )}
    </>
  );
}
