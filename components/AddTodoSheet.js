'use client';
import { useState, useRef, useEffect } from 'react';

export default function AddTodoSheet({ t, onSave, onClose }) {
  const [name, setName]   = useState('');
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 120); }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave(name.trim(), date); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}/>
      <div className="sheet">
        <div className="sheet-handle"/>
        <div className="sheet-title">{t.addTodo}</div>
        <div className="stack">
          <div>
            <label className="input-label">{t.todoTitle}</label>
            <input ref={ref} className="input" placeholder={t.todoTitlePlaceholder}
              value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div>
            <label className="input-label">{t.date}</label>
            <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
          </div>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <button className="btn btn-muted btn-md flex-1" onClick={onClose}>{t.cancel}</button>
            <button className="btn btn-dark btn-md flex-1" onClick={save} disabled={!name.trim()||saving}>
              {saving ? <span className="spin"/> : t.save}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
