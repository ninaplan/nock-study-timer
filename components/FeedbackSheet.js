'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, X, Check } from 'lucide-react';

export default function FeedbackSheet({ t, showConnectHint = false, initialText = '', onSave, onClose }) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 200);
  }, []);
  useEffect(() => {
    setText(initialText || '');
  }, [initialText]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 320);
  }, [closing, onClose]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(text.trim());
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="backdrop"
        onClick={requestClose}
        style={{
          opacity: entered && !closing ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
      />
      <div
        className="sheet"
        style={{
          transform: entered && !closing ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100%)',
          transition: 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)',
          animation: 'none',
        }}
      >
        <div className="sheet-handle-wrap" aria-hidden>
          <div className="sheet-handle" />
        </div>
        <div className="sheet-topbar sheet-topbar--flush">
          <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={requestClose} aria-label={t.cancel}>
            <X strokeWidth={2} strokeLinecap="round" aria-hidden />
          </button>
          <span className="sheet-topbar-title">{t.writeFeedback}</span>
          <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={save} disabled={saving || !text.trim()} aria-label={t.save}>
            {saving ? (
              <Loader2 strokeWidth={2} strokeLinecap="round" style={{ animation: '_spin .8s linear infinite' }} aria-hidden />
            ) : (
              <Check strokeWidth={2.35} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
            )}
          </button>
        </div>

        <div className="sheet-body sheet-body--safe-bottom sheet-body--stacked">
          {showConnectHint && (
            <div className="sheet-hint-banner--warning">{t.connectToSave}</div>
          )}
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'flex-start' }}>
              <textarea
                ref={ref}
                className="sheet-form-select-plain sheet-textarea-left sheet-feedback-textarea"
                placeholder={t.feedbackPlaceholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
