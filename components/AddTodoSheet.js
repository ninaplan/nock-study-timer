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
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        {/* Top nav */}
        <div className="modal-nav">
          <button className="modal-nav-btn btn btn-muted btn-sm" onClick={onClose}>{t.cancel}</button>
          <span className="modal-nav-title">{t.addTodo}</span>
          <button className="modal-nav-btn primary btn btn-dark btn-sm" onClick={save}
            disabled={!name.trim() || saving} style={{ textAlign:'right' }}>
            {saving ? <span className="spin" style={{width:16,height:16}}/> : t.save}
          </button>
        </div>

        <div className="modal-body">
          {/* Grouped card — iOS style */}
          <div style={{ background:'var(--bg2)', borderRadius:'var(--r)', overflow:'hidden', boxShadow:'var(--shadow)', marginTop:8 }}>
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
                  background:'var(--bg3)', borderRadius:'var(--r)', padding:'6px 12px',
                  textAlign:'right',
                }}
              />
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', borderTop:'.5px solid var(--sep)' }}>
              <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>언제 할거예요?</span>
              <select
                value={when}
                onChange={e => setWhen(e.target.value)}
                style={{ border:'none', outline:'none', background:'var(--bg3)', borderRadius:'var(--r)', padding:'6px 12px', fontFamily:'var(--font)', color:'var(--text)', fontSize:14, fontWeight:600 }}
              >
                <option value="anytime">아무때나</option>
                <option value="morning">오전</option>
                <option value="afternoon">오후</option>
                <option value="night">저녁</option>
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', borderTop:'.5px solid var(--sep)' }}>
              <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>목표</span>
              <select
                value={goal}
                onChange={e => setGoal(e.target.value)}
                style={{ border:'none', outline:'none', background:'var(--bg3)', borderRadius:'var(--r)', padding:'6px 12px', fontFamily:'var(--font)', color:'var(--text)', fontSize:14, fontWeight:600, minWidth:120 }}
              >
                <option value="">선택 안함</option>
                <option value="goal-1">목표 1 (준비)</option>
                <option value="goal-2">목표 2 (준비)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
