'use client';
import { useState, useRef, useEffect } from 'react';

export default function FeedbackSheet({ t, isDemoMode, onSave, onClose }) {
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 120); }, []);

  const save = async () => {
    setSaving(true);
    try { await onSave(text.trim()); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}/>
      <div className="sheet">
        <div className="sheet-handle"/>
        <div className="sheet-title">{t.writeFeedback}</div>
        {isDemoMode && (
          <div style={{background:'rgba(255,149,0,0.1)',border:'1px solid var(--orange)',borderRadius:12,padding:'10px 14px',fontSize:13,color:'var(--orange)',marginBottom:16,fontWeight:600}}>
            {t.connectToSave}
          </div>
        )}
        <div className="stack">
          <textarea ref={ref} className="input" placeholder={t.feedbackPlaceholder}
            value={text} onChange={e=>setText(e.target.value)} rows={5}/>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <button className="btn btn-muted btn-md flex-1" onClick={onClose}>{t.cancel}</button>
            <button className="btn btn-dark btn-md flex-1" onClick={save} disabled={saving}>
              {saving ? <span className="spin"/> : t.save}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
