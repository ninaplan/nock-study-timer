'use client';
import { useState, useRef, useEffect } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';
import { Loader2 } from 'lucide-react';

export default function AddTodoSheet({ t, onSave, onClose, editingTodo }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateKey());
  /** Edit only: string so empty field (no leading 0 to delete). */
  const [focusMinStr, setFocusMinStr] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

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

  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, [editingTodo]);

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
      <div className="backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" aria-hidden />
        <div className="sheet-topbar">
          <button type="button" className="sheet-pill sheet-pill-muted" onClick={onClose}>
            {t.cancel}
          </button>
          <span className="sheet-topbar-title">{editingTodo ? t.editTodo : t.addTodo}</span>
          <button
            type="button"
            className="sheet-pill sheet-pill-primary"
            onClick={save}
            disabled={!name.trim() || saving}
          >
            {saving ? <Loader2 size={16} strokeWidth={2.2} style={{ animation:'_spin .8s linear infinite' }} /> : t.save}
          </button>
        </div>

        <div className="sheet-body" style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}>
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'center' }}>
              <input
                ref={ref}
                className="sheet-form-select-plain"
                style={{ width: '100%', textAlign: 'left', textAlignLast:'left', fontWeight: 600, fontSize: 18 }}
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoWhenLabel}</span>
              <span className="sheet-form-select-plain" style={{ fontSize: 17, fontWeight: 600, textAlign:'right', opacity:.55 }}>
                {t.featureComingSoon}
              </span>
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoGoalLabel}</span>
              <span className="sheet-form-select-plain" style={{ fontSize: 17, fontWeight: 600, textAlign:'right', opacity:.55 }}>
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
