'use client';
import { useState, useRef, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { scrollSheetFieldIntoView } from './lib/sheetFieldScroll';
import ChromeBottomSheet from './ChromeBottomSheet';

export default function FeedbackSheet({ t, showConnectHint = false, initialText = '', onSave, onClose }) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 200);
  }, []);

  useEffect(() => {
    setText(initialText || '');
  }, [initialText]);

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

  const saveButton = (
    <button
      type="button"
      className="nav-circle-btn nav-circle-btn--confirm"
      onClick={save}
      disabled={saving || !text.trim()}
      aria-label={t.save}
    >
      {saving ? (
        <Loader2 strokeWidth={2.5} strokeLinecap="round" style={{ animation: '_spin .8s linear infinite' }} aria-hidden />
      ) : (
        <Check strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
      )}
    </button>
  );

  return (
    <ChromeBottomSheet
      open
      onClose={onClose}
      title={t.writeFeedback}
      trailing={saveButton}
    >
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
    </ChromeBottomSheet>
  );
}
