'use client';

import ChromeBottomSheet from './ChromeBottomSheet';
import { Target } from 'lucide-react';
import { hapticLight, hapticSuccess } from './lib/haptics';

/** 타임블록 — 설정 언어 시트와 동일 패턴(iOS 목록 피커). 한 줄 탭 후 자동 닫힘 */
export default function TimetableTaskPickSheet({
  open,
  onClose,
  title,
  showClearHour,
  clearLabel,
  todos = [],
  onPickTodoId,
  onPickClearHour,
  emptyHint,
}) {
  const hasRows = todos.length > 0 || showClearHour;
  return (
    <ChromeBottomSheet open={open} onClose={onClose} title={title} omitDismissButton>
      <div className="settings-option-sheet-stack">
        <div className="list-sec list-sec--stack-md settings-option-sheet-list">
          {showClearHour ? (
            <button
              type="button"
              className="list-row w-full settings-option-row"
              onClick={() => {
                hapticSuccess();
                onPickClearHour?.();
                onClose();
              }}
            >
              <span className="settings-row-label settings-option-row-label" style={{ color: 'var(--color-action-red)' }}>
                {clearLabel}
              </span>
              <span className="settings-option-check-wrap" aria-hidden />
            </button>
          ) : null}
          {todos.map((todo) => {
            const name = todo.name || '';
            const id = String(todo.id);
            return (
              <button
                key={id}
                type="button"
                className="list-row w-full settings-option-row"
                onClick={() => {
                  hapticLight();
                  onPickTodoId?.(id);
                  onClose();
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  {todo.hasGoal ? (
                    <Target size={18} strokeWidth={2.2} className="timetable-native-picker-row-goal" style={{ flexShrink: 0 }} aria-hidden />
                  ) : null}
                  <span className="settings-row-label settings-option-row-label timetable-task-pick-sheet-label">{name}</span>
                </span>
                <span className="settings-option-check-wrap" aria-hidden>
                  <span style={{ width: 22, display: 'inline-block' }} />
                </span>
              </button>
            );
          })}
        </div>
        {!hasRows && emptyHint ? (
          <p className="timetable-native-picker-empty tb-task-popover-empty" style={{ padding: '12px var(--spacing-card)' }}>
            {emptyHint}
          </p>
        ) : null}
      </div>
    </ChromeBottomSheet>
  );
}
