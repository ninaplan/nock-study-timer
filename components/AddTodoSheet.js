'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';
import { Loader2, X, Check, Lock } from 'lucide-react';
import { apiFetch } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';

function hourLabel(h, ko) {
  const next = (h + 1) % 24;
  return ko
    ? `${String(h).padStart(2, '0')}:00–${String(next).padStart(2, '0')}:00`
    : `${String(h).padStart(2, '0')}:00–${String(next).padStart(2, '0')}:00`;
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
  onSubscribe,
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateKey());
  /** Edit only: string so empty field (no leading 0 to delete). */
  const [focusMinStr, setFocusMinStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const sheetRootRef = useRef(null);
  const bodyRef = useRef(null);

  const [goals, setGoals] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalPageId, setGoalPageId] = useState('');
  /** @type {Set<number>} */
  const [timeBlockingHours, setTimeBlockingHours] = useState(() => new Set());
  const [blockingOpen, setBlockingOpen] = useState(false);

  useEffect(() => {
    if (editingTodo) {
      setName(editingTodo.name || '');
      setDate(editingTodo.date || localDateKey());
      const a = Math.max(0, Number(editingTodo.accum ?? 0) || 0);
      setFocusMinStr(a === 0 ? '' : String(a));
    } else {
      setName('');
      setDate(defaultTodoDate || localDateKey());
      setFocusMinStr('');
    }
    setGoalPageId('');
    setTimeBlockingHours(new Set());
  }, [editingTodo, defaultTodoDate]);

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
    const overlap = Math.max(0, window.innerHeight - vv.height);
    setKbOffset(overlap > 48 ? overlap : 0);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    vv.addEventListener('resize', syncKeyboardOffset);
    vv.addEventListener('scroll', syncKeyboardOffset);
    syncKeyboardOffset();
    return () => {
      vv.removeEventListener('resize', syncKeyboardOffset);
      vv.removeEventListener('scroll', syncKeyboardOffset);
    };
  }, [syncKeyboardOffset]);

  const scrollFieldIntoView = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        el.scrollIntoView(true);
      }
    });
  }, []);

  const ko = (settings?.lang || 'ko') === 'ko';
  const goalLinked = !!(creds?.dbGoal && String(creds.dbGoal).trim());
  const tbLocked = !hasPremium;

  const toggleHour = (h) => {
    setTimeBlockingHours((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  };

  const blockingSummary = () => {
    if (timeBlockingHours.size === 0) return t.timeBlockingSummaryNone;
    const sorted = [...timeBlockingHours].sort((a, b) => a - b);
    return ko ? `${sorted.length}개 시간대` : `${sorted.length} slot(s)`;
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const accumMin = editingTodo ? Math.max(0, parseInt(focusMinStr, 10) || 0) : 0;
      const tbArr = [...timeBlockingHours].sort((a, b) => a - b);
      await onSave(name.trim(), date, {
        accumMin,
        goalPageId: goalLinked ? goalPageId || undefined : undefined,
        timeBlockingHours: hasPremium ? tbArr : undefined,
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
            transition: 'padding-bottom .18s ease',
          }}
        >
          <div className="sheet-form-card">
            <div className="sheet-form-row" style={{ alignItems: 'center' }}>
              <input
                ref={ref}
                className="sheet-form-select-plain"
                style={{ width: '100%', textAlign: 'left', textAlignLast: 'left', fontWeight: 500, fontSize: 18 }}
                placeholder={t.todoTitlePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={scrollFieldIntoView}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </div>

            <button
              type="button"
              className="sheet-form-row"
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                padding: '12px 0',
                cursor: tbLocked ? 'pointer' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'inherit',
              }}
              onClick={() => {
                if (tbLocked) {
                  onSubscribe?.();
                  return;
                }
                setBlockingOpen(true);
              }}
            >
              <span className="sheet-form-label" style={{ fontSize: 16 }}>
                {t.todoTimeBlockingLabel}
              </span>
              <span
                className="sheet-form-select-plain"
                style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {tbLocked ? (
                  <>
                    <Lock size={16} strokeWidth={2.2} color="var(--text3)" />
                    <span style={{ color: 'var(--text3)' }}>{t.premiumShort}</span>
                  </>
                ) : (
                  <span style={{ opacity: 0.85 }}>{blockingSummary()}</span>
                )}
              </span>
            </button>

            <div className="sheet-form-row" style={{ alignItems: 'center' }}>
              <span className="sheet-form-label" style={{ fontSize: 16 }}>
                {t.todoGoalLabel}
              </span>
              {!goalLinked ? (
                <span className="sheet-form-select-plain" style={{ fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text3)' }}>
                  <Lock size={16} strokeWidth={2.2} />
                  {t.goalLockedNoDb}
                </span>
              ) : goalsLoading ? (
                <span className="sheet-form-select-plain" style={{ fontSize: 15, opacity: 0.6 }}>
                  …
                </span>
              ) : (
                <select
                  className="sheet-form-select-plain"
                  style={{ fontSize: 16, fontWeight: 500, maxWidth: '58%', textAlign: 'right' }}
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
              )}
            </div>

            {editingTodo && (
              <div className="sheet-form-row">
                <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.focusTimeMinLabel || t.fieldAccum}</span>
                <input
                  className="sheet-form-select-plain sheet-form-accum-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder="0"
                  value={focusMinStr}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setFocusMinStr(v);
                  }}
                />
              </div>
            )}
            <div className="sheet-form-row">
              <span className="sheet-form-label" style={{ fontSize: 16 }}>{t.date}</span>
              <input
                className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                style={{ fontSize: 16, maxWidth: '100%' }}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {blockingOpen && !tbLocked && (
        <>
          <div className="backdrop" style={{ opacity: 1, zIndex: 50 }} onClick={() => setBlockingOpen(false)} />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 'max(24px, env(safe-area-inset-bottom))',
              transform: 'translateX(-50%)',
              width: 'min(420px, calc(100vw - 32px))',
              maxHeight: '70vh',
              overflow: 'auto',
              zIndex: 51,
              background: 'var(--bg2)',
              borderRadius: 16,
              border: '1px solid var(--sep)',
              boxShadow: 'var(--shadow)',
              padding: '16px 14px 18px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>{t.timeBlockingPickTitle}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {Array.from({ length: 24 }, (_, h) => {
                const on = timeBlockingHours.has(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHour(h)}
                    style={{
                      minWidth: 108,
                      padding: '8px 6px',
                      borderRadius: 10,
                      border: on ? '2px solid var(--text)' : '1px solid var(--sep)',
                      background: on ? 'var(--bg)' : 'transparent',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                  >
                    {hourLabel(h, ko)}
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn btn-dark btn-md btn-full" style={{ marginTop: 16 }} onClick={() => setBlockingOpen(false)}>
              {t.btnOk || 'OK'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
