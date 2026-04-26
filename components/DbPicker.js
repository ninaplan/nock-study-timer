'use client';
// DB 선택 커스텀 피커 — 이름 + 설명 2줄 표시
import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function DbPicker({
  label,
  value,
  databases,
  onChange,
  placeholder,
  showDescription = true,
  nameFontSize = 15,
}) {
  const [open, setOpen] = useState(false);
  const selected = databases.find(db => db.id === value);

  return (
    <>
      <label className="label">{label}</label>

      {/* 선택 트리거 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '13px 16px',
          background: 'var(--bg3)',
          border: '1.5px solid transparent',
          borderRadius: 'var(--r)',
          fontFamily: 'var(--font)',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <>
              <div
                style={{
                  fontSize: nameFontSize,
                  fontWeight: 600,
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selected.title}
              </div>
              {showDescription && selected.description && (
                <div style={{ fontSize: 12, color: 'var(--text4)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selected.description}
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: 15, color: 'var(--text4)' }}>{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} strokeWidth={2.1} color="var(--text3)" style={{ flexShrink: 0 }} />
      </button>

      {/* DB 목록 시트 */}
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="sheet">
            <div className="sheet-body">
              <div className="sheet-handle" />
              <div className="sheet-title">{label}</div>
              <div style={{ paddingBottom: 8 }}>
                {databases.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>
                    데이터베이스가 없어요
                  </div>
                )}
                {databases.map((db, i) => (
                  <button
                    key={db.id}
                    type="button"
                    onClick={() => { onChange(db.id); setOpen(false); }}
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                        {db.title}
                      </div>
                      {db.description && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, fontWeight: 400 }}>
                          {db.description}
                        </div>
                      )}
                    </div>
                    {value === db.id && (
                      <Check size={18} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="sheet-footer">
              <button className="btn btn-muted btn-md btn-full" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
