'use client';
import { useState } from 'react';
import { ChevronDown, Check, X, Database } from 'lucide-react';

export default function DbPicker({
  label,
  value,
  databases,
  onChange,
  placeholder,
  showDescription = false,
  nameFontSize = 14,
  /** 한 줄 레이아웃 · DB 아이콘 · 긴 이름 줄임표 */
  compact = true,
}) {
  const [open, setOpen] = useState(false);
  const selected = databases.find((db) => db.id === value);

  return (
    <>
      {!compact && <label className="label">{label}</label>}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? 'db-picker-row' : ''}
        style={{
          width: '100%',
          padding: compact ? '13px 14px' : '13px 16px',
          background: compact ? 'transparent' : 'var(--bg3)',
          border: compact ? 'none' : '1.5px solid transparent',
          borderRadius: compact ? 0 : 'var(--r)',
          fontFamily: 'var(--font)',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        {compact ? (
          <>
            <Database size={18} strokeWidth={2} color="var(--text3)" style={{ flexShrink: 0 }} aria-hidden />
            <span
              style={{
                fontSize: 13,
                fontWeight: 400,
                color: 'var(--text3)',
                flex: '0 1 auto',
                maxWidth: '38%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: nameFontSize,
                fontWeight: 400,
                color: selected ? 'var(--text)' : 'var(--text4)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'right',
              }}
              title={selected?.title || ''}
            >
              {selected ? selected.title : placeholder}
            </span>
            <ChevronDown size={16} strokeWidth={2.1} color="var(--text3)" style={{ flexShrink: 0 }} />
          </>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              {selected ? (
                <>
                  <div
                    style={{
                      fontSize: nameFontSize,
                      fontWeight: 400,
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
            <ChevronDown size={16} strokeWidth={2.1} color="var(--text3)" style={{ flexShrink: 0 }} />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-topbar">
              <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={() => setOpen(false)} aria-label="닫기">
                <X size={22} strokeWidth={2.2} />
              </button>
              <span className="sheet-topbar-title">{label}</span>
              <span className="sheet-topbar-spacer" aria-hidden />
            </div>
            <div className="sheet-body" style={{ paddingTop: 0 }}>
              <div style={{ paddingBottom: 8 }}>
                {databases.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>
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
                      padding: '14px 16px',
                      background: value === db.id ? 'var(--bg3)' : 'transparent',
                      border: 'none',
                      borderRadius: 'var(--r)',
                      fontFamily: 'var(--font)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Database size={17} strokeWidth={2} color="var(--text3)" style={{ flexShrink: 0 }} aria-hidden />
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 400,
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
          </div>
        </>
      )}
    </>
  );
}
