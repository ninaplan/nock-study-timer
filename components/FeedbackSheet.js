'use client';
// components/FeedbackSheet.js
import { useState, useRef, useEffect } from 'react';

export default function FeedbackSheet({ t, isDemoMode, onSave, onClose }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    setTimeout(() => textRef.current?.focus(), 100);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await onSave(text.trim());
    setSaving(false);
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">{t.writeFeedback}</div>

        {isDemoMode && (
          <div style={{
            background: 'rgba(255,149,0,0.1)',
            border: '1px solid var(--orange)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--orange)',
            marginBottom: 16,
          }}>
            {t.connectToSave}
          </div>
        )}

        <div className="stack">
          <textarea
            ref={textRef}
            className="input"
            placeholder={t.feedbackPlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            style={{ resize: 'none', lineHeight: 1.6 }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary flex-1" onClick={onClose}>
              {t.cancel}
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : t.save}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
