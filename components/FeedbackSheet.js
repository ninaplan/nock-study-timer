'use client';
import { useState, useRef, useEffect } from 'react';
import { Loader2, X, Check } from 'lucide-react';

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
          <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={onClose} aria-label={t.cancel}>
            <X size={22} strokeWidth={2.2} />
          </button>
          <span className="sheet-topbar-title">{t.writeFeedback}</span>
          <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={save} disabled={saving} aria-label={t.save}>
            {saving ? <Loader2 size={22} strokeWidth={2.2} style={{ animation: '_spin .8s linear infinite' }} /> : <Check size={22} strokeWidth={2.5} />}
          </button>
        </div>

        <div className="sheet-body" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {isDemoMode && (
            <div style={{ background:'rgba(255, 149, 0, 0.15)', border:'1px solid rgba(255, 149, 0, 0.5)', borderRadius:12, padding:'10px 14px', fontSize:13, color:'var(--orange)', marginBottom:14, fontWeight: 500 }}>
              {t.connectToSave}
            </div>
          )}
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'flex-start' }}>
              <textarea
                ref={ref}
                className="sheet-form-select-plain sheet-textarea-left"
                style={{ width: '100%', textAlign: 'left', minHeight: 120, lineHeight: 1.5, fontSize: 15, fontWeight: 400, resize: 'none' }}
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
