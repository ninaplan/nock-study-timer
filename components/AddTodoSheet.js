'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';
import { Loader2, X, Check } from 'lucide-react';

export default function AddTodoSheet({ t, onSave, onClose, editingTodo }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateKey());
  /** Edit only: string so empty field (no leading 0 to delete). */
  const [focusMinStr, setFocusMinStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const sheetRootRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (editingTodo) {
      setName(editingTodo.name || '');
      setDate(editingTodo.date || localDateKey());
      const a = Math.max(0, Number(editingTodo.accum ?? 0) || 0);
      setFocusMinStr(a === 0 ? '' : String(a));
    } else {
      setName('');
      setDate(localDateKey());
      setFocusMinStr('');
    }
  }, [editingTodo]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 320);
  }, [closing, onClose]);

  useEffect(() => {
    const t0 = setTimeout(() => ref.current?.focus(), 200);
    return () => clearTimeout(t0);
  }, [editingTodo]);

  const syncKeyboardOffset = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) {
      setKbOffset(0);
      return;
    }
    const overlap = Math.max(0, window.innerHeight - vv.height);
    setKbOffset(overlap > 48 ? overlap : 0);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    vv.addEventListener('resize', syncKeyboardOffset);
    vv.addEventListener('scroll', syncKeyboardOffset);
    syncKeyboardOffset();
    return () => {
      vv.removeEventListener('resize', syncKeyboardOffset);
      vv.removeEventListener('scroll', syncKeyboardOffset);
    };
  }, [syncKeyboardOffset]);

  const scrollFieldIntoView = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        el.scrollIntoView(true);
      }
    });
  }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const accumMin = editingTodo
        ? Math.max(0, parseInt(focusMinStr, 10) || 0)
        : 0;
      await onSave(name.trim(), date, { accumMin });
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <div
        className="backdrop"
        onClick={requestClose}
        style={{
          opacity: entered && !closing ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
      />
      <div
        ref={sheetRootRef}
        className="sheet"
        style={{
          transform: entered && !closing ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100%)',
          transition: 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)',
          animation: 'none',
        }}
      >
        <div className="sheet-handle" aria-hidden />
        <div className="sheet-topbar">
          <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={requestClose} aria-label={t.cancel}>
            <X size={22} strokeWidth={2.2} />
          </button>
          <span className="sheet-topbar-title">{editingTodo ? t.editTodo : t.addTodo}</span>
          <button
            type="button"
            className="nav-circle-btn nav-circle-btn--confirm"
            onClick={save}
            disabled={!name.trim() || saving}
            aria-label={t.save}
          >
            {saving ? <Loader2 size={22} strokeWidth={2.2} style={{ animation: '_spin .8s linear infinite' }} /> : <Check size={22} strokeWidth={2.5} />}
          </button>
        </div>

        <div
          ref={bodyRef}
          className="sheet-body"
          style={{
            paddingBottom: `max(${Math.max(28, 20 + kbOffset)}px, calc(env(safe-area-inset-bottom) + 20px))`,
            transition: 'padding-bottom .18s ease',
          }}
        >
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'center' }}>
              <input
                ref={ref}
                className="sheet-form-select-plain"
                style={{ width: '100%', textAlign: 'left', textAlignLast:'left', fontWeight: 500, fontSize: 18 }}
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={scrollFieldIntoView}
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoWhenLabel}</span>
              <span className="sheet-form-select-plain" style={{ fontSize: 17, fontWeight: 500, textAlign:'right', opacity:.55 }}>
                {t.featureComingSoon}
              </span>
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoGoalLabel}</span>
              <span className="sheet-form-select-plain" style={{ fontSize: 17, fontWeight: 500, textAlign:'right', opacity:.55 }}>
                {t.featureComingSoon}
              </span>
            </div>
            {editingTodo && (
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.focusTimeMinLabel || t.fieldAccum}</span>
              <input
                className="sheet-form-select-plain sheet-form-accum-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="0"
                value={focusMinStr}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setFocusMinStr(v);
                }}
              />
            </div>
            )}
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.date}</span>
              <input
                className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                style={{ fontSize: 16, maxWidth: '100%' }}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
