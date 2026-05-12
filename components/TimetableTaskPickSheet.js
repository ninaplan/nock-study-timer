'use client';

import ChromeBottomSheet from './ChromeBottomSheet';
import { Target, X, RotateCcw } from 'lucide-react';
import { hapticLight, hapticSuccess } from './lib/haptics';

/** 타임블록 — 바텀 피커. 상단 X · 노란 새로고침(시간 비우기) 플로팅, 목록만 스크롤 */
export default function TimetableTaskPickSheet({
  open,
  onClose,
  title,
  showClearHour,
  clearLabel,
  closeLabel,
  todos = [],
  onPickTodoId,
  onPickClearHour,
  emptyHint,
}) {
  const hasRows = todos.length > 0;
  const titleRow = (
    <>
      <button
        type="button"
        className="nav-circle-btn nav-circle-btn--dismiss chrome-bottom-sheet-tb-pick-dismiss"
        onClick={onClose}
        aria-label={closeLabel || 'Close'}
      >
        <X strokeWidth={2.75} aria-hidden strokeLinecap="round" />
      </button>
      <span className="chrome-bottom-sheet-title chrome-bottom-sheet-tb-pick-title">{title}</span>
      {showClearHour ? (
        <button
          type="button"
          className="tb-sheet-clear-chip"
          onClick={() => {
            hapticSuccess();
            onPickClearHour?.();
            onClose();
          }}
          aria-label={clearLabel}
        >
          <RotateCcw size={20} strokeWidth={2.25} aria-hidden />
        </button>
      ) : (
        <span className="chrome-bottom-sheet-tb-pick-trail-spacer" aria-hidden />
      )}
    </>
  );

  return (
    <ChromeBottomSheet
      open={open}
      onClose={onClose}
      title={title}
      customTitleRow={titleRow}
      titleRowClassName="chrome-bottom-sheet-title-row--tb-task-pick"
      lockBodyScroll
    >
      <div className="settings-option-sheet-stack chrome-bottom-sheet-tb-pick-body-inner">
        <div className="list-sec list-sec--stack-md settings-option-sheet-list">
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
