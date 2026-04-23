// components/lib/useTimer.js
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { localDateKey } from '@/app/lib/dateUtils';

const TIMER_KEY = 'nock_timer_state';

/*
  Timer state stored in localStorage:
  {
    todoId: string,
    startedAt: ISO string,
    baseAccum: number (minutes already accumulated before this session)
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
        const parsed = JSON.parse(raw);
        const baseAccumSec = Number.isFinite(parsed?.baseAccumSec)
          ? Math.max(0, parsed.baseAccumSec)
          : Math.max(0, (parsed?.baseAccum || 0) * 60);
        const state = { ...parsed, baseAccumSec };
        setTimerState(state);
        // Calculate already elapsed
        const elapsedSec = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000);
        setElapsed(Math.max(0, elapsedSec));
      }
    } catch {}
  }, []);

  // Tick
  useEffect(() => {
    if (timerState) {
      intervalRef.current = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - new Date(timerState.startedAt).getTime()) / 1000);
        setElapsed(Math.max(0, elapsedSec));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerState]);

  const start = useCallback((todoId, baseAccum = 0, baseAccumSecOverride = null) => {
    const baseAccumSec = Number.isFinite(baseAccumSecOverride)
      ? Math.max(0, baseAccumSecOverride)
      : Math.max(0, baseAccum * 60);
    const state = {
      todoId,
      startedAt: new Date().toISOString(),
      baseAccum,
      baseAccumSec,
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
    localStorage.removeItem(TIMER_KEY);
    setTimerState(null);
    setElapsed(0);
    return { todoId: timerState.todoId, totalMin, totalSec };
  }, [timerState, elapsed]);

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

  return {
    isRunning,
    activeId,
    elapsed,
    sessionMin,
    sessionSec,
    formatElapsed,
    formatElapsedTotal,
    start,
    stop,
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
