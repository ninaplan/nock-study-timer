'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { hapticLight } from './lib/haptics';

/**
 * 타임블록 — 앵커 박스 기준 팝오버(드롭다운 형태). 헤더/리셋 없음; 바깥 탭 또는 Escape로 닫기.
 */
export default function TimetableTaskPickPopover({
  open,
  onClose,
  /** () => 요소의 getBoundingClientRect() 또는 null (첫 렌더 전 폴백) */
  getAnchorRect,
  todos = [],
  onAssignTodoId,
  onUnassignTodoId,
  emptyHint,
  /** 스크린리더용 (예: 할 일 선택) */
  pickerAriaLabel,
  /** 배경 영역 접근 가능 라벨 (예: 취소) */
  dismissAriaLabel,
}) {
  const panelRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0, width: 280 });

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;

    let frame = null;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = typeof getAnchorRect === 'function' ? getAnchorRect() : null;
        const panel = panelRef.current;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 12;
        const safeL = margin;
        const safeR = margin;
        const approxH = panel?.offsetHeight || 260;

        if (!anchor) {
          const w = Math.min(300, vw - 2 * margin);
          const left = (vw - w) / 2;
          const top = Math.max(margin + 56, Math.min(vh * 0.14, vh - approxH - margin));
          setCoords({ left, top, width: w });
          return;
        }

        const w = Math.min(Math.max(anchor.width + 20, 260), vw - safeL - safeR);
        let left = anchor.left + (anchor.width - w) / 2;
        left = Math.min(Math.max(left, safeL), vw - safeR - w);

        let top = anchor.bottom + 8;
        if (top + approxH > vh - margin) {
          top = anchor.top - approxH - 8;
        }
        if (top < margin + 44) top = margin + 44;
        if (top + approxH > vh - margin) {
          top = Math.max(margin + 44, vh - approxH - margin);
        }

        setCoords({ left, top, width: w });
      });
    };

    position();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : null;
    if (panelRef.current) ro?.observe(panelRef.current);

    window.addEventListener('resize', position);
    const scrollHost = typeof document !== 'undefined' ? document.querySelector('.shell .content') : null;
    scrollHost?.addEventListener('scroll', position, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      scrollHost?.removeEventListener('scroll', position);
      ro?.disconnect();
    };
  }, [open, getAnchorRect, todos]);

  if (!open || typeof document === 'undefined') return null;

  const hasRows = todos.length > 0;

  const node = (
    <>
      <button
        type="button"
        className="tb-task-popover-dismiss"
        onClick={onClose}
        aria-label={dismissAriaLabel || 'Close'}
      />
      <div
        ref={panelRef}
        className="tb-task-popover tb-task-popover--picker"
        style={{
          left: coords.left,
          top: coords.top,
          width: coords.width,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={pickerAriaLabel || 'Tasks'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tb-task-popover-body tb-task-popover-body--picker-only">
          <div className="list-sec list-sec--stack-md settings-option-sheet-list tb-task-popover-list-inner">
            {todos.map((todo) => {
              const id = String(todo.id);
              const name = todo.name || '';
              const assigned = !!todo.assigned;
              return (
                <button
                  key={id}
                  type="button"
                  className="list-row w-full settings-option-row"
                  aria-pressed={assigned}
                  onClick={() => {
                    hapticLight();
                    if (assigned) {
                      onUnassignTodoId?.(id);
                      onClose();
                    } else {
                      onAssignTodoId?.(id);
                    }
                  }}
                >
                  <span className="settings-row-label settings-option-row-label timetable-task-pick-sheet-label">{name}</span>
                  <span className="settings-option-check-wrap" aria-hidden>
                    {assigned ? <Check strokeWidth={2.25} aria-hidden /> : <span style={{ width: 22, display: 'inline-block' }} />}
                  </span>
                </button>
              );
            })}
          </div>
          {!hasRows && emptyHint ? <p className="timetable-native-picker-empty tb-task-popover-empty">{emptyHint}</p> : null}
        </div>
      </div>
    </>
  );

  return createPortal(node, document.body);
}
