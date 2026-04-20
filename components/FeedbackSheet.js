'use client';
import { useState, useRef, useEffect } from 'react';

export default function FeedbackSheet({ t, isDemoMode, onSave, onClose }) {
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 150); }, []);

  const save = async () => {
    setSaving(true);
    try { await onSave(text.trim()); }
    catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-body">
          <div className="sheet-handle" />
          <div className="sheet-title">{t.writeFeedback}</div>
          {isDemoMode && (
            <div style={{ background:'rgba(255,149,0,0.1)', border:'1px solid var(--orange)', borderRadius:12, padding:'10px 14px', fontSize:13, color:'var(--orange)', marginBottom:16, fontWeight:700 }}>
              {t.connectToSave}
            </div>
          )}
          <div style={{ paddingBottom: 16 }}>
            <textarea
              ref={ref}
              className="input"
              placeholder={t.feedbackPlaceholder}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
            />
          </div>
        </div>
        <div className="sheet-footer">
          <button className="btn btn-muted btn-md flex-1" onClick={onClose}>{t.cancel}</button>
          <button className="btn btn-dark btn-md flex-1" onClick={save} disabled={saving}>
            {saving ? <span className="spin" /> : t.save}
          </button>
        </div>
      </div>
    </>
  );
}
