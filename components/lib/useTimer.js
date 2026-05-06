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

export function useTimer() {
  const [timerState, setTimerState] = useState(null); // { todoId, startedAt, baseAccum }
  const [elapsed, setElapsed] = useState(0); // seconds since startedAt
  const intervalRef = useRef(null);

  // Load timer state from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      if (raw) {
        let parsed = JSON.parse(raw);
        // 앱이 강제 종료됐을 때 _backgroundAt이 남아있으면 정지 시간만큼 startedAt을 앞당김
        if (parsed._backgroundAt) {
          const pausedMs = Date.now() - parsed._backgroundAt;
          parsed = {
            ...parsed,
            startedAt: new Date(new Date(parsed.startedAt).getTime() + pausedMs).toISOString(),
          };
          delete parsed._backgroundAt;
          localStorage.setItem(TIMER_KEY, JSON.stringify(parsed));
        }
        const baseAccumSec = Number.isFinite(parsed?.baseAccumSec)
          ? Math.max(0, parsed.baseAccumSec)
          : Math.max(0, (parsed?.baseAccum || 0) * 60);
        const state = {
          ...parsed,
          baseAccumSec,
          sessionDateKey: parsed.sessionDateKey || localDateKey(new Date(parsed.startedAt || Date.now())),
        };
        setTimerState(state);
        const elapsedSec = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000);
        setElapsed(Math.max(0, elapsedSec));
      }
    } catch {}
  }, []);

  // Tick + 백그라운드/포그라운드 전환 시 정지 시간 제외
  useEffect(() => {
    if (!timerState) {
      setElapsed(0);
      return;
    }

    intervalRef.current = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - new Date(timerState.startedAt).getTime()) / 1000);
      setElapsed(Math.max(0, elapsedSec));
    }, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // 백그라운드 진입 시각 저장
        try {
          const raw = localStorage.getItem(TIMER_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            saved._backgroundAt = Date.now();
            localStorage.setItem(TIMER_KEY, JSON.stringify(saved));
          }
        } catch {}
      } else {
        // 포그라운드 복귀: 정지한 시간만큼 startedAt 앞당겨서 경과 시간에서 제외
        try {
          const raw = localStorage.getItem(TIMER_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved._backgroundAt) {
              const pausedMs = Date.now() - saved._backgroundAt;
              const updated = {
                ...saved,
                startedAt: new Date(new Date(saved.startedAt).getTime() + pausedMs).toISOString(),
              };
              delete updated._backgroundAt;
              localStorage.setItem(TIMER_KEY, JSON.stringify(updated));
              setTimerState(updated);
            }
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timerState]);

  const start = useCallback((todoId, baseAccum = 0, baseAccumSecOverride = null, meta = {}) => {
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
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    setTimerState(state);
    setElapsed(0);
  }, []);

  // Returns total accumulated minutes (base + current session)
  const stop = useCallback(() => {
    if (!timerState) return null;
    const totalSec = (timerState.baseAccumSec || (timerState.baseAccum || 0) * 60) + elapsed;
    const totalMin = Math.floor(totalSec / 60);
    const { taskName, taskDate } = timerState;
    localStorage.removeItem(TIMER_KEY);
    setTimerState(null);
    setElapsed(0);
    return { todoId: timerState.todoId, totalMin, totalSec, taskName, taskDate };
  }, [timerState, elapsed]);

  /** Current session total without stopping (for background / battery-safe checkpoints) */
  const peekSessionTotals = useCallback(() => {
    if (!timerState) return null;
    const totalSec = (timerState.baseAccumSec || (timerState.baseAccum || 0) * 60) + elapsed;
    const totalMin = Math.floor(totalSec / 60);
    return {
      todoId: timerState.todoId,
      totalMin,
      totalSec,
      taskName: timerState.taskName || '',
      taskDate: timerState.taskDate || timerState.sessionDateKey || localDateKey(),
    };
  }, [timerState, elapsed]);

  /**
   * After todos are re-fetched from Notion, align local pre-session time with the server.
   * Otherwise localStorage can keep a huge baseAccum and silentSave will overwrite a manual fix in Notion.
   * Treats `serverAccumMin` as the authoritative total in minutes; keeps current session (elapsed) as-is.
   */
  const reconcileWithServer = useCallback((serverAccumMin) => {
    const serverSec = Math.max(0, Math.floor((Number(serverAccumMin) || 0) * 60));
    setTimerState((prev) => {
      if (!prev) return null;
      const newBaseSec = Math.max(0, serverSec - elapsed);
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
  }, [elapsed]);

  /** When optimistic todo ids are replaced by server ids, keep running timer bound to the new id. */
  const remapTodoId = useCallback((fromId, toId) => {
    const a = String(fromId ?? '').replace(/-/g, '');
    const b = String(toId ?? '').replace(/-/g, '');
    if (!a || !b || a === b) return;
    setTimerState((prev) => {
      if (!prev) return prev;
      const cur = String(prev.todoId ?? '').replace(/-/g, '');
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
  const sessionMin = Math.floor(elapsed / 60);
  const sessionSec = elapsed % 60;

  // Format display
  const formatElapsed = () => {
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  const formatElapsedTotal = () => {
    const baseSec = timerState?.baseAccumSec || (timerState?.baseAccum || 0) * 60;
    const totalSec = baseSec + elapsed;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  /** Total focus (base + session), hours:minutes only — matches minute storage in Notion */
  const formatElapsedTotalHhMm = () => {
    const baseSec = timerState?.baseAccumSec || (timerState?.baseAccum || 0) * 60;
    const totalSec = baseSec + elapsed;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}:${pad(m)}`;
  };

  return {
    isRunning,
    activeId,
    elapsed,
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
