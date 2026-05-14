'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { useSheetStackScrollFade } from './lib/useSheetStackScrollFade';
import {
  getSheetDockSurfaceStyle,
  scrollSheetFieldIntoView,
  useSheetKeyboardInset,
} from './lib/useSheetKeyboardInset';

export default function FeedbackSheet({ t, showConnectHint = false, initialText = '', onSave, onClose }) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const sheetScrollRef = useRef(null);
  useSheetStackScrollFade(sheetScrollRef, entered && !closing);

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

  const keypadInset = useSheetKeyboardInset(true);

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

  useEffect(() => {
    if (keypadInset <= 0 || !ref.current) return;
    if (document.activeElement !== ref.current) return;
    scrollSheetFieldIntoView(ref.current);
  }, [keypadInset]);

  return (
    <>
      <div
        className="backdrop"
        onClick={requestClose}
        style={{
          opacity: entered && !closing ? 1 : 0,
          transition: 'opacity 0.28s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      />
      <div
        className="sheet"
        style={{
          transform: entered && !closing ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100%)',
          transition:
            'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), bottom 0.22s ease, max-height 0.22s ease',
          animation: 'none',
          ...getSheetDockSurfaceStyle(keypadInset),
        }}
      >
        <div ref={sheetScrollRef} className="sheet-stack-scroll">
          <div className="sheet-stack-head">
            <div className="sheet-handle-wrap" aria-hidden>
              <div className="sheet-handle" />
            </div>
            <div className="sheet-topbar sheet-topbar--flush">
              <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={requestClose} aria-label={t.cancel}>
                <X strokeWidth={2.75} strokeLinecap="round" aria-hidden />
              </button>
              <span className="sheet-topbar-title">{t.writeFeedback}</span>
              <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={save} disabled={saving || !text.trim()} aria-label={t.save}>
                {saving ? (
                  <Loader2 strokeWidth={2.5} strokeLinecap="round" style={{ animation: '_spin .8s linear infinite' }} aria-hidden />
                ) : (
                  <Check strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
                )}
              </button>
            </div>
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
                onFocus={() => scrollSheetFieldIntoView(ref.current)}
                rows={6}
              />
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
