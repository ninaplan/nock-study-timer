'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { X, Loader2, Check } from 'lucide-react';
import { scrollSheetFieldIntoView } from './lib/sheetFieldScroll';
import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_PANEL_DOCK_EXIT_TRANSITION,
  SHEET_PANEL_DOCK_TRANSITION,
  sheetPanelDragProps,
} from './lib/sheetMotion';

export default function FeedbackSheet({ t, showConnectHint = false, initialText = '', onSave, onClose }) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const sheetScrollRef = useRef(null);
  const dragControls = useDragControls();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.classList.add('nock-sheet-open');
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.classList.remove('nock-sheet-open');
      document.body.style.overflow = prev;
      document.body.style.overscrollBehavior = '';
    };
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
  }, [closing]);

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
      <motion.div
        className="backdrop backdrop--sheet-scrim"
        onClick={requestClose}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        transition={SHEET_BACKDROP_TRANSITION}
        style={{ animation: 'none' }}
      />
      <motion.div
        className="sheet"
        style={{
          left: '50%',
          animation: 'none',
        }}
        initial={{ x: '-50%', y: '100%' }}
        animate={{
          x: '-50%',
          y: closing ? '100%' : 0,
        }}
        transition={closing ? SHEET_PANEL_DOCK_EXIT_TRANSITION : SHEET_PANEL_DOCK_TRANSITION}
        onAnimationComplete={() => {
          if (closing) onClose();
        }}
        {...(closing ? {} : sheetPanelDragProps(dragControls, requestClose))}
      >
        <div className="sheet-dock-column">
          <div className="sheet-stack-head">
            <div
              className="sheet-handle-wrap"
              aria-hidden
              onPointerDown={(e) => !closing && dragControls.start(e)}
              role="presentation"
            >
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
          <div ref={sheetScrollRef} className="sheet-stack-scroll">
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
      </motion.div>
    </>
  );
}
