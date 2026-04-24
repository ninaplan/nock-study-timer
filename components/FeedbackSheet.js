'use client';
import { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function FeedbackSheet({ t, isDemoMode, initialText = '', onSave, onClose }) {
  const [text, setText]     = useState(initialText);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, []);
  useEffect(() => { setText(initialText || ''); }, [initialText]);

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
        <div className="sheet-handle" aria-hidden />
        <div className="sheet-topbar">
          <button type="button" className="sheet-pill sheet-pill-muted" onClick={onClose}>
            {t.cancel}
          </button>
          <span className="sheet-topbar-title">{t.writeFeedback}</span>
          <button
            type="button"
            className="sheet-pill sheet-pill-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? <Loader2 size={16} strokeWidth={2.2} style={{ animation:'_spin .8s linear infinite' }} /> : t.save}
          </button>
        </div>

        <div className="sheet-body" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {isDemoMode && (
            <div style={{ background:'rgba(255, 149, 0, 0.15)', border:'1px solid rgba(255, 149, 0, 0.5)', borderRadius:12, padding:'10px 14px', fontSize:13, color:'var(--orange)', marginBottom:14, fontWeight:600 }}>
              {t.connectToSave}
            </div>
          )}
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'flex-start' }}>
              <textarea
                ref={ref}
                className="sheet-form-select-plain sheet-textarea-left"
                style={{ width: '100%', textAlign: 'left', minHeight: 120, lineHeight: 1.5, fontSize: 15, fontWeight: 500, resize: 'none' }}
                placeholder={t.feedbackPlaceholder}
                value={text}
                onChange={e => setText(e.target.value)}
                rows={6}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
