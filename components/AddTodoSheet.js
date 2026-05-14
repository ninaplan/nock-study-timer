'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { localDateKey, formatCalendarDateLine } from '@/app/lib/dateUtils';
import { Loader2, X, Check, Lock } from 'lucide-react';
import { apiFetch } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { getLocale } from '@/app/lib/i18n';
import TimeWheelPicker, { formatAccumMinutesLabel } from './TimeWheelPicker';
import HomeTopDatePopover from './HomeTopDatePopover';
import { hapticLight } from './lib/haptics';
import { useSheetStackScrollFade } from './lib/useSheetStackScrollFade';
import { getSheetDockSurfaceStyle, useSheetKeyboardInset } from './lib/useSheetKeyboardInset';
import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_SPRING_CLOSE,
  SHEET_SPRING_OPEN,
  sheetPanelDragProps,
} from './lib/sheetMotion';

function normId(id) {
  return String(id || '').replace(/-/g, '');
}

function normGoalKey(id) {
  return normId(id).toLowerCase();
}

export default function AddTodoSheet({
  t,
  onSave,
  onClose,
  editingTodo,
  creds = null,
  settings = {},
  defaultTodoDate,
  hasPremium = true,
  onPremiumGate,
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [focusWheelMin, setFocusWheelMin] = useState(0);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const sheetRootRef = useRef(null);
  const bodyRef = useRef(null);
  const dragControls = useDragControls();

  const [goals, setGoals] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalPageId, setGoalPageId] = useState('');
  const [focusWheelOpen, setFocusWheelOpen] = useState(false);
  const addTodoDateAnchorRef = useRef(null);
  const [addTodoDatePopoverOpen, setAddTodoDatePopoverOpen] = useState(false);

  useEffect(() => {
    setFocusWheelOpen(false);
  }, [editingTodo]);

  useEffect(() => {
    if (editingTodo) {
      setName(editingTodo.name || '');
      setDate(editingTodo.date || localDateKey());
      const a = Math.max(0, Number(editingTodo.accum ?? 0) || 0);
      setFocusWheelMin(Math.min(1440, Math.round(a)));
    } else {
      setName('');
      setDate(defaultTodoDate || localDateKey());
      setFocusWheelMin(0);
    }
    setAddTodoDatePopoverOpen(false);
  }, [editingTodo, defaultTodoDate]);

  /** Sync goal picker to loaded goals list (UUID formatting). */
  useEffect(() => {
    if (!editingTodo?.goalPageId) {
      setGoalPageId('');
      return;
    }
    const raw = String(editingTodo.goalPageId).trim();
    if (!raw) {
      setGoalPageId('');
      return;
    }
    const found = goals.find((g) => normId(g.id) === normId(raw));
    setGoalPageId(found ? found.id : raw);
  }, [editingTodo?.goalPageId, editingTodo?.id, goals]);

  useEffect(() => {
    let cancelled = false;
    if (!creds?.dbGoal || !hasNotionAuth(creds)) {
      setGoals([]);
      return undefined;
    }
    setGoalsLoading(true);
    (async () => {
      try {
        const data = await apiFetch('/api/goals', { method: 'GET' }, creds, settings);
        if (!cancelled) setGoals(Array.isArray(data?.goals) ? data.goals : []);
      } catch {
        if (!cancelled) setGoals([]);
      } finally {
        if (!cancelled) setGoalsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creds?.dbGoal, creds?.token, creds?.authMode, settings]);

  useEffect(() => {
    if (closing) setAddTodoDatePopoverOpen(false);
  }, [closing]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  useEffect(() => {
    const t0 = setTimeout(() => ref.current?.focus(), 200);
    return () => clearTimeout(t0);
  }, [editingTodo]);

  const keypadInset = useSheetKeyboardInset(true);

  useSheetStackScrollFade(bodyRef, !closing);

  const locale = getLocale(settings?.lang);
  const ko = locale === 'ko';
  const goalLinked = !!(creds?.dbGoal && String(creds.dbGoal).trim());

  const goalFaceLabel = (() => {
    if (!goalPageId) return t.goalNone;
    const match = goals.find((g) => g.id === goalPageId);
    if (match) return match.name;
    if (goalsLoading) return '…';
    return t.goalNone;
  })();

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const accumMin = editingTodo ? Math.max(0, Math.min(1440, Number(focusWheelMin) || 0)) : 0;
      await onSave(name.trim(), date, {
        accumMin,
        goalPageId: goalLinked ? String(goalPageId || '').trim() : '',
      });
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        className="backdrop"
        onClick={requestClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={SHEET_BACKDROP_TRANSITION}
        style={{ animation: 'none' }}
      />
      <motion.div
        ref={sheetRootRef}
        className="sheet"
        style={{
          left: '50%',
          animation: 'none',
          ...getSheetDockSurfaceStyle(keypadInset),
        }}
        initial={{ x: '-50%', y: '100%' }}
        animate={{ x: '-50%', y: closing ? '100%' : 0 }}
        transition={closing ? SHEET_SPRING_CLOSE : SHEET_SPRING_OPEN}
        onAnimationComplete={() => {
          if (closing) onClose();
        }}
        {...(closing ? {} : sheetPanelDragProps(dragControls, requestClose))}
      >
        <div ref={bodyRef} className="sheet-stack-scroll">
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
              <span className="sheet-topbar-title">{editingTodo ? t.editTodo : t.addTodo}</span>
              <button
                type="button"
                className="nav-circle-btn nav-circle-btn--confirm"
                onClick={save}
                disabled={!name.trim() || saving}
                aria-label={t.save}
              >
                {saving ? (
                  <Loader2 strokeWidth={2.5} strokeLinecap="round" style={{ animation: '_spin .8s linear infinite' }} aria-hidden />
                ) : (
                  <Check strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
                )}
              </button>
            </div>
          </div>

        <div
          className="sheet-body sheet-body--stacked"
          style={{
            paddingBottom: `max(var(--sheet-body-padding-floor), var(--sheet-body-padding-bottom-safe))`,
          }}
        >
          <div className="sheet-form-card">
            <div className="sheet-form-row sheet-form-row--title">
              <input
                ref={ref}
                className="sheet-form-title-input"
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </div>

            <div className="sheet-form-row">
              <span className="sheet-form-label">{t.todoGoalLabel}</span>
              {!hasPremium ? (
                <button
                  type="button"
                  className="sheet-inline-gate-btn"
                  onClick={() => onPremiumGate?.()}
                >
                  <Lock size={15} strokeWidth={2.2} />
                  <span>Premium</span>
                </button>
              ) : !goalLinked ? (
                <span className="sheet-form-select-plain sheet-form-goal-locked-plain">
                  <Lock size={16} strokeWidth={2.2} />
                  {t.goalLockedNoDb}
                </span>
              ) : (
                <div className="settings-select-shell sheet-goal-select">
                  <span
                    className="settings-select-face"
                    style={{ color: goalPageId ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontWeight: goalPageId ? 'var(--font-weight-medium)' : 'var(--font-weight-regular)' }}
                  >
                    {goalFaceLabel}
                  </span>
                  <span className="settings-chevron" aria-hidden>
                    ›
                  </span>
                  <select
                    className="settings-native-select-hidden"
                    aria-label={t.todoGoalLabel}
                    value={goalPageId}
                    onChange={(e) => setGoalPageId(e.target.value)}
                  >
                    <option value="">{t.goalNone}</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {editingTodo && (
              <>
                <div className="sheet-form-row">
                  <span className="sheet-form-label">{t.focusTimeMinLabel || t.fieldAccum}</span>
                  <button
                    type="button"
                    className="sheet-form-value-btn sheet-focus-summary-btn"
                    onClick={() => setFocusWheelOpen((o) => !o)}
                    aria-expanded={focusWheelOpen}
                  >
                    <span className="sheet-form-value-text sheet-focus-summary-text">
                      {formatAccumMinutesLabel(focusWheelMin, 24, ko)}
                    </span>
                    <span className={`settings-chevron sheet-focus-chevron${focusWheelOpen ? ' is-open' : ''}`} aria-hidden>
                      ›
                    </span>
                  </button>
                </div>
                {focusWheelOpen && (
                  <div className="sheet-form-block sheet-focus-expand">
                    <div className="sheet-focus-wheel-wrap sheet-focus-wheel-wrap--full">
                      <TimeWheelPicker
                        variant="wheels"
                        valueMin={focusWheelMin}
                        onChange={setFocusWheelMin}
                        maxHours={24}
                        ko={ko}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="sheet-form-row">
              <span className="sheet-form-label">{t.date}</span>
              <button
                ref={addTodoDateAnchorRef}
                type="button"
                className="sheet-form-date-pill sheet-form-date-pill--light-calendar sheet-form-date-pill--sheet sheet-form-date-pill--compact"
                aria-label={t.date}
                aria-expanded={addTodoDatePopoverOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  hapticLight();
                  setAddTodoDatePopoverOpen((prev) => !prev);
                }}
              >
                {formatCalendarDateLine(date, locale)}
              </button>
            </div>
          </div>
        </div>
        </div>
      </motion.div>
      <HomeTopDatePopover
        open={addTodoDatePopoverOpen}
        onClose={() => setAddTodoDatePopoverOpen(false)}
        anchorRef={addTodoDateAnchorRef}
        selectedDate={date}
        onSelectDate={(d) => {
          if (d) setDate(d);
          setAddTodoDatePopoverOpen(false);
        }}
        ko={ko}
        dismissLabel={t.cancel}
        showJumpToday
        jumpTodayLabel={t.jumpToday}
        ariaLabel={t.date}
        pickAriaLabel={(ymd) => `${formatCalendarDateLine(ymd, locale)}, ${t.date}`}
      />
    </>
  );
}
