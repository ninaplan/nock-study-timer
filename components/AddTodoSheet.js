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
    try { await onSave(name.trim(), date); } catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        {/* Top nav */}
        <div className="modal-nav">
          <button className="modal-nav-btn" onClick={onClose}>{t.cancel}</button>
          <span className="modal-nav-title">{t.addTodo}</span>
          <button className="modal-nav-btn primary" onClick={save}
            disabled={!name.trim() || saving} style={{ textAlign:'right' }}>
            {saving ? <span className="spin" style={{width:16,height:16}}/> : t.save}
          </button>
        </div>

        <div className="modal-body">
          {/* Grouped card — iOS style */}
          <div style={{ background:'var(--bg2)', borderRadius:24, overflow:'hidden', boxShadow:'var(--shadow)', marginTop:8 }}>
            {/* Title field */}
            <div style={{ padding:'14px 18px', borderBottom:'.5px solid var(--sep)' }}>
              <input
                ref={ref}
                style={{ width:'100%', border:'none', background:'transparent', fontFamily:'var(--font)', fontSize:17, fontWeight:600, color:'var(--text)', outline:'none' }}
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key==='Enter' && save()}
              />
            </div>
            {/* Date field */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px' }}>
              <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{t.date}</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  border:'none', outline:'none', fontFamily:'var(--font)',
                  fontSize:15, fontWeight:600, color:'var(--text)',
                  background:'var(--bg3)', borderRadius:12, padding:'6px 12px',
                  textAlign:'right',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
