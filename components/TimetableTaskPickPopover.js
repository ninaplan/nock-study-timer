'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { hapticLight, hapticSuccess } from './lib/haptics';
import NockPopover from './NockPopover';

/**
 * 타임블록 빈 칸·할 일 탭 — NockPopover 기반 할 일 다중 선택 + 슬롯 시간 헤더 + 적용 FAB.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose — 배경 탭·ESC(취소, 미적용)
 * @param {() => DOMRect | null | undefined} props.getAnchorRect
 * @param {string} props.slotTitle — 헤더 (예: 12 AM, 오후 3시)
 * @param {{ id: string, name: string, assigned: boolean }[]} props.todos — 오늘 할 일(미완료 등 부모 정의)
 * @param {(selectedIds: string[]) => void} props.onApply — ✓ 탭 시 선택 id 목록으로 타임블록 반영 후 부모에서 닫기
 * @param {(name: string) => Promise<string | null | void>} [props.onQuickCreateTodo] — 인라인 새 할 일 저장(슬롯 배정은 부모 처리)
 * @param {string} [props.newTodoPlaceholder]
 * @param {string} [props.applyAriaLabel]
 * @param {string} [props.pickerAriaLabel]
 * @param {string} [props.dismissAriaLabel]
 * @param {string} [props.emptyHint] — 할 일이 없을 때 안내
 */
export default function TimetableTaskPickPopover({
  open,
  onClose,
  getAnchorRect,
  slotTitle,
  todos = [],
  onApply,
  onQuickCreateTodo,
  newTodoPlaceholder,
  applyAriaLabel,
  pickerAriaLabel,
  dismissAriaLabel,
  emptyHint,
}) {
  const frozenTodosRef = useRef(todos);
  useEffect(() => {
    if (open) frozenTodosRef.current = todos;
  }, [open, todos]);

  const listTodos = open ? todos : frozenTodosRef.current;

  const [selected, setSelected] = useState(() => new Set());
  const [newTodoOpen, setNewTodoOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const newInputRef = useRef(null);
  const wasOpenRef = useRef(false);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelected(new Set(todos.filter((t) => t.assigned).map((t) => String(t.id))));
      setNewTodoOpen(false);
      setDraftName('');
    }
    wasOpenRef.current = open;
  }, [open, todos]);

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

  const toggleId = (rawId) => {
    const id = String(rawId);
    hapticLight();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    hapticSuccess();
    onApply?.(Array.from(selected));
  };

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
    try {
      const id = await onQuickCreateTodo(trimmed);
      if (id) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(String(id));
          return next;
        });
      }
    } finally {
      creatingRef.current = false;
      setNewTodoOpen(false);
      setDraftName('');
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

        <button
          type="button"
          className="tb-task-picker__fab"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleApply}
          aria-label={applyAriaLabel || 'Apply'}
        >
          <Check className="tb-task-picker__fab-icon" strokeWidth={2.6} aria-hidden />
        </button>

        <div className="tb-task-picker__scroll">
          {listTodos.length === 0 && emptyHint ? (
            <p className="tb-task-picker__empty">{emptyHint}</p>
          ) : null}

          <ul className="tb-task-picker__list" role="listbox" aria-multiselectable="true">
            {listTodos.map((todo) => {
              const id = String(todo.id);
              const checked = selected.has(id);
              return (
                <li key={id} className="tb-task-picker__li" role="none">
                  <button
                    type="button"
                    className="tb-task-picker__row"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggleId(id)}
                  >
                    <span className="tb-task-picker__row-label">{todo.name}</span>
                    <span className={`tb-task-picker__tick${checked ? ' is-on' : ''}`} aria-hidden>
                      {checked ? <Check strokeWidth={2.5} className="tb-task-picker__tick-icon" /> : null}
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
