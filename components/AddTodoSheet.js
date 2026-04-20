'use client';
// components/AddTodoSheet.js
import { useState, useRef, useEffect } from 'react';

export default function AddTodoSheet({ t, onSave, onClose }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), date);
    setSaving(false);
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">{t.addTodo}</div>

        <div className="stack">
          <div>
            <label className="input-label">{t.todoTitle}</label>
            <input
              ref={inputRef}
              className="input"
              placeholder={t.todoTitlePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <div>
            <label className="input-label">{t.date}</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button
              className="btn btn-secondary flex-1"
              onClick={onClose}
            >
              {t.cancel}
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : t.save}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
