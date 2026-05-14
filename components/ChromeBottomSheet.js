'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { getSheetDockMotionTarget, useSheetKeyboardInset } from './lib/useSheetKeyboardInset';
import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_PANEL_DOCK_EXIT_TRANSITION,
  SHEET_PANEL_DOCK_TRANSITION,
  sheetPanelDragProps,
} from './lib/sheetMotion';

/**
 * Log / Settings 등 앱 상단에서 열리는 풀-하이트 바텀 시트
 * — fixed는 .shell transform에 잡히지 않도록 기본 document.body 포털 + 스크롤 잠금.
 */
export default function ChromeBottomSheet({
  open,
  onClose,
  title,
  children,
  closeLabel,
  trailing,
  omitDismissButton,
  customTitleRow,
  titleRowClassName,
  portal = true,
  lockBodyScroll = true,
}) {
  const scrollHostRef = useRef(null);
  const dragControls = useDragControls();
  const keypadInset = useSheetKeyboardInset(open);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (!lockBodyScroll || !open) return undefined;
    const prev = document.body.style.overflow;
    document.documentElement.classList.add('nock-chrome-sheet-open');
    document.body.classList.add('nock-chrome-sheet-open');
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('nock-chrome-sheet-open');
      document.body.classList.remove('nock-chrome-sheet-open');
      document.body.style.overflow = prev;
    };
  }, [open, lockBodyScroll]);

  const tree = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="nock-chrome-sheet-scrim"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SHEET_BACKDROP_TRANSITION}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--color-bg-overlay)',
              zIndex: 9990,
              touchAction: 'none',
              animation: 'none',
            }}
          />
          <motion.div
            key="nock-chrome-sheet-panel"
            className="chrome-bottom-sheet-panel chrome-bottom-sheet-panel--docked"
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              zIndex: 9991,
            }}
            initial={{ y: '100%', ...getSheetDockMotionTarget(0) }}
            animate={{ y: 0, ...getSheetDockMotionTarget(keypadInset) }}
            exit={{
              y: '100%',
              ...getSheetDockMotionTarget(0),
              transition: SHEET_PANEL_DOCK_EXIT_TRANSITION,
            }}
            transition={SHEET_PANEL_DOCK_TRANSITION}
            {...sheetPanelDragProps(dragControls, onClose)}
          >
            <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--top" aria-hidden />
            <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--bottom" aria-hidden />
            <div ref={scrollHostRef} className="chrome-bottom-sheet-scroll-host">
              <div className="sheet-stack-head">
                <div
                  className="chrome-bottom-sheet-handle-wrap"
                  onPointerDown={(e) => dragControls.start(e)}
                  role="presentation"
                >
                  <div className="chrome-bottom-sheet-handle" aria-hidden />
                </div>
                <div
                  className={[
                    'chrome-bottom-sheet-title-row',
                    'sheet-topbar--flush',
                    titleRowClassName || '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {customTitleRow ? (
                    customTitleRow
                  ) : (
                    <>
                      {omitDismissButton ? (
                        <span className="chrome-bottom-sheet-title-spacer" aria-hidden />
                      ) : (
                        <button
                          type="button"
                          className="nav-circle-btn nav-circle-btn--dismiss"
                          onClick={onClose}
                          aria-label={closeLabel || 'Close'}
                        >
                          <X strokeWidth={2.75} aria-hidden strokeLinecap="round" />
                        </button>
                      )}
                      <span className="chrome-bottom-sheet-title">{title}</span>
                      {trailing ?? <span className="chrome-bottom-sheet-title-spacer" aria-hidden />}
                    </>
                  )}
                </div>
              </div>
              <div className="chrome-bottom-sheet-body">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (portal && typeof document !== 'undefined') {
    return createPortal(tree, document.body);
  }
  if (!portal) {
    return tree;
  }
  return null;
}
