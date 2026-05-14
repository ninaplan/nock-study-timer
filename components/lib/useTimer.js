// components/lib/useTimer.js
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';

export const NOCK_TIMER_STATE_KEY = 'nock_timer_state';
export const NOCK_TIMER_PAUSED_KEY = 'nock_timer_paused';
const TIMER_KEY = NOCK_TIMER_STATE_KEY;

/*
  Timer state stored in localStorage:
  {
    todoId: string,
    startedAt: ISO string,
    baseAccum: number (minutes already accumulated before this session)
    taskName?: string,
    taskDate?: string (YYYY-MM-DD, calendar day for the todo)
  }
*/

export function normalizeTimerTodoId(id) {
  return String(id ?? '').replace(/-/g, '');
}

function persistCleanedTimerState(state) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** localStorage JSON → 검증·정규화된 state (무효면 null) */
function storedJsonToTimerState(parsed) {
  if (!parsed || typeof parsed !== 'object' || !parsed.startedAt || parsed.todoId == null) return null;
  const t0 = new Date(parsed.startedAt).getTime();
  if (Number.isNaN(t0)) return null;
  /* 예전 버전: 백그라운드용 _backgroundAt — startedAt 유지, 키만 제거 */
  const copy = { ...parsed };
  if (copy._backgroundAt) delete copy._backgroundAt;
  const baseAccumSec = Number.isFinite(copy.baseAccumSec)
    ? Math.max(0, copy.baseAccumSec)
    : Math.max(0, (copy.baseAccum || 0) * 60);
  return {
    ...copy,
    baseAccumSec,
    baseAccum: Number.isFinite(copy.baseAccum)
      ? Math.max(0, copy.baseAccum)
      : Math.floor(baseAccumSec / 60),
    sessionDateKey: copy.sessionDateKey || localDateKey(new Date(copy.startedAt)),
  };
}

function readTimerStateFromLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const hadBackground = Boolean(parsed?._backgroundAt);
    const state = storedJsonToTimerState(parsed);
    if (!state) return null;
    if (hadBackground) persistCleanedTimerState(state);
    return state;
  } catch {
    return null;
  }
}

/** 현재 측정 세션 길이(초) — tick 누적 금지, 항상 벽시계 기준 */
export function sessionElapsedSecFromState(state) {
  if (!state?.startedAt) return 0;
  const t0 = new Date(state.startedAt).getTime();
  if (Number.isNaN(t0)) return 0;
  return Math.max(0, Math.floor((Date.now() - t0) / 1000));
}

