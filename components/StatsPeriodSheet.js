'use client';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { localDateKey } from '@/app/lib/dateUtils';
import {
  getSheetDockMotionTarget,
  scrollSheetFieldIntoView,
  useSheetKeyboardInset,
} from './lib/useSheetKeyboardInset';
import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_PANEL_DOCK_EXIT_TRANSITION,
  SHEET_PANEL_DOCK_TRANSITION,
  sheetPanelDragProps,
} from './lib/sheetMotion';

/** Bottom sheet: start/end date only. */
export default function StatsPeriodSheet({
  open,
  onClose,
  onApply,
  appliedPeriod,
  appliedCustomStart,
  appliedCustomEnd,
  t,
  getPresetRange,
}) {
  const scrollRef = useRef(null);
  const dragControls = useDragControls();
  const keypadInset = useSheetKeyboardInset(open);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (appliedPeriod === 'custom' && appliedCustomStart && appliedCustomEnd) {
      setDraftStart(appliedCustomStart);
      setDraftEnd(appliedCustomEnd);
    } else {
      const r = getPresetRange('thisWeek');
      setDraftStart(r.start);
      setDraftEnd(r.end);
    }
  }, [open, appliedPeriod, appliedCustomStart, appliedCustomEnd, getPresetRange]);

  const onChangeStart = (v) => {
    setDraftStart(v);
    setError('');
  };

  const onChangeEnd = (v) => {
    setDraftEnd(v);
    setError('');
  };

  const handleApply = () => {
    let start = draftStart;
    let end = draftEnd;
    if (!start || !end) {
      setError(t.statsPeriodInvalidRange);
      return;
    }
    if (start > end) {
      const z = start;
      start = end;
      end = z;
    }
    onApply({ period: 'custom', start, end });
    onClose();
  };

  const onFieldFocus = (e) => scrollSheetFieldIntoView(e.currentTarget);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="stats-period-scrim"
            className="backdrop backdrop--sheet-scrim"
            onClick={onClose}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={SHEET_BACKDROP_TRANSITION}
            style={{ animation: 'none' }}
          />
          <motion.div
            key="stats-period-panel"
            className="sheet"
            style={{
              left: '50%',
              animation: 'none',
            }}
            initial={{ x: '-50%', y: '100%', ...getSheetDockMotionTarget(0) }}
            animate={{
              x: '-50%',
              y: 0,
              ...getSheetDockMotionTarget(keypadInset),
            }}
            exit={{
              x: '-50%',
              y: '100%',
              ...getSheetDockMotionTarget(0),
              transition: SHEET_PANEL_DOCK_EXIT_TRANSITION,
            }}
            transition={SHEET_PANEL_DOCK_TRANSITION}
            {...sheetPanelDragProps(dragControls, onClose)}
          >
            <div ref={scrollRef} className="sheet-stack-scroll">
              <div className="sheet-stack-head">
                <div
                  className="sheet-handle-wrap"
                  aria-hidden
                  onPointerDown={(e) => dragControls.start(e)}
                  role="presentation"
                >
                  <div className="sheet-handle" />
                </div>
                <div className="sheet-topbar sheet-topbar--flush">
                  <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={onClose} aria-label={t.cancel}>
                    <X strokeWidth={2.75} strokeLinecap="round" aria-hidden />
                  </button>
                  <span className="sheet-topbar-title">{t.statsCustomSection}</span>
                  <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={handleApply} aria-label={t.statsApply}>
                    <Check strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="sheet-body sheet-body--safe-bottom sheet-body--stacked">
                <p className="sheet-hint-text">{t.statsCustomHint}</p>
                <div className="sheet-form-card">
                  <div className="sheet-form-row">
                    <span className="sheet-form-label">{t.statsPeriodStart}</span>
                    <input
                      type="date"
                      className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                      value={draftStart}
                      onChange={(e) => onChangeStart(e.target.value)}
                      onFocus={onFieldFocus}
                    />
                  </div>
                  <div className="sheet-form-row">
                    <span className="sheet-form-label">{t.statsPeriodEnd}</span>
                    <input
                      type="date"
                      className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                      value={draftEnd}
                      onChange={(e) => onChangeEnd(e.target.value)}
                      max={localDateKey()}
                      onFocus={onFieldFocus}
                    />
                  </div>
                </div>
                {error ? <div className="sheet-field-error-text">{error}</div> : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
