'use client';
import { useState, useRef, useEffect } from 'react';

export default function FeedbackSheet({ t, isDemoMode, onSave, onClose }) {
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, []);

  const save = async () => {
    setSaving(true);
    try { await onSave(text.trim()); }
    catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-nav">
          <button className="modal-nav-btn" onClick={onClose}>{t.cancel}</button>
          <span className="modal-nav-title">{t.writeFeedback}</span>
          <button
            className="modal-nav-btn primary"
            onClick={save}
            disabled={saving}
            style={{ textAlign: 'right' }}
          >
            {saving ? <span className="spin" style={{ width: 16, height: 16 }} /> : t.save}
          </button>
        </div>

        <div className="modal-body">
          {isDemoMode && (
            <div style={{ background:'rgba(255,149,0,0.1)', border:'1px solid var(--orange)', borderRadius:12, padding:'10px 14px', fontSize:13, color:'var(--orange)', marginBottom:14, fontWeight:700 }}>
              {t.connectToSave}
            </div>
          )}
          <div className="input-card mt-8">
            <div className="input-row" style={{ alignItems: 'flex-start', padding: '14px 16px' }}>
              <textarea
                ref={ref}
                className="input-row-field"
                placeholder={t.feedbackPlaceholder}
                value={text}
                onChange={e => setText(e.target.value)}
                rows={7}
                style={{ textAlign: 'left', fontSize: 15 }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
