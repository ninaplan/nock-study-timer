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
        const state = JSON.parse(raw);
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

  const start = useCallback((todoId, baseAccum = 0) => {
    const state = {
      todoId,
      startedAt: new Date().toISOString(),
      baseAccum,
    };
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    setTimerState(state);
    setElapsed(0);
  }, []);

  // Returns total accumulated minutes (base + current session)
  const stop = useCallback(() => {
    if (!timerState) return null;
    const sessionMin = Math.floor(elapsed / 60);
    const totalMin = timerState.baseAccum + sessionMin;
    localStorage.removeItem(TIMER_KEY);
    setTimerState(null);
    setElapsed(0);
    return { todoId: timerState.todoId, totalMin };
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

  return {
    isRunning,
    activeId,
    elapsed,
    sessionMin,
    sessionSec,
    formatElapsed,
    start,
    stop,
    baseAccum: timerState?.baseAccum || 0,
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
