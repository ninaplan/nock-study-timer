'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';
import { Loader2, X, Check, Lock } from 'lucide-react';
import { apiFetch } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { getLocale } from '@/app/lib/i18n';
import TimeWheelPicker, { formatAccumMinutesLabel } from './TimeWheelPicker';

function normId(id) {
  return String(id || '').replace(/-/g, '');
}

export default function AddTodoSheet({
  t,
  onSave,
  onClose,
  editingTodo,
  creds = null,
  settings = {},
  defaultTodoDate,
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [focusWheelMin, setFocusWheelMin] = useState(0);
  const [saving, setSaving] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const sheetRootRef = useRef(null);
  const bodyRef = useRef(null);
  const kbBlurTimersRef = useRef([]);

  const [goals, setGoals] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalPageId, setGoalPageId] = useState('');
  const [focusWheelOpen, setFocusWheelOpen] = useState(false);

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
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 320);
  }, [closing, onClose]);

  useEffect(() => {
    const t0 = setTimeout(() => ref.current?.focus(), 200);
    return () => clearTimeout(t0);
  }, [editingTodo]);

  const syncKeyboardOffset = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) {
      setKbOffset(0);
      return;
    }
    const gap = window.innerHeight - vv.height;
    setKbOffset(gap > 40 ? gap : 0);
  }, []);

  const clearKbBlurTimers = useCallback(() => {
    kbBlurTimersRef.current.forEach((id) => clearTimeout(id));
    kbBlurTimersRef.current = [];
  }, []);

  const onTitleBlur = useCallback(() => {
    clearKbBlurTimers();
    syncKeyboardOffset();
    [60, 180, 380, 650].forEach((ms) => {
      kbBlurTimersRef.current.push(
        window.setTimeout(() => {
          syncKeyboardOffset();
        }, ms)
      );
    });
  }, [clearKbBlurTimers, syncKeyboardOffset]);

  useEffect(() => {
    const vv = window.visualViewport;
    const run = () => syncKeyboardOffset();
    window.addEventListener('resize', run);
    if (vv) {
      vv.addEventListener('resize', run);
      vv.addEventListener('scroll', run);
    }
    run();
    return () => {
      window.removeEventListener('resize', run);
      if (vv) {
        vv.removeEventListener('resize', run);
        vv.removeEventListener('scroll', run);
      }
      clearKbBlurTimers();
    };
  }, [syncKeyboardOffset, clearKbBlurTimers]);

  const ko = getLocale(settings?.lang) === 'ko';
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
      <div
        className="backdrop"
        onClick={requestClose}
        style={{
          opacity: entered && !closing ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
      />
      <div
        ref={sheetRootRef}
        className="sheet"
        style={{
          transform:
            entered && !closing ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100%)',
          transition: 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)',
          animation: 'none',
        }}
      >
        <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--top" aria-hidden />
        <div className="chrome-bottom-sheet-edge chrome-bottom-sheet-edge--bottom" aria-hidden />
        <div className="sheet-handle" aria-hidden />
        <div className="sheet-topbar">
          <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={requestClose} aria-label={t.cancel}>
            <X size={22} strokeWidth={2.2} />
          </button>
          <span className="sheet-topbar-title">{editingTodo ? t.editTodo : t.addTodo}</span>
          <button
            type="button"
            className="nav-circle-btn nav-circle-btn--confirm"
            onClick={save}
            disabled={!name.trim() || saving}
            aria-label={t.save}
          >
            {saving ? <Loader2 size={22} strokeWidth={2.2} style={{ animation: '_spin .8s linear infinite' }} /> : <Check size={22} strokeWidth={2.5} />}
          </button>
        </div>

        <div
          ref={bodyRef}
          className="sheet-body"
          style={{
            paddingBottom: `max(${Math.max(28, 20 + kbOffset)}px, calc(env(safe-area-inset-bottom) + 20px))`,
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
                onBlur={onTitleBlur}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </div>

            <div className="sheet-form-row">
              <span className="sheet-form-label">{t.todoGoalLabel}</span>
              {!goalLinked ? (
                <span className="sheet-form-select-plain" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, color: 'var(--text3)' }}>
                  <Lock size={16} strokeWidth={2.2} />
                  {t.goalLockedNoDb}
                </span>
              ) : (
                <div className="settings-select-shell sheet-goal-select">
                  <span
                    className="settings-select-face"
                    style={{ color: goalPageId ? 'var(--text)' : 'var(--text3)', fontWeight: goalPageId ? 500 : 400 }}
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
              <input
                className="sheet-form-date-pill sheet-form-date-pill--light-calendar sheet-form-date-pill--sheet"
                style={{ maxWidth: '100%' }}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
