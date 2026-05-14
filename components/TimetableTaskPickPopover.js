'use client';

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { hapticLight } from './lib/haptics';
import NockPopover from './NockPopover';

/**
 * 타임블록 — 앵커 근처 플로팅 패널(할 일 목록).
 * 글래스·등장/퇴장·배경 탭·ESC는 NockPopover와 동일.
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
  /** 닫힘 애니메이션 중 부모가 hour를 지우면 todos 가 비므로 마지막 열림 목록 유지 */
  const frozenTodosRef = useRef(todos);
  useEffect(() => {
    if (open) frozenTodosRef.current = todos;
  }, [open, todos]);

  const listTodos = open ? todos : frozenTodosRef.current;
  const hasRows = listTodos.length > 0;

  return (
    <NockPopover
      open={open}
      onClose={onClose}
      getAnchorRect={getAnchorRect}
      placement="stretch-center"
      stretchMinWidth={260}
      stretchExtraWidth={20}
      dismissAriaLabel={dismissAriaLabel || 'Close'}
      ariaLabel={pickerAriaLabel || 'Tasks'}
      panelClassName="tb-task-popover-shell"
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
        {!hasRows && emptyHint ? (
          <p className="timetable-native-picker-empty tb-task-popover-empty">{emptyHint}</p>
        ) : null}
      </div>
    </NockPopover>
  );
}