export function useTimer() {
  const [timerState, setTimerState] = useState(() => readTimerStateFromLocalStorage());
  const [elapsed, setElapsed] = useState(() => {
    const s = readTimerStateFromLocalStorage();
    return s ? sessionElapsedSecFromState(s) : 0;
  });
  const intervalRef = useRef(null);
  const timerStateRef = useRef(null);
  timerStateRef.current = timerState;

  // setInterval 은 UI 갱신용만 — 매 틱마다 Date.now()-startedAt 으로 덮어씀 (백그라운드 스로틀 후에도 복귀 시 정확)
  useEffect(() => {
    if (!timerState) {
      setElapsed(0);
      return undefined;
    }

    const tick = () => {
      const s = timerStateRef.current;
      if (!s) return;
      setElapsed(sessionElapsedSecFromState(s));
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    const handleSync = () => tick();
    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    window.addEventListener('pageshow', handleSync);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('pageshow', handleSync);
    };
  }, [timerState]);

  const start = useCallback((todoId, baseAccum = 0, baseAccumSecOverride = null, meta = {}) => {
    const target = normalizeTimerTodoId(todoId);
    const persisted = readTimerStateFromLocalStorage();
    if (
      persisted &&
      target &&
      normalizeTimerTodoId(persisted.todoId) === target
    ) {
      const taskNameMeta = typeof meta.taskName === 'string' ? meta.taskName.trim() : '';
      const taskDateMeta =
        typeof meta.taskDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(meta.taskDate)
          ? meta.taskDate.slice(0, 10)
          : null;
      const state = {
        ...persisted,
        todoId,
        taskName: taskNameMeta || persisted.taskName || '',
        taskDate: taskDateMeta || persisted.taskDate || persisted.sessionDateKey || localDateKey(),
      };
      persistCleanedTimerState(state);
      setTimerState(state);
      setElapsed(sessionElapsedSecFromState(state));
      return;
    }

    const baseAccumSec = Number.isFinite(baseAccumSecOverride)
      ? Math.max(0, baseAccumSecOverride)
      : Math.max(0, baseAccum * 60);
    const sessionDateKey = localDateKey();
    const taskName = typeof meta.taskName === 'string' ? meta.taskName.trim() : '';
    const taskDate =
      typeof meta.taskDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(meta.taskDate)
        ? meta.taskDate.slice(0, 10)
        : localDateKey();
    const state = {
      todoId,
      startedAt: new Date().toISOString(),
      baseAccum,
      baseAccumSec,
      sessionDateKey,
      taskName,
      taskDate,
    };
    persistCleanedTimerState(state);
    setTimerState(state);
    setElapsed(sessionElapsedSecFromState(state));
  }, []);

  // Returns total accumulated minutes (base + current session)
  const stop = useCallback(() => {
    if (!timerState) return null;
    const sessionSec = sessionElapsedSecFromState(timerState);
    const totalSec = (timerState.baseAccumSec || (timerState.baseAccum || 0) * 60) + sessionSec;
    const totalMin = Math.floor(totalSec / 60);
    const { taskName, taskDate } = timerState;
    localStorage.removeItem(TIMER_KEY);
    setTimerState(null);
    setElapsed(0);
    return { todoId: timerState.todoId, totalMin, totalSec, taskName, taskDate };
  }, [timerState]);

  /** Current session total without stopping (for background / battery-safe checkpoints) */
  const peekSessionTotals = useCallback(() => {
    if (!timerState) return null;
    const sessionSec = sessionElapsedSecFromState(timerState);
    const totalSec = (timerState.baseAccumSec || (timerState.baseAccum || 0) * 60) + sessionSec;
    const totalMin = Math.floor(totalSec / 60);
    return {
      todoId: timerState.todoId,
      totalMin,
      totalSec,
      taskName: timerState.taskName || '',
      taskDate: timerState.taskDate || timerState.sessionDateKey || localDateKey(),
    };
  }, [timerState]);

  /**
   * After todos are re-fetched from Notion, align local pre-session time with the server.
   * 반드시 벽시계 세션 길이로 맞춤 — React state `elapsed`(틱이 늦을 때)를 쓰면 base가 과대·이중 카운트 됨.
   */
  const reconcileWithServer = useCallback((serverAccumMin) => {
    const serverSec = Math.max(0, Math.floor((Number(serverAccumMin) || 0) * 60));
    setTimerState((prev) => {
      if (!prev) return null;
      const sessionSec = sessionElapsedSecFromState(prev);
      const newBaseSec = Math.max(0, serverSec - sessionSec);
      const next = {
        ...prev,
        baseAccum: Math.floor(newBaseSec / 60),
        baseAccumSec: newBaseSec,
        taskName: prev.taskName,
        taskDate: prev.taskDate,
      };
      try {
        localStorage.setItem(TIMER_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }, []);

  /** When optimistic todo ids are replaced by server ids, keep running timer bound to the new id. */
  const remapTodoId = useCallback((fromId, toId) => {
    const a = normalizeTimerTodoId(fromId);
    const b = normalizeTimerTodoId(toId);
    if (!a || !b || a === b) return;
    setTimerState((prev) => {
      if (!prev) return prev;
      const cur = normalizeTimerTodoId(prev.todoId);
      if (cur !== a) return prev;
      const next = { ...prev, todoId: toId };
      try {
        localStorage.setItem(TIMER_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }, []);

  const isRunning = !!timerState;
  const activeId = timerState?.todoId || null;

  const liveSessionSec = timerState ? sessionElapsedSecFromState(timerState) : elapsed;
  const sessionMin = Math.floor(liveSessionSec / 60);
  const sessionSec = liveSessionSec % 60;

  // Format display — 호출 시점의 벽시계 기준(리렌더 없이 호출돼도 peek/stop 과 일치하도록 state에서 재계산)
  const formatElapsed = () => {
    const sec = timerState ? sessionElapsedSecFromState(timerState) : elapsed;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  const formatElapsedTotal = () => {
    if (!timerState) return '0:00';
    const baseSec = timerState.baseAccumSec || (timerState.baseAccum || 0) * 60;
    const totalSec = baseSec + sessionElapsedSecFromState(timerState);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  /** Total focus (base + session), hours:minutes only — matches minute storage in Notion */
  const formatElapsedTotalHhMm = () => {
    if (!timerState) return '0:00';
    const baseSec = timerState.baseAccumSec || (timerState.baseAccum || 0) * 60;
    const totalSec = baseSec + sessionElapsedSecFromState(timerState);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}:${pad(m)}`;
  };

  return {
    isRunning,
    activeId,
    elapsed: liveSessionSec,
    sessionMin,
    sessionSec,
    sessionDateKey: timerState?.sessionDateKey || null,
    formatElapsed,
    formatElapsedTotal,
    formatElapsedTotalHhMm,
    start,
    stop,
    peekSessionTotals,
    reconcileWithServer,
    remapTodoId,
    baseAccum: Math.floor((timerState?.baseAccumSec || (timerState?.baseAccum || 0) * 60) / 60),
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Session log for planner view
const SESSION_LOG_KEY = 'nock_session_log';

export function logSession(todoId, todoName, startedAt, endedAt, minutes) {
  try {
    const raw = localStorage.getItem(SESSION_LOG_KEY);
    const log = raw ? JSON.parse(raw) : [];
    const today = localDateKey();
    // Keep only today's logs
    const todayLog = log.filter((s) => s.date === today);
    todayLog.push({ todoId, todoName, startedAt, endedAt, minutes, date: today });
    // Keep last 7 days worth + today
    localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(todayLog.slice(-200)));
  } catch {}
}

export function getTodaySessions() {
  try {
    const raw = localStorage.getItem(SESSION_LOG_KEY);
    if (!raw) return [];
    const log = JSON.parse(raw);
    const today = localDateKey();
    return log.filter((s) => s.date === today);
  } catch {
    return [];
  }
}
