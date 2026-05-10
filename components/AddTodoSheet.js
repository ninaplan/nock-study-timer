'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';
import { Loader2, X, Check, Lock } from 'lucide-react';
import { apiFetch } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { getLocale } from '@/app/lib/i18n';
import TimeWheelPicker, { formatAccumMinutesLabel } from './TimeWheelPicker';
import IosDiscardDialog from './IosDiscardDialog';

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
  const [kbOffset, setKbOffset] = useState(0);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const baselineRef = useRef({
    name: '',
    date: '',
    goalKey: '',
    focusWheelMin: 0,
  });
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

  useEffect(() => {
    const d0 = defaultTodoDate || localDateKey();
    if (editingTodo) {
      const gk = normGoalKey(editingTodo.goalPageId);
      const a = Math.max(0, Number(editingTodo.accum ?? 0) || 0);
      baselineRef.current = {
        name: String(editingTodo.name || '').trim(),
        date: editingTodo.date || d0,
        goalKey: gk,
        focusWheelMin: Math.min(1440, Math.round(a)),
      };
    } else {
      baselineRef.current = {
        name: '',
        date: d0,
        goalKey: '',
        focusWheelMin: 0,
      };
    }
  }, [editingTodo?.id, defaultTodoDate]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 320);
  }, [closing, onClose]);

  const isDirty = useMemo(() => {
    const b = baselineRef.current;
    const nameTrim = String(name || '').trim();
    const dk = normGoalKey(goalPageId);
    if (editingTodo) {
      return (
        nameTrim !== b.name ||
        date !== b.date ||
        dk !== b.goalKey ||
        focusWheelMin !== b.focusWheelMin
      );
    }
    return (
      nameTrim !== '' ||
      date !== b.date ||
      dk !== ''
    );
  }, [name, date, goalPageId, focusWheelMin, editingTodo]);

  const confirmLeave = useCallback(() => {
    if (closing) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    requestClose();
  }, [closing, isDirty, requestClose]);

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
      <IosDiscardDialog
        open={discardOpen}
        title={t.discardChangesTitle}
        discardLabel={t.discardChangesConfirm}
        zBase={10060}
        onDiscard={() => {
          setDiscardOpen(false);
          requestClose();
        }}
        onKeep={() => setDiscardOpen(false)}
      />
      <div
        className="backdrop"
        onClick={confirmLeave}
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
        <div className="sheet-handle-wrap" aria-hidden>
          <div className="sheet-handle" />
        </div>
        <div className="sheet-topbar sheet-topbar--flush">
          <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={confirmLeave} aria-label={t.cancel}>
            <X strokeWidth={2} strokeLinecap="round" aria-hidden />
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
              <Loader2 strokeWidth={2} strokeLinecap="round" style={{ animation: '_spin .8s linear infinite' }} aria-hidden />
            ) : (
              <Check strokeWidth={2.35} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
            )}
          </button>
        </div>

        <div
          ref={bodyRef}
          className="sheet-body sheet-body--stacked"
          style={{
            paddingBottom: `max(var(--sheet-body-padding-floor), calc(var(--sheet-body-keyboard-inner-pad) + ${kbOffset}px), var(--sheet-body-padding-bottom-safe))`,
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
              {!hasPremium ? (
                <button
                  type="button"
                  onClick={() => onPremiumGate?.()}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font)', fontSize: 'var(--font-size-subhead)' }}
                >
                  <Lock size={15} strokeWidth={2.2} />
                  <span>Premium</span>
                </button>
              ) : !goalLinked ? (
                <span className="sheet-form-select-plain" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, color: 'var(--color-text-tertiary)' }}>
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
