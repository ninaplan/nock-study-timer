'use client';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Plus, Check, X, Trash2, Pause, Play, TriangleAlert, ClipboardList, Pencil, ChevronRight, RotateCcw } from 'lucide-react';
import { NOCK_TIMER_PAUSED_KEY, useTimer } from './lib/useTimer';
import { apiFetch } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { localDateKey } from '@/app/lib/dateUtils';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';
import PopupDialog from './PopupDialog';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import TimeWheelPicker from './TimeWheelPicker';
import { hapticLight, hapticMedium, hapticSelect, hapticSuccess } from './lib/haptics';

// ── Utils ─────────────────────────────────────────────────────
const fmtMin = (m, ko) => {
  if (!m) return ko ? '0분' : '0m';
  const h = Math.floor(m/60), r = m%60;
  if (ko) { if(h&&r) return `${h}시간 ${r}분`; if(h) return `${h}시간`; return `${r}분`; }
  if(h&&r) return `${h}h ${r}m`; if(h) return `${h}h`; return `${r}m`;
};
const todayStr = () => localDateKey();
const fmtDate  = (lo) => {
  const d = new Date();
  if (lo === 'ko') return `${d.getMonth()+1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
};
/** Notion 할 일 ID는 하이픈 유무가 달라질 수 있어 비교 시 정규화 */
const normalizeTodoId = (id) => String(id ?? '').replace(/-/g, '');
const findTodoById = (list, id) => list.find((x) => normalizeTodoId(x.id) === normalizeTodoId(id));
/** `YYYY-MM-DD` 한 줄 표시 (저장 팝업 등) */
const formatCalendarDateLine = (dateStr, loc) => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Number(m[1]), mo - 1, d);
  if (loc === 'ko') return `${mo}월 ${d}일 ${'일월화수목금토'[dt.getDay()]}요일`;
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
/** Display only hours:minutes from seconds (floored) — aligns with minute-only Notion accum */
const fmtHhMm = (sec) => {
  const totalSec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

/** Same clock as measure view (m:ss / h:m:ss) — use when paused so seconds stay visible, frozen */
const formatTotalSecClock = (sec) => {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const PAUSED_KEY = NOCK_TIMER_PAUSED_KEY;
const CACHE_KEY  = 'nock_todos_cache';
const CACHE_TTL  = 5 * 60 * 1000;

function loadCache(d) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o.date !== d || Date.now() - o.ts > CACHE_TTL) return null;
    return o.todos;
  } catch { return null; }
}
function saveCache(d, t) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ date:d, todos:t, ts:Date.now() })); } catch {}
}

export default function HomeTab({ t, creds, settings, isDemoMode, onSheetOpenChange }) {
  const [todos,      setTodos]      = useState([]);
  const [loading,    setLoading]    = useState(() => !isDemoMode);
  const [error,      setError]      = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [sheet,      setSheet]      = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [reportId,   setReportId]   = useState(null);
  const [paused,     setPausedRaw]  = useState(null);
  const [pulling,    setPulling]    = useState(false);
  // Confirm dialog when switching task while timer is running
  const [confirmSwitch, setConfirmSwitch] = useState(null); // { newTodoId }
  const [confirmDelete, setConfirmDelete] = useState(null); // { todoId, todoName }
  const [confirmReset, setConfirmReset] = useState(null); // { todoId, todoName }
  const [popupError, setPopupError] = useState('');
  const [feedbackInitialText, setFeedbackInitialText] = useState('');
  const [feedbackMemoText, setFeedbackMemoText] = useState('');
  const [editingTodo, setEditingTodo] = useState(null); // { id, name, date } | null
  /** 상단 타이머 탭 → 시간 휠 저장 (`openedWheelMin`: 열었을 때 분 — 휠 미수정 시 체크에서 실시간 peek 우선) */
  const [timerSaveUi, setTimerSaveUi] = useState(null); // null | { todoId, taskName, taskDate, wheelTotalMin, openedWheelMin }

  const pullStartY = useRef(null);
  const locale = settings?.lang || 'ko';
  const ko     = locale === 'ko';
  const timer  = useTimer();
  const timerRef = useRef(timer);
  const pausedRef = useRef(null);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const fmt    = (m) => fmtMin(m, ko);
  const updateTodos = (updater) => {
    setTodos((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveCache(todayStr(), next);
      return next;
    });
  };

  const setPaused = (v) => {
    setPausedRaw(v);
    if (v) localStorage.setItem(PAUSED_KEY, JSON.stringify(v));
    else   localStorage.removeItem(PAUSED_KEY);
  };

  // DB/토큰(노션 컨텍스트)이 바뀌면: 가능하면 누적 집중시간을 이전 DB에 저장한 뒤 타이머·멈춤 UI 초기화
  const credsKeyForTimer = (c) =>
    JSON.stringify({ d: c?.dbTodo, r: c?.dbReport, a: c?.authMode, t: c?.token || '' });
  const priorCredsForTimerRef = useRef(null);
  useEffect(() => {
    const prior = priorCredsForTimerRef.current;
    priorCredsForTimerRef.current = creds;
    if (prior === null) return;
    if (credsKeyForTimer(prior) === credsKeyForTimer(creds)) return;
    if (isDemoMode) return;

    (async () => {
      const tr = timerRef.current;
      if (tr.isRunning) {
        const p = tr.peekSessionTotals();
        if (p && hasNotionAuth(prior) && p.todoId) {
          try {
            await apiFetch(
              `/api/todos/${p.todoId}`,
              { method: 'PATCH', body: JSON.stringify({ accum: p.totalMin }) },
              prior,
              settings
            );
          } catch { /* */ }
        }
        tr.stop();
      } else {
        const pz = pausedRef.current;
        if (pz?.todoId && hasNotionAuth(prior)) {
          const acc = Number(pz.savedAccum) || 0;
          try {
            await apiFetch(
              `/api/todos/${pz.todoId}`,
              { method: 'PATCH', body: JSON.stringify({ accum: acc }) },
              prior,
              settings
            );
          } catch { /* */ }
        }
      }
      setPaused(null);
    })();
  }, [creds, isDemoMode, settings]);

  useEffect(() => {
    try { const r = localStorage.getItem(PAUSED_KEY); if(r) setPausedRaw(JSON.parse(r)); } catch {}
  }, []);

  useEffect(() => {
    onSheetOpenChange?.(sheet === 'add' || sheet === 'feedback');
    return () => onSheetOpenChange?.(false);
  }, [sheet, onSheetOpenChange]);

  const openEditTodo = (todo) => {
    setSelectedId(null);
    setEditingTodo({
      id: todo.id,
      name: todo.name,
      date: todo.date,
      accum: todo.accum || 0,
      accumSec: Number.isFinite(todo?.accumSec) ? todo.accumSec : null,
    });
    setSheet('add');
  };

  // ── Load todos ─────────────────────────────────────────────
  /** `background: true` = silent refresh (no full-screen loader); use after optimistic UI updates. */
  const loadTodos = async (opts = {}) => {
    const { background = false } = opts;
    try {
      const dbTodo = creds ? creds.dbTodo : null;

      if (isDemoMode || !hasNotionAuth(creds) || !dbTodo) {
        setTodos([
          { id:'1', name:'운영체제 강의 듣기', date:todayStr(), done:false, accum:45 },
          { id:'2', name:'알고리즘 문제 풀기',  date:todayStr(), done:true,  accum:90 },
          { id:'3', name:'영어 단어 외우기',    date:todayStr(), done:false, accum:0  },
        ]);
        setLoading(false); setPulling(false); return;
      }

      const today  = todayStr();
      const cached = loadCache(today);
      if (!background) {
        if (cached) { setTodos(cached); setLoading(false); }
        else { setLoading(true); }
      }
      setError('');

      const data = await apiFetch(
        '/api/todos?date=' + encodeURIComponent(today) + '&_=' + Date.now(),
        { method: 'GET' },
        creds,
        settings
      );
      const list = Array.isArray(data?.todos) ? data.todos : [];
      saveCache(today, list);
      setTodos(list);
      const tr = timerRef.current;
      if (tr?.isRunning && tr.peekSessionTotals && tr.reconcileWithServer) {
        const row = list.find((x) => normalizeTodoId(x.id) === normalizeTodoId(tr.activeId));
        if (row) {
          const p = tr.peekSessionTotals();
          if (p && p.todoId === row.id && Math.abs(p.totalMin - (row.accum || 0)) > 1) {
            tr.reconcileWithServer(row.accum);
          }
        }
      }
      setPausedRaw((p) => {
        if (!p) return p;
        const row = list.find((x) => x.id === p.todoId);
        if (!row) return p;
        const sec = Math.max(0, (row.accum || 0) * 60);
        const next = {
          ...p,
          savedAccum: row.accum,
          savedSec: sec,
          display: formatTotalSecClock(sec),
          taskName: typeof row.name === 'string' ? row.name.trim() : p.taskName,
          taskDate: row.date || p.taskDate,
        };
        try {
          localStorage.setItem(PAUSED_KEY, JSON.stringify(next));
        } catch {
        }
        return next;
      });
    } catch (e) {
      const type = e?.constructor?.name || 'Error';
      const msg  = e?.message || String(e) || '알 수 없는 오류';
      setError('[' + type + '] ' + msg);
    } finally {
      if (!background) setLoading(false);
      setPulling(false);
    }
  };

  // Hydrate from local cache before first paint (avoids empty list / full-screen loader flash on HMR)
  useLayoutEffect(() => {
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    if (!hasNotionAuth(creds) || !creds?.dbTodo) return;
    const today = todayStr();
    const cached = loadCache(today);
    if (cached) {
      setTodos(cached);
      setLoading(false);
    }
  }, [isDemoMode, creds, creds?.dbTodo]);

  useEffect(() => { loadTodos(); }, [creds, creds?.dbTodo, isDemoMode]); // eslint-disable-line

  // Stuck on full-screen loader (slow network / hung API) — recover instead of a permanent blank
  useEffect(() => {
    if (!loading || isDemoMode) return;
    const t = setTimeout(() => {
      setLoading(false);
      setError((e) => e || (ko
        ? '불러오는 데 너무 오래 걸렸어요. 인터넷과 노션 연결을 확인한 뒤, 아래에서 다시 시도하거나 화면을 당겨 새로고침해요.'
        : 'Loading is taking too long. Check your connection and try again, or pull to refresh.'));
    }, 25000);
    return () => clearTimeout(t);
  }, [loading, isDemoMode, ko]);

  // Pull-to-refresh
  const onTouchStart = (e) => { pullStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e) => {
    if (pullStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - pullStartY.current;
    pullStartY.current = null;
    if (dy > 60) {
      hapticLight();
      setPulling(true);
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
      }
      loadTodos();
    }
  };

  // ── Derived state ──────────────────────────────────────────
  // Sort: active first, then completed
  const sortedTodos = [
    ...todos.filter(t => !t.done),
    ...todos.filter(t => t.done),
  ];

  const totalMin  = todos.reduce((s,t) => s+(t.accum||0), 0);
  const doneCount = todos.filter(t => t.done).length;
  const pct       = todos.length ? Math.round(doneCount/todos.length*100) : 0;
  const activeTimerInToday = timer.isRunning && todos.some((t) => t.id === timer.activeId);
  const headerTotalMin     = totalMin + (timer.isRunning ? (activeTimerInToday ? timer.sessionMin : (timer.baseAccum + timer.sessionMin)) : 0);
  const selected  = todos.find(t => t.id === selectedId);
  const isRunning = timer.isRunning && timer.activeId === selectedId;
  const isPaused  = !timer.isRunning && paused?.todoId === selectedId;

  // ── Card selection — ask before switching while timer runs (today only) ─
  const handleSelect = (todo) => {
    if (todo.date && todo.date !== todayStr()) return;
    if (selectedId === todo.id) { setSelectedId(null); return; }
    // Timer is running on a DIFFERENT todo → confirm
    if (timer.isRunning && timer.activeId !== todo.id) {
      setConfirmSwitch({ newTodoId: todo.id });
      return;
    }
    setSelectedId(todo.id);
  };

  const confirmSwitchTask = () => {
    if (!confirmSwitch) return;
    const nextId = confirmSwitch.newTodoId;
    const r = timer.stop();
    setConfirmSwitch(null);
    setSelectedId(nextId);
    if (r) {
      updateTodos((p) => p.map((t) => (t.id === r.todoId ? { ...t, accum: r.totalMin, accumSec: r.totalSec } : t)));
      silentSave(r.todoId, r.totalMin).catch(() => {});
    }
  };

  // ── Timer actions ──────────────────────────────────────────
  const handleStart = () => {
    if (!selected) return;
    const base = isPaused ? (paused.savedAccum ?? selected.accum ?? 0) : (selected.accum ?? 0);
    const baseSec = isPaused ? paused?.savedSec : (Number.isFinite(selected?.accumSec) ? selected.accumSec : null);
    if (isPaused) setPaused(null);
    // Uncheck if done
    if (selected.done) {
      updateTodos(p => p.map(t => t.id === selected.id ? { ...t, done: false } : t));
      if (!isDemoMode && hasNotionAuth(creds)) {
        apiFetch(`/api/todos/${selected.id}`, { method:'PATCH', body:JSON.stringify({ done:false }) }, creds, settings).catch(() => {});
      }
    }
    timer.start(selected.id, base, baseSec, {
      taskName: typeof selected.name === 'string' ? selected.name : '',
      taskDate: selected.date || todayStr(),
    });
  };

  const handlePause = async () => {
    const r = timer.stop();
    if (!r) return;
    const row = findTodoById(todos, r.todoId);
    const taskName = (r.taskName && String(r.taskName).trim()) || (typeof row?.name === 'string' ? row.name.trim() : '');
    const taskDate = r.taskDate || row?.date || todayStr();
    setPaused({
      todoId: r.todoId,
      savedAccum: r.totalMin,
      savedSec: r.totalSec,
      display: formatTotalSecClock(r.totalSec),
      taskName,
      taskDate,
    });
    await silentSave(r.todoId, r.totalMin);
    updateTodos((p) =>
      p.map((t) =>
        normalizeTodoId(t.id) === normalizeTodoId(r.todoId) ? { ...t, accum: r.totalMin, accumSec: r.totalSec } : t
      )
    );
  };

  const handleComplete = async (todoId) => {
    const todo = todoId ? todos.find((t) => t.id === todoId) : selected;
    if (!todo) return;
    hapticMedium();
    const isCur = todo.id === selectedId;
    const isTodayRow = (todo.date || todayStr()) === todayStr();
    let fin = todo.accum || 0;
    let finSec = Number.isFinite(todo?.accumSec) ? todo.accumSec : Math.max(0, (todo.accum || 0) * 60);
    if (isCur && isRunning) {
      const r = timer.stop();
      if (r) {
        fin = r.totalMin;
        finSec = r.totalSec;
      }
    } else if (isCur && isPaused) {
      fin = paused.savedAccum ?? todo.accum ?? 0;
      finSec = paused.savedSec ?? Math.max(0, fin * 60);
      setPaused(null);
    } else if (!isCur && timer.isRunning && timer.activeId === todo.id) {
      const r = timer.stop();
      if (r) {
        fin = r.totalMin;
        finSec = r.totalSec;
      }
    } else if (!isCur && !timer.isRunning && paused?.todoId === todo.id) {
      fin = paused.savedAccum ?? todo.accum ?? 0;
      finSec = paused.savedSec ?? Math.max(0, fin * 60);
      setPaused(null);
    }

    const nextDone = !todo.done;
    updateTodos((p) => p.map((t) => (t.id === todo.id ? { ...t, done: nextDone, accum: fin, accumSec: finSec } : t)));
    if (isCur) setSelectedId(null);

    if (isDemoMode || !hasNotionAuth(creds)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${todo.id}`, { method:'PATCH', body:JSON.stringify({ done: nextDone, accum: fin }) }, creds, settings);
    } catch {}
    finally { setSaving(false); }
  };

  const handleResetTime = async (todoId) => {
    if (!todos.find((x) => x.id === todoId)) return;
    hapticMedium();
    if (timer.isRunning && timer.activeId === todoId) timer.stop();
    if (paused?.todoId === todoId) setPaused(null);
    updateTodos((p) => p.map((t) => (t.id === todoId ? { ...t, accum: 0, accumSec: 0 } : t)));
    if (isDemoMode || !hasNotionAuth(creds)) return;
    apiFetch(`/api/todos/${todoId}`, { method: 'PATCH', body: JSON.stringify({ accum: 0 }) }, creds, settings).catch((e) =>
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + (e?.message || String(e)))
    );
  };

  const handleDelete = async (todoId) => {
    hapticMedium();
    updateTodos((p) => p.filter((t) => t.id !== todoId));
    if (selectedId === todoId) setSelectedId(null);
    if (timer.activeId === todoId) timer.stop();
    if (isDemoMode || !hasNotionAuth(creds)) return;
    apiFetch(`/api/todos/${todoId}`, { method:'DELETE' }, creds, settings).catch(() => {});
  };

  const silentSave = useCallback(async (id, min, opts = {}) => {
    if (isDemoMode || !hasNotionAuth(creds)) return;
    try {
      await apiFetch(
        `/api/todos/${id}`,
        { method: 'PATCH', body: JSON.stringify({ accum: min }), keepalive: !!opts.keepalive },
        creds,
        settings
      );
    } catch {}
  }, [isDemoMode, creds, settings]);

  const openHeaderTimerSave = () => {
    hapticLight();
    if (timer.isRunning) {
      const p = timer.peekSessionTotals();
      if (!p) return;
      const row = findTodoById(todos, p.todoId);
      const taskName =
        (p.taskName && String(p.taskName).trim()) || (typeof row?.name === 'string' ? row.name.trim() : '');
      const taskDate = p.taskDate || row?.date || todayStr();
      const wm = p.totalMin;
      setTimerSaveUi({
        todoId: p.todoId,
        taskName,
        taskDate,
        wheelTotalMin: wm,
        openedWheelMin: wm,
      });
    } else if (paused?.todoId) {
      const tm = Math.max(0, Number(paused.savedAccum) || 0);
      const row = findTodoById(todos, paused.todoId);
      const taskName =
        (paused.taskName && String(paused.taskName).trim()) ||
        (typeof row?.name === 'string' ? row.name.trim() : '');
      const taskDate = paused.taskDate || row?.date || todayStr();
      setTimerSaveUi({
        todoId: paused.todoId,
        taskName,
        taskDate,
        wheelTotalMin: tm,
        openedWheelMin: tm,
      });
    }
  };

  const handleTimerSaveDismiss = () => {
    setTimerSaveUi(null);
    setPopupError('');
  };

  const handleTimerSaveConfirm = () => {
    const ui = timerSaveUi;
    if (!ui) return;
    hapticSuccess();
    const tid = ui.todoId;
    let min = Math.max(0, Math.floor(Number(ui.wheelTotalMin) || 0));
    let totalSec = min * 60;
    const userEditedWheel = ui.wheelTotalMin !== ui.openedWheelMin;
    if (timer.isRunning && String(timer.activeId) === String(tid)) {
      const live = timer.peekSessionTotals();
      timer.stop();
      if (live) {
        if (userEditedWheel) {
          totalSec = min * 60;
        } else {
          min = live.totalMin;
          totalSec = live.totalSec;
        }
      }
    } else if (paused?.todoId && String(paused.todoId) === String(tid)) {
      if (!userEditedWheel) {
        min = Math.max(0, Number(paused.savedAccum) || 0);
        totalSec = Number.isFinite(paused.savedSec) ? paused.savedSec : min * 60;
      } else {
        totalSec = min * 60;
      }
    }
    setPaused(null);
    updateTodos((p) =>
      p.map((x) =>
        normalizeTodoId(x.id) === normalizeTodoId(tid) ? { ...x, accum: min, accumSec: totalSec } : x
      )
    );
    setTimerSaveUi(null);
    setPopupError('');
    if (!isDemoMode && hasNotionAuth(creds)) void silentSave(tid, min);
  };

  // Calendar day rolled (e.g. 00:00) while measuring — stop timer, save to Notion, refresh yesterday's report
  const dayKeyRef = useRef(todayStr());
  useEffect(() => {
    const onRoll = () => {
      const d = todayStr();
      if (d === dayKeyRef.current) return;
      const prevDay = dayKeyRef.current;
      dayKeyRef.current = d;
      const tr = timerRef.current;
      if (!tr.isRunning) return;
      const r = tr.stop();
      if (!r) return;
      silentSave(r.todoId, r.totalMin, { keepalive: true }).catch(() => {});
      const rowR = findTodoById(todos, r.todoId);
      setPaused({
        todoId: r.todoId,
        savedAccum: r.totalMin,
        savedSec: r.totalSec,
        display: formatTotalSecClock(r.totalSec),
        taskName: (r.taskName && String(r.taskName).trim()) || (typeof rowR?.name === 'string' ? rowR.name.trim() : ''),
        taskDate: r.taskDate || rowR?.date || prevDay,
      });
      setTodos((prev) => {
        if (!prev.some((t) => t.id === r.todoId)) return prev;
        const next = prev.map((t) => (t.id === r.todoId ? { ...t, accum: r.totalMin, accumSec: r.totalSec } : t));
        saveCache(prevDay, next);
        return next;
      });
    };
    const tick = setInterval(onRoll, 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') onRoll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [silentSave, isDemoMode, creds]);
  useEffect(() => {
    if (!timer.isRunning || isDemoMode || !hasNotionAuth(creds)) return;

    const runCheckpoint = (keepalive) => {
      const p = timerRef.current.peekSessionTotals();
      if (!p) return;
      updateTodos((prev) =>
        prev.map((t) => (t.id === p.todoId ? { ...t, accum: p.totalMin, accumSec: p.totalSec } : t))
      );
      silentSave(p.todoId, p.totalMin, { keepalive });
    };

    const intervalMs = 60 * 1000;
    const t = setInterval(() => runCheckpoint(false), intervalMs);
    const onVis = () => {
      if (document.visibilityState === 'hidden') runCheckpoint(true);
    };
    const onPageHide = () => runCheckpoint(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [timer.isRunning, isDemoMode, creds, silentSave]);

  const handleSaveTodo = async (name, dateInput, extra = {}) => {
    const dateStr = dateInput || todayStr();
    const trimmed = (name || '').trim();
    const accumMin = Math.max(0, Number(extra?.accumMin ?? 0) || 0);
    const totalSec = Math.floor(accumMin * 60);
    const accum = accumMin;

    if (editingTodo) {
      const id = editingTodo.id;
      if (isDemoMode || !hasNotionAuth(creds)) {
        updateTodos((p) => {
          if (dateStr !== todayStr()) return p.filter((t) => t.id !== id);
          return p.map((t) => (t.id === id ? { ...t, name: trimmed, date: dateStr, accum, accumSec: totalSec } : t));
        });
        setEditingTodo(null);
        setSheet(null);
        return;
      }
      updateTodos((p) => {
        if (dateStr !== todayStr()) return p.filter((t) => t.id !== id);
        return p.map((t) => (t.id === id ? { ...t, name: trimmed, date: dateStr, accum, accumSec: totalSec } : t));
      });
      setEditingTodo(null);
      setSheet(null);
      apiFetch(
        `/api/todos/${id}`,
        { method: 'PATCH', body: JSON.stringify({ name: trimmed, date: dateStr, accum }) },
        creds,
        settings
      )
        .then(() => loadTodos({ background: true }))
        .catch((e) => setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message));
      return;
    }

    if (isDemoMode || !hasNotionAuth(creds)) {
      updateTodos((p) => [
        ...p,
        { id: String(Date.now()), name: trimmed, date: dateStr, done: false, accum, accumSec: totalSec },
      ]);
      setSheet(null);
      return;
    }
    const tempId = `tmp-${Date.now()}`;
    const optimisticTodo = {
      id: tempId,
      clientKey: tempId,
      name: trimmed,
      date: dateStr,
      done: false,
      accum,
      accumSec: totalSec,
      isPending: true,
    };
    if (dateStr === todayStr()) updateTodos((p) => [...p, optimisticTodo]);
    setSheet(null);
    try {
      const data = await apiFetch(
        '/api/todos',
        { method: 'POST', body: JSON.stringify({ name: trimmed, date: dateStr, accum: accumMin > 0 ? accum : undefined }) },
        creds,
        settings
      );
      updateTodos((prev) =>
        prev
          .map((t) =>
            t.id === tempId
              ? (data.todo?.date === todayStr()
                ? { ...data.todo, clientKey: t.clientKey, accumSec: totalSec }
                : null)
              : t
          )
          .filter(Boolean)
      );
    } catch (e) {
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message);
    }
  };

  const handleSaveFeedback = (text) => {
    if (isDemoMode || !hasNotionAuth(creds)) {
      setSheet(null);
      return;
    }
    const nextReview = (text || '').trim();
    setFeedbackMemoText(nextReview);
    setFeedbackInitialText(nextReview);
    setSheet(null);
    (async () => {
      try {
        let rid = reportId;
        if (!rid) {
          const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method: 'GET' }, creds, settings);
          rid = rd.report?.id;
        }
        if (!rid) {
          const cr = await apiFetch('/api/reports', { method: 'POST', body: JSON.stringify({ date: todayStr() }) }, creds, settings);
          rid = cr.report?.id;
        }
        if (rid) {
          await apiFetch(
            `/api/reports/${rid}`,
            { method: 'PATCH', body: JSON.stringify({ review: nextReview }) },
            creds,
            settings
          );
          setReportId(rid);
        }
      } catch (e) {
        setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + (e?.message || String(e)));
      }
    })();
  };

  const openFeedbackSheet = async () => {
    // Open immediately for snappy UX, then hydrate with latest review text.
    setFeedbackInitialText(feedbackMemoText || '');
    setSheet('feedback');
    if (isDemoMode || !hasNotionAuth(creds)) {
      setFeedbackInitialText('');
      return;
    }
    try {
      let rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
      if (!rd.report) {
        const cr = await apiFetch('/api/reports', { method:'POST', body:JSON.stringify({ date:todayStr() }) }, creds, settings);
        if (cr.report?.id) setReportId(cr.report.id);
        rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
      } else if (rd.report?.id) {
        setReportId(rd.report.id);
      }
      const loaded = rd.report?.review || '';
      setFeedbackInitialText(loaded);
      setFeedbackMemoText(loaded);
    } catch {
      setFeedbackInitialText(feedbackMemoText || '');
    }
  };

  /** Live session minutes for whoever is timing (not tied to selection). */
  const liveAccum = timer.isRunning ? timer.baseAccum + timer.sessionMin : null;

  const renderTodayStack = () => (
    <div className="stack-sm">
      {sortedTodos.map((todo, i) => {
        const sel = selectedId === todo.id;
        const run = timer.isRunning && timer.activeId === todo.id;
        const pau = !timer.isRunning && paused?.todoId === todo.id;
        const la  = timer.activeId === todo.id ? liveAccum : null;
        const ld  = run
          ? timer.formatElapsedTotal()
          : (pau
            ? formatTotalSecClock(
                paused?.savedSec ?? Math.max(0, Math.floor((paused?.savedAccum ?? todo.accum ?? 0) * 60))
              )
            : null);

        return (
          <div key={todo.clientKey || todo.id}>
            <SwipeCard
              todo={todo} ko={ko} fmt={fmt} t={t}
              selected={sel}
              isRunning={run}
              isPaused={pau}
              liveAccum={la}
              liveDisplay={ld}
              onClick={() => handleSelect(todo)}
              onToggleDone={() => handleComplete(todo.id)}
              onResetRequest={() => setConfirmReset({ todoId: todo.id, todoName: todo.name })}
              onEdit={() => openEditTodo(todo)}
              onDelete={() => setConfirmDelete({ todoId: todo.id, todoName: todo.name })}
              delay={i * 30}
            />
            {sel && (
              <div style={{
                display:'flex', gap:8, marginTop:6,
                animation:'slideIn .2s cubic-bezier(.32,.72,0,1)',
              }}>
                {run ? (
                  <>
                    <button className="btn btn-muted btn-md flex-1" onClick={handlePause} disabled={saving} style={{borderRadius:'999px'}}>
                      <Pause size={16} strokeWidth={2.1} /> {ko?'일시정지':'Pause'}
                    </button>
                    <button className="btn btn-complete-blue btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:'999px'}}>
                      {saving ? <span className="spin"/> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                    </button>
                  </>
                ) : pau ? (
                  <>
                    <button className="btn btn-dark btn-md flex-1" onClick={handleStart} style={{borderRadius:'999px'}}>
                      <Play size={16} strokeWidth={2.1} /> {ko?'재개':'Resume'}
                    </button>
                    <button className="btn btn-complete-blue btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:'999px'}}>
                      {saving ? <span className="spin"/> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-dark btn-md flex-1" onClick={handleStart} style={{borderRadius:'999px'}}>
                      <Play size={16} strokeWidth={2.1} /> {t.start}
                    </button>
                    {!todo.done && (
                      <button className="btn btn-complete-blue btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:'999px'}}>
                        {saving ? <span className="spin"/> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      style={{ minHeight:'100%', paddingBottom:112 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <NotionLoadingOverlay open={!isDemoMode && loading && todos.length === 0} message={t.notionLoadingMessage} />
      {pulling && (
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
          <div className="spin spin-dark" />
        </div>
      )}

      {/* ── Header card ── */}
      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{
          background:'var(--bg2)',
          borderRadius:'var(--r)',
          boxShadow:'var(--shadow)',
          padding:'20px 22px',
          textAlign:'center',
        }}>
          <div style={{ fontSize:14, color:'var(--text3)', fontWeight: 500, marginBottom:6 }}>
            {fmtDate(locale)}
          </div>
          <div style={{ fontSize:56, fontWeight: 800, letterSpacing:'-2px', color:'var(--text)', lineHeight:1, fontVariantNumeric:'tabular-nums', marginBottom:8 }}>
            {fmt(headerTotalMin)}
          </div>
          {timer.isRunning && (
            <button
              type="button"
              onClick={openHeaderTimerSave}
              aria-label={ko ? '집중 시간 저장' : 'Save focus time'}
              style={{
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 10,
                fontFamily: 'inherit',
              }}
            >
              <span style={{ color:'var(--orange)', fontSize:13, animation:'pulse 2s ease-in-out infinite' }} aria-hidden>●</span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text)',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {timer.formatElapsed()}
              </span>
            </button>
          )}
          {!timer.isRunning && paused && (
            <button
              type="button"
              onClick={openHeaderTimerSave}
              aria-label={ko ? '집중 시간 저장' : 'Save focus time'}
              style={{
                marginBottom: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 10,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <Pause size={12} strokeWidth={2.1} color="var(--orange)" />
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatTotalSecClock(
                    paused?.savedSec ?? Math.max(0, Math.floor((paused?.savedAccum ?? 0) * 60))
                  )}
                </span>
              </div>
              <div style={{ fontSize:12, color:'var(--orange)', fontWeight: 600 }}>{ko ? '일시정지' : 'Paused'}</div>
            </button>
          )}
          {todos.length > 0 && (
            <>
              <div style={{ fontSize:14, color:'var(--text3)', fontWeight: 500, marginBottom:10, display:'inline-flex', alignItems:'center', gap:8 }}>
                <span>{ko ? `${todos.length}개 중 ${doneCount}개 완료 · ${pct}%` : `${doneCount} of ${todos.length} done · ${pct}%`}</span>
                <button
                  type="button"
                  aria-label={ko ? '하루 리뷰 입력' : 'Write daily review'}
                  onClick={openFeedbackSheet}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  <Pencil size={14} strokeWidth={2.1} />
                </button>
              </div>
              <div className="prog">
                <div className="prog-fill" style={{ width:`${pct}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Todo list ── */}
      <div style={{ padding:'4px 14px' }}>
        <div style={{ fontSize:15, fontWeight: 500, color:'var(--text3)', margin:'6px 4px 10px' }}>
          {ko ? '오늘 집중 할일' : "Today's Focus Tasks"}
        </div>
        {loading && !isDemoMode ? (
          <div style={{ minHeight: 200 }} aria-hidden />
        ) : !loading ? (
        error ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><TriangleAlert size={36} strokeWidth={2.1} color="var(--red)" /></div>
            <div style={{ fontSize:14, fontWeight: 600, color:'var(--red)', marginBottom:8 }}>{ko ? '불러오기 실패' : 'Failed to load'}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, wordBreak:'break-all', lineHeight:1.6 }}>{error}</div>
            <button className="btn btn-dark btn-sm" onClick={loadTodos}>{ko ? '다시 시도' : 'Retry'}</button>
          </div>
        ) : sortedTodos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><ClipboardList size={48} strokeWidth={2.0} color="var(--text3)" /></div>
            <div style={{ color:'var(--text3)', fontWeight: 600, marginBottom:20 }}>{t.noTodos}</div>
            <button className="btn btn-dark btn-md" onClick={() => { setEditingTodo(null); setSheet('add'); }}>{t.addFirst}</button>
          </div>
        ) : (
          renderTodayStack()
        )
        ) : null}
      </div>

      {/* ── FAB ── */}
      <div className="fab-wrap">
        <button className="fab" onClick={() => { setEditingTodo(null); setSheet('add'); }}>
          <Plus size={24} strokeWidth={2.1} />
        </button>
      </div>

      {/* ── Confirm switch dialog ── */}
      {confirmSwitch && (
        <PopupDialog
          title={ko ? '측정 중인 할일이 있어요' : 'Timer is running'}
          message={ko ? '현재 측정을 멈추고 다른 할 일로 전환할까요?' : 'Stop the current timer and switch to another task?'}
          cancelText={t.cancel}
          confirmText={ko ? '전환하기' : 'Switch'}
          onCancel={() => setConfirmSwitch(null)}
          onConfirm={confirmSwitchTask}
        />
      )}

      {confirmDelete && (
        <PopupDialog
          title={ko ? '할 일을 삭제할까요?' : 'Delete this task?'}
          message={ko ? `"${confirmDelete.todoName}" 항목을 삭제합니다.` : `This will remove "${confirmDelete.todoName}".`}
          cancelText={t.cancel}
          confirmText={ko ? '삭제' : 'Delete'}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.todoId;
            setConfirmDelete(null);
            handleDelete(id);
          }}
        />
      )}

      {confirmReset && (
        <PopupDialog
          title={t.confirmResetTimeTitle}
          message={t.confirmResetTimeMessage.replace('{name}', confirmReset.todoName)}
          cancelText={t.cancel}
          confirmText={t.resetTime}
          onCancel={() => setConfirmReset(null)}
          onConfirm={() => {
            const id = confirmReset.todoId;
            setConfirmReset(null);
            handleResetTime(id);
          }}
        />
      )}

      {popupError && !timerSaveUi && (
        <PopupDialog
          title={ko ? '오류가 발생했어요' : 'Something went wrong'}
          message={popupError}
          confirmText={ko ? '확인' : 'OK'}
          onCancel={() => setPopupError('')}
          onConfirm={() => setPopupError('')}
          singleAction
        />
      )}

      {timerSaveUi && (
        <>
          <div className="popup-backdrop" onClick={handleTimerSaveDismiss} />
          <div className="popup-wrap" onClick={handleTimerSaveDismiss} role="presentation">
            <div className="popup pop-in timer-save-modal" onClick={(e) => e.stopPropagation()}>
              <div className="timer-save-nav">
                <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={handleTimerSaveDismiss} aria-label={t.cancel}>
                  <X size={22} strokeWidth={2.2} />
                </button>
                <div className="timer-save-nav-title">
                  <div className="timer-save-nav-name">{timerSaveUi.taskName || (ko ? '할 일' : 'Task')}</div>
                  {timerSaveUi.taskDate ? (
                    <div className="timer-save-nav-date">{formatCalendarDateLine(timerSaveUi.taskDate, locale)}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="nav-circle-btn nav-circle-btn--confirm"
                  onClick={() => void handleTimerSaveConfirm()}
                  disabled={saving}
                  aria-label={t.save}
                >
                  <Check size={22} strokeWidth={2.5} />
                </button>
              </div>
              <div className="popup-body" style={{ padding: '12px 14px 22px', margin: 0, color: 'var(--text)' }}>
                <TimeWheelPicker
                  valueMin={timerSaveUi.wheelTotalMin}
                  onChange={(v) => setTimerSaveUi((s) => (s ? { ...s, wheelTotalMin: v } : null))}
                  maxHours={24}
                  ko={ko}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Sheets ── */}
      {sheet === 'add' && (
        <AddTodoSheet
          t={t}
          editingTodo={editingTodo}
          onSave={handleSaveTodo}
          onClose={() => { setSheet(null); setEditingTodo(null); }}
        />
      )}
      {sheet === 'feedback' && <FeedbackSheet t={t} isDemoMode={isDemoMode} initialText={feedbackInitialText} onSave={handleSaveFeedback} onClose={() => setSheet(null)} />}
    </div>
  );
}

// Springy snap when finger lifts (Notion-like blue actions)
const SWIPE_SPRING = '0.52s cubic-bezier(0.22, 0.88, 0.32, 1.1)';

// ── SwipeCard with spring-snap swipe ──────────────────────────
// 계속 밀면 늘어났다가 자동 실행
function SwipeCard({ todo, ko, fmt, t, selected, isRunning, isPaused, liveAccum, liveDisplay, onClick, onToggleDone, onResetRequest, onEdit, onDelete, delay }) {
  const [sx, setSx]     = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const isPointerDown = useRef(false);
  const axisRef = useRef(null); // null | 'h' | 'v'
  const fired  = useRef(false);
  const baseSec = Number.isFinite(todo?.accumSec) ? todo.accumSec : Math.max(0, (todo.accum || 0) * 60);
  const displayAccum = liveAccum !== null ? Math.max(0, liveAccum * 60) : baseSec;
  // running/paused: always show. stopped: 1m+ only (Notion does not store under 1 min; avoids 0:00 for sub-minute totals)
  const hasLive = isRunning || isPaused;
  const showTimeTag = hasLive || displayAccum >= 60;

  const MAX_L  = 210; // max px for left action (time reset) — need room to pull past FIRE_L
  const MAX_R  = 300; // green edit + red delete
  const FIRE_L = 168; // auto-fire / confirm threshold left (higher = must pull further)
  const FIRE_R = 176; // auto-fire delete threshold after snap + extra pull
  const EDIT_W = 58; // min width of edit (green) and delete (red) pills
  const SNAP_R = EDIT_W * 2; // snap: both actions

  const tStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axisRef.current = null;
    fired.current  = false;
    setDrag(false);
  };
  const tMove = (e) => {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axisRef.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      axisRef.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
    }
    if (axisRef.current === 'v') return;
    if (axisRef.current !== 'h') return;
    if (Math.abs(dx) > 6) setDrag(true);
    // Apply rubber-band resistance beyond fire threshold
    let clamped = dx;
    if (dx > FIRE_L)  clamped = FIRE_L  + (dx - FIRE_L)  * 0.25;
    if (dx < -FIRE_R) clamped = -FIRE_R - (-dx - FIRE_R) * 0.25;
    clamped = Math.min(MAX_L, Math.max(-MAX_R, clamped));
    setSx(clamped);
  };
  const tEnd = () => {
    const cur = sx;
    startX.current = null;
    startY.current = null;
    axisRef.current = null;
    // Auto-fire if past threshold
    if (cur >= FIRE_L && !fired.current) {
      fired.current = true;
      hapticSuccess();
      setSx(0);
      setTimeout(() => onResetRequest(), 50);
    } else if (cur <= -FIRE_R && !fired.current) {
      fired.current = true;
      hapticSuccess();
      setSx(0);
      setTimeout(() => onDelete(), 50);
    } else if (cur < -(EDIT_W + 36)) {
      hapticSelect();
      setSx(-SNAP_R);
    } else {
      if (Math.abs(cur) > 10) hapticSelect();
      setSx(0);
    }
    setTimeout(() => setDrag(false), 60);
  };

  const click = () => {
    // Keep snapped swipe actions open; do not auto-close on synthetic click after drag.
    if (sx !== 0) return;
    if (!drag) onClick();
  };

  const pStart = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isPointerDown.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axisRef.current = null;
    fired.current = false;
    setDrag(false);
  };

  const pMove = (e) => {
    if (!isPointerDown.current || startX.current === null || startY.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (axisRef.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axisRef.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
    }
    if (axisRef.current !== 'h') return;
    e.preventDefault();
    if (Math.abs(dx) > 4) setDrag(true);
    let clamped = dx;
    if (dx > FIRE_L)  clamped = FIRE_L  + (dx - FIRE_L)  * 0.25;
    if (dx < -FIRE_R) clamped = -FIRE_R - (-dx - FIRE_R) * 0.25;
    clamped = Math.min(MAX_L, Math.max(-MAX_R, clamped));
    setSx(clamped);
  };

  const pEnd = () => {
    if (!isPointerDown.current) return;
    isPointerDown.current = false;
    tEnd();
  };

  const rightReveal = Math.max(0, -sx);
  const leftReveal = Math.max(0, sx);
  const editWidth = rightReveal > 0 ? EDIT_W : 0;
  const deleteRawWidth = Math.max(0, rightReveal - EDIT_W);
  const deleteWidth = deleteRawWidth > 0 ? Math.max(EDIT_W, deleteRawWidth) : 0;

  return (
    <div
      style={{ position:'relative', borderRadius:'var(--r)', overflow:'hidden', animationDelay:`${delay}ms` }}
      className="slide-in"
    >
      {/* Left action: time reset (confirm in parent) */}
      <button
        type="button"
        className="swipe-action-reset"
        aria-label={t?.resetTime ?? (ko ? '시간 리셋' : 'Reset time')}
        style={{
        position:'absolute', left:0, top:0, bottom:0,
        width: leftReveal,
        border:'none',
        cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden',
        borderRadius: 999,
        transition: drag ? 'none' : `width ${SWIPE_SPRING}`,
      }}
        onTouchStart={() => hapticLight()}
        onClick={(e) => {
          e.stopPropagation();
          hapticMedium();
          setSx(0);
          setTimeout(() => onResetRequest?.(), 0);
        }}
      >
        <RotateCcw size={22} strokeWidth={2.2} color="white" />
      </button>

      {/* Right: edit (green) + delete (red) — only via swipe */}
      <div style={{
        position:'absolute', right:0, top:0, bottom:0,
        width: rightReveal,
        display:'flex', flexDirection:'row',
        overflow:'visible',
        borderRadius: 'var(--r)',
        transition: drag ? 'none' : `width ${SWIPE_SPRING}`,
      }}>
        <button
          type="button"
          aria-label={ko ? '편집' : 'Edit'}
          style={{
            width: editWidth,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderTopLeftRadius: editWidth > 0 ? 999 : 0,
            borderBottomLeftRadius: editWidth > 0 ? 999 : 0,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
          }}
          onTouchStart={() => hapticLight()}
          onClick={(e) => {
            e.stopPropagation();
            hapticMedium();
            setSx(0);
            setTimeout(() => onEdit?.(), 0);
          }}
        >
          <Pencil size={20} strokeWidth={2.2} color="white" />
        </button>
        <button
          type="button"
          aria-label={ko ? '삭제' : 'Delete'}
          style={{
            width: deleteWidth,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderTopRightRadius: deleteWidth > 0 ? 999 : 0,
            borderBottomRightRadius: deleteWidth > 0 ? 999 : 0,
          }}
          onTouchStart={() => hapticLight()}
          onClick={(e) => {
            e.stopPropagation();
            hapticMedium();
            setSx(0);
            setTimeout(() => onDelete?.(), 0);
          }}
        >
          <Trash2 size={22} strokeWidth={2.2} color="white" />
        </button>
      </div>

      {/* Card */}
      <div
        className="card"
        style={{
          touchAction: 'pan-y',
          userSelect: 'none',
          cursor:'pointer',
          transform:`translate3d(${sx}px, 0, 0)`,
          willChange:'transform',
          transition: drag ? 'none' : `transform ${SWIPE_SPRING}`,
          position:'relative', zIndex:1,
          border: selected ? '2px solid var(--text)' : '2px solid transparent',
          padding:'10px 14px',
        }}
        onClick={click}
        onTouchStart={tStart}
        onTouchMove={tMove}
        onTouchEnd={tEnd}
        onPointerDown={pStart}
        onPointerMove={pMove}
        onPointerUp={pEnd}
        onPointerCancel={pEnd}
        onPointerLeave={pEnd}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            alignItems: 'center',
            columnGap: 14,
            width: '100%',
            minWidth: 0,
          }}
        >
          <div className={`chk ${todo.done ? 'done' : ''}`} onClick={e => { e.stopPropagation(); onToggleDone(); }}>
            {todo.done && <Check size={12} strokeWidth={2.3} color="white" />}
          </div>
          <div
            style={{
              fontWeight: 500,
              fontSize: 17,
              color: 'var(--text)',
              opacity: todo.done ? 0.4 : 1,
              textDecoration: todo.done ? 'line-through' : 'none',
              minWidth: 0,
            }}
            className="truncate"
          >
            {todo.name}
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
              justifySelf: 'end',
            }}
          >
            {showTimeTag && (
            <span
              style={{
                fontSize:12,
                color:'var(--text2)',
                fontWeight: 600,
                minWidth:40,
                textAlign:'right',
                background:'var(--bg3)',
                borderRadius:999,
                padding:'4px 10px',
                lineHeight:1,
                display:'inline-flex',
                alignItems:'center',
                gap:4,
                flexShrink:0,
                boxSizing: 'border-box',
              }}
            >
              {hasLive ? (
                <>
                  {isPaused && (
                    <Pause size={12} strokeWidth={2.2} color="var(--orange)" style={{ flexShrink: 0 }} />
                  )}
                  {isRunning && !isPaused && (
                    <span style={{ color: 'var(--orange)', fontSize: 13, lineHeight: 1, animation: 'pulse 2s ease-in-out infinite', flexShrink: 0 }} aria-hidden>●</span>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text)',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      minWidth: '2.5ch',
                    }}
                  >
                    {liveDisplay || fmtHhMm(displayAccum)}
                  </span>
                </>
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmt(todo.accum || 0)}
                </span>
              )}
            </span>
            )}
            <ChevronRight
              size={13}
              strokeWidth={2.1}
              color="var(--text4)"
              style={{ transform:selected?'rotate(90deg)':'none', transition:'transform .2s', flexShrink:0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
