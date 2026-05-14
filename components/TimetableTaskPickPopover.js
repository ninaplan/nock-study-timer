'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { hapticLight } from './lib/haptics';
import NockPopover from './NockPopover';

/**
 * 타임블록 빈 칸·할 일 탭 — NockPopover 기반; 행 탭 시 해당 할 일만 슬롯에 반영 후 즉시 닫힘.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => DOMRect | null | undefined} props.getAnchorRect
 * @param {string} props.slotTitle
 * @param {{ id: string, name: string, assigned: boolean }[]} props.todos
 * @param {(todoId: string) => void} props.onPickTodo — 할 일 한 줄 탭: 배정 토글 후 부모에서 닫기
 * @param {(name: string) => Promise<string | null | void>} [props.onQuickCreateTodo]
 * @param {string} [props.newTodoPlaceholder]
 * @param {string} [props.pickerAriaLabel]
 * @param {string} [props.dismissAriaLabel]
 * @param {string} [props.emptyHint]
 */
export default function TimetableTaskPickPopover({
  open,
  onClose,
  getAnchorRect,
  slotTitle,
  todos = [],
  onPickTodo,
  onQuickCreateTodo,
  newTodoPlaceholder,
  pickerAriaLabel,
  dismissAriaLabel,
  emptyHint,
}) {
  const frozenTodosRef = useRef(todos);
  useEffect(() => {
    if (open) frozenTodosRef.current = todos;
  }, [open, todos]);

  const listTodos = open ? todos : frozenTodosRef.current;

  const [newTodoOpen, setNewTodoOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const newInputRef = useRef(null);
  const wasOpenRef = useRef(false);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setNewTodoOpen(false);
      setDraftName('');
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (newTodoOpen && newInputRef.current) {
      try {
        newInputRef.current.focus();
        newInputRef.current.select?.();
      } catch {
        /* noop */
      }
    }
  }, [newTodoOpen]);

  const submitNewTodo = async (nameMaybe) => {
    const trimmed = String(nameMaybe ?? draftName).trim();
    if (!trimmed || !onQuickCreateTodo) {
      setNewTodoOpen(false);
      setDraftName('');
      return;
    }
    if (creatingRef.current) return;
    creatingRef.current = true;
    hapticLight();
    let createdId = null;
    try {
      createdId = await onQuickCreateTodo(trimmed);
    } catch {
      createdId = null;
    } finally {
      creatingRef.current = false;
      setNewTodoOpen(false);
      setDraftName('');
      if (createdId) onClose?.();
    }
  };

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
      panelClassName="tb-task-picker-shell"
    >
      <div className="tb-task-picker">
        <header className="tb-task-picker__head">
          <h2 className="tb-task-picker__title">{slotTitle}</h2>
        </header>

        <div className="tb-task-picker__scroll">
          {listTodos.length === 0 && emptyHint ? (
            <p className="tb-task-picker__empty">{emptyHint}</p>
          ) : null}

          <ul className="tb-task-picker__list">
            {listTodos.map((todo) => {
              const id = String(todo.id);
              const assigned = !!todo.assigned;
              return (
                <li key={id} className="tb-task-picker__li">
                  <button
                    type="button"
                    className="tb-task-picker__row"
                    aria-pressed={assigned}
                    onClick={() => {
                      hapticLight();
                      onPickTodo?.(id);
                    }}
                  >
                    <span className="tb-task-picker__row-label">{todo.name}</span>
                    <span className="settings-option-check-wrap" aria-hidden>
                      {assigned ? (
                        <Check strokeWidth={2.25} aria-hidden />
                      ) : (
                        <span style={{ width: 22, display: 'inline-block' }} />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="tb-task-picker__gap" aria-hidden />

          {!newTodoOpen ? (
            <button
              type="button"
              className="tb-task-picker__new-hint"
              onClick={() => {
                hapticLight();
                setNewTodoOpen(true);
              }}
            >
              {newTodoPlaceholder || ''}
            </button>
          ) : (
            <input
              ref={newInputRef}
              type="text"
              className="tb-task-picker__new-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={newTodoPlaceholder || ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitNewTodo();
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setNewTodoOpen(false);
                  setDraftName('');
                }
              }}
              onBlur={(e) => {
                const v = (e.target?.value ?? '').trim();
                if (!v) {
                  setNewTodoOpen(false);
                  setDraftName('');
                } else {
                  void submitNewTodo(v);
                }
              }}
            />
          )}
        </div>
      </div>
    </NockPopover>
  );
}
