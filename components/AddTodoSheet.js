'use client';
import { useState, useRef, useEffect } from 'react';

export default function AddTodoSheet({ t, onSave, onClose }) {
  const [name, setName]     = useState('');
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [when, setWhen]     = useState('anytime');
  const [goal, setGoal]     = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave(name.trim(), date, { when, goal }); } catch {}
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
          <span className="sheet-topbar-title">{t.addTodo}</span>
          <button
            type="button"
            className="sheet-pill sheet-pill-primary"
            onClick={save}
            disabled={!name.trim() || saving}
          >
            {saving ? <span className="spin spin-dark" style={{ width: 16, height: 16 }} /> : t.save}
          </button>
        </div>

        <div className="sheet-body" style={{ paddingBottom: 'max(120px, env(safe-area-inset-bottom))' }}>
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'center' }}>
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoTitle}</span>
              <input
                ref={ref}
                className="sheet-form-select-plain"
                style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 18 }}
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoWhenLabel}</span>
              <select className="sheet-form-select-plain" style={{ fontSize: 17, fontWeight: 600, textAlignLast:'right' }} value={when} onChange={e => setWhen(e.target.value)}>
                <option value="anytime">{t.whenAnytime}</option>
                <option value="morning">{t.whenMorning}</option>
                <option value="afternoon">{t.whenAfternoon}</option>
                <option value="night">{t.whenEvening}</option>
              </select>
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.todoGoalLabel}</span>
              <select className="sheet-form-select-plain" style={{ fontSize: 17, fontWeight: 600, textAlignLast:'right' }} value={goal} onChange={e => setGoal(e.target.value)}>
                <option value="">{t.goalNone}</option>
                <option value="goal-1">목표 1 (준비)</option>
                <option value="goal-2">목표 2 (준비)</option>
              </select>
            </div>
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.date}</span>
              <input className="sheet-form-date-pill" style={{ fontSize: 16 }} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
