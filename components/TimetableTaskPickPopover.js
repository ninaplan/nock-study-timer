'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { hapticLight } from './lib/haptics';

/**
 * 타임블록 — 앵커 근처 플로팅 패널(할 일 추가 시트·그룹드 .list-sec 과 동일 표면 토큰).
 * 회색 딤 없음 · 바깥 히트 닫기 · Escape. 단일 선택 시 즉시 닫힘.
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
  /** 닫힘 애니메이션 중 부모가 hour를 지우면 todos/앵커가 비므로 마지막 열림 상태를 유지 */
  const frozenTodosRef = useRef(todos);
  const lastAnchorRectRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0, width: 280 });
  /** 애니메이션 후 언마운트 — 열림은 즉시, 닫힘은 popover-out 후 */
  const [mounted, setMounted] = useState(!!open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      frozenTodosRef.current = todos;
      setClosing(false);
      setMounted(true);
    }
  }, [open, todos]);

  useEffect(() => {
    if (!open && mounted) setClosing(true);
  }, [open, mounted]);

  useEffect(() => {
    if (!closing) return undefined;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) {
      setMounted(false);
      setClosing(false);
      return undefined;
    }
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 400);
    return () => window.clearTimeout(t);
  }, [closing]);

  const onPanelAnimationEnd = (e) => {
    if (!closing || e.target !== panelRef.current) return;
    const name = String(e.animationName || '');
    if (!name.includes('tb-task-popover-out')) return;
    setMounted(false);
    setClosing(false);
  };

  useLayoutEffect(() => {
    if (!mounted || typeof window === 'undefined') return undefined;

    let frame = null;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const fromFn = typeof getAnchorRect === 'function' ? getAnchorRect() : null;
        if (fromFn) lastAnchorRectRef.current = fromFn;
        const anchor = fromFn ?? lastAnchorRectRef.current;
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
  }, [mounted, getAnchorRect, todos]);

  if (!mounted || typeof document === 'undefined') return null;

  const listTodos = open ? todos : frozenTodosRef.current;
  const hasRows = listTodos.length > 0;

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
        className={`tb-task-popover tb-task-popover--picker${closing ? ' tb-task-popover--closing' : ''}`}
        style={{
          left: coords.left,
          top: coords.top,
          width: coords.width,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={pickerAriaLabel || 'Tasks'}
        onAnimationEnd={onPanelAnimationEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tb-task-popover-body tb-task-popover-body--picker-only">
          <div className="list-sec list-sec--stack-md settings-option-sheet-list tb-task-popover-list-inner">
            {listTodos.map((todo) => {
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
                    } else {
                      onAssignTodoId?.(id);
                    }
                    onClose();
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
