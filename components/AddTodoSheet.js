'use client';
import { useState, useRef, useEffect } from 'react';

export default function AddTodoSheet({ t, onSave, onClose }) {
  const [name, setName]     = useState('');
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave(name.trim(), date); }
    catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        {/* Top nav — Cancel | Title | Save */}
        <div className="modal-nav">
          <button className="modal-nav-btn" onClick={onClose}>{t.cancel}</button>
          <span className="modal-nav-title">{t.addTodo}</span>
          <button
            className="modal-nav-btn primary"
            onClick={save}
            disabled={!name.trim() || saving}
            style={{ textAlign: 'right' }}
          >
            {saving ? <span className="spin" style={{ width: 16, height: 16 }} /> : t.save}
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* iOS-style grouped card */}
          <div className="input-card mt-8">
            {/* Title field — full width, no label */}
            <div className="input-row">
              <input
                ref={ref}
                className="input-row-field"
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                style={{ textAlign: 'left', fontSize: 17, fontWeight: 600 }}
              />
            </div>
            {/* Date row */}
            <div className="input-row">
              <span className="input-row-label">{t.date}</span>
              <input
                className="input-row-field"
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
