'use client';
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  Check,
  X,
  Trash2,
  Pause,
  Play,
  TriangleAlert,
  ClipboardList,
  Pencil,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Plus,
  Hand,
  Download,
  Upload,
  Target,
} from 'lucide-react';
import { NOCK_TIMER_PAUSED_KEY, useTimer } from './lib/useTimer';
import { apiFetch, resolveApiUrl } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { localDateKey, addCalendarDays } from '@/app/lib/dateUtils';
import {
  normalizeAccumMin,
  dedupeTodosById,
  normalizeTodoKey as normalizeTodoId,
  todoHasGoalLink,
} from '@/app/lib/todoAccum';
import { getLocale } from '@/app/lib/i18n';
import { getDayWindowHourIndicesFromSettings } from '@/app/lib/dayWindow';
import { PREMIUM_GATES_ENABLED, TIMETABLE_HOME_ENABLED } from '@/app/lib/featureFlags';
import { isLocalMode, usesNotionTodoApi } from '@/app/lib/credsMode';
import { getLocalCustomerKey } from '@/app/lib/localCustomerKey';
import { loadLocalTodosForDay, saveLocalTodosForDay } from '@/app/lib/localTodosStore';
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

/** `viewDate` − `relativeTo` in whole local calendar days. */
function diffCalendarDays(dateStr, relativeToStr) {
  const m = typeof dateStr === 'string' ? dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  const r = typeof relativeToStr === 'string' ? relativeToStr.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m || !r) return NaN;
  const d1 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d2 = new Date(Number(r[1]), Number(r[2]) - 1, Number(r[3]));
  return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

/** 홈 날짜 헤더: 오늘·어제·… 또는 전체 날짜 한 줄 */
function formatHomeDateHeading(dateStr, loc) {
  const delta = diffCalendarDays(dateStr, todayStr());
  if (Number.isNaN(delta)) return formatCalendarDateLine(dateStr, loc);
  const lko = loc === 'ko';
  if (delta === 0) return lko ? '오늘' : 'Today';
  if (delta === -1) return lko ? '어제' : 'Yesterday';
  if (delta === -2) return lko ? '그제' : '2 days ago';
  if (delta === 1) return lko ? '내일' : 'Tomorrow';
  if (delta === 2) return lko ? '모레' : 'In 2 days';
  return formatCalendarDateLine(dateStr, loc);
}

/** 시간표 전용: 언어 무관 AM/PM 한 줄 (줄바꿈 방지용 보조 공백) */
function formatHourTimetableAmPm(hour) {
  const h = (((hour % 24) + 24) % 24);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}\u00a0${ampm}`;
}

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

/** 측정 중 누적만 로컬에 박아 두는 안전망 — 노션 단건 저장과 별개 */
const ACCUM_CK_KEY = 'nock_measure_accum_ck_v1';
function writeAccumCheckpoint(p) {
  if (!p?.todoId) return;
  try {
    localStorage.setItem(
      ACCUM_CK_KEY,
      JSON.stringify({
        v: 1,
        todoId: String(p.todoId),
        totalMin: p.totalMin,
        totalSec: p.totalSec,
        ts: Date.now(),
      })
    );
  } catch { /* quota / private mode */ }
}
function clearAccumCheckpoint() {
  try {
    localStorage.removeItem(ACCUM_CK_KEY);
  } catch { /* */ }
}

const LOCAL_TB_PREFIX = 'nock_tb_local_';
const localTbStorageKey = (d) => LOCAL_TB_PREFIX + d;
function readLocalTbMap(d) {
  try {
    const r = localStorage.getItem(localTbStorageKey(d));
    if (!r) return {};
    const o = JSON.parse(r);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}
function writeLocalTbMap(d, map) {
  try {
    localStorage.setItem(localTbStorageKey(d), JSON.stringify(map));
  } catch {
    /* */
  }
}

const HOUR_COLOR_PREFIX = 'nock_tb_hour_colors_';
const hourColorsStorageKey = (d) => HOUR_COLOR_PREFIX + d;
function readHourColorsMap(d) {
  try {
    const r = localStorage.getItem(hourColorsStorageKey(d));
    if (!r) return {};
    const o = JSON.parse(r);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}
function writeHourColorsMap(d, map) {
  try {
    localStorage.setItem(hourColorsStorageKey(d), JSON.stringify(map));
  } catch {
    /* */
  }
}

/** 타임라인 점 / 할 일 선택 칩 — 기본 파랑 */
const DEFAULT_TIMETABLE_CHIP = '#2383E2';
const TIMETABLE_CHIP_COLORS = [
  DEFAULT_TIMETABLE_CHIP,
  '#34C759',
  '#AF52DE',
  '#FF9500',
  '#FF375F',
  '#5AC8FA',
  '#FFCC00',
  '#8E8E93',
];

function applyLocalTbMerge(todos, dateStr) {
  const map = readLocalTbMap(dateStr);
  const keys = Object.keys(map);
  if (keys.length === 0) return todos;
  return todos.map((row) => {
    const nk = normalizeTodoId(row.id);
    let h;
    if (Object.prototype.hasOwnProperty.call(map, nk)) h = map[nk];
    else if (Object.prototype.hasOwnProperty.call(map, row.id)) h = map[row.id];
    else {
      for (const k of keys) {
        if (normalizeTodoId(k) === nk) {
          h = map[k];
          break;
        }
      }
    }
    if (h === undefined) return row;
    return { ...row, timeBlockingHours: Array.isArray(h) ? [...h] : [] };
  });
}

export default function HomeTab({
  t,
  creds,
  settings,
  onSheetOpenChange,
  onSaveSettings,
  openAddSignal = 0,
  onFocusSummaryChange,
  onRequestAddTodo,
  onPremiumGate,
}) {
  const [todos,      setTodos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [overlayReady, setOverlayReady] = useState(false);
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
  /** 홈에서 보고 있는 캘린더 날짜 (할 일 목록·헤더 통계 기준) */
  const [viewDate, setViewDate] = useState(() => localDateKey());
  const viewDateRef = useRef(viewDate);
  useEffect(() => {
    viewDateRef.current = viewDate;
  }, [viewDate]);
  const [subscription, setSubscription] = useState(null);
  const [pastDayProPopupOpen, setPastDayProPopupOpen] = useState(false);
  /** 상단 타이머 탭 → 시간 휠 저장 (`openedWheelMin`: 열었을 때 분 — 휠 미수정 시 체크에서 실시간 peek 우선) */
  const [timerSaveUi, setTimerSaveUi] = useState(null); // null | { todoId, taskName, taskDate, wheelTotalMin, openedWheelMin }
  /** 시간표 레일 점 탭 시 칩 색만 고르는 작은 모달 */
  const [timetableColorHour, setTimetableColorHour] = useState(null); // null | hour 0–23
  /** 할 일 피커 — 네이티브 대신 iOS형 바텀시트 */
  const [timetableTaskPickerHour, setTimetableTaskPickerHour] = useState(null); // null | hour 0–23
  const [hourColorsMap, setHourColorsMap] = useState(() => ({}));
  const pullStartY = useRef(null);
  /** 시간표 타임라인 DOM 기준으로 ‘현재 시각’ 가로선 위치 측정 (고정 52px 추정 오차 제거) */
  const timetableTimelineRef = useRef(null);
  const [timetableNowLineTopPx, setTimetableNowLineTopPx] = useState(null);
  const locale = getLocale(settings?.lang);
  const ko     = locale === 'ko';
  const homeSurface = settings?.homeSurface === 'timetable' ? 'timetable' : 'timer';
  const timeDisplay = settings?.timeDisplay === '12' ? '12' : '24';
  const visibleHours = useMemo(
    () => getDayWindowHourIndicesFromSettings(settings),
    [settings?.dayWindowStart, settings?.dayWindowEnd, settings?.dayWindowStartMin, settings?.dayWindowEndMin]
  );

  const updateTimetableNowLinePosition = useCallback(() => {
    if (homeSurface !== 'timetable' || viewDate !== todayStr()) {
      setTimetableNowLineTopPx(null);
      return;
    }
    const root = timetableTimelineRef.current;
    if (!root) {
      setTimetableNowLineTopPx(null);
      return;
    }
    const d = new Date();
    const ch = d.getHours();
    const cm = d.getMinutes();
    const cs = d.getSeconds();
    if (visibleHours.indexOf(ch) < 0) {
      setTimetableNowLineTopPx(null);
      return;
    }
    const row = root.querySelector(`[data-tb-hour="${ch}"]`);
    if (!row) {
      setTimetableNowLineTopPx(null);
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const rowH = rowRect.height;
    if (!(rowH > 0)) {
      setTimetableNowLineTopPx(null);
      return;
    }
    const fracMin = (cm + cs / 60) / 60;
    const topWithinRoot = rowRect.top - rootRect.top + fracMin * rowH;
    setTimetableNowLineTopPx(topWithinRoot);
  }, [homeSurface, viewDate, visibleHours]);

  useLayoutEffect(() => {
    let cancelled = false;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        if (!cancelled) updateTimetableNowLinePosition();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [updateTimetableNowLinePosition]);

  useEffect(() => {
    if (homeSurface === 'timetable') updateTimetableNowLinePosition();
  }, [homeSurface, updateTimetableNowLinePosition]);

  /** 타임라인 ‘지금’ 라인 — 매초 실제 시각 반영 (표시 날짜가 오늘일 때만) */
  useEffect(() => {
    if (homeSurface !== 'timetable' || viewDate !== todayStr()) return undefined;
    const id = window.setInterval(() => updateTimetableNowLinePosition(), 1000);
    return () => window.clearInterval(id);
  }, [homeSurface, viewDate, updateTimetableNowLinePosition]);

  useEffect(() => {
    const root = timetableTimelineRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => updateTimetableNowLinePosition());
    ro.observe(root);
    return () => ro.disconnect();
  }, [updateTimetableNowLinePosition]);

  useEffect(() => {
    const onResize = () => updateTimetableNowLinePosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateTimetableNowLinePosition]);

  useEffect(() => {
    if (timetableTaskPickerHour == null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setTimetableTaskPickerHour(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timetableTaskPickerHour]);

  const hasTimeBlockingField = Boolean(String(settings?.todoFields?.timeBlocking || '').trim());
  const timetableStorageMode = settings?.timetableStorageMode === 'notion' ? 'notion' : 'local';
  const notionTimetableReady =
    isLocalMode(creds) || (hasNotionAuth(creds) && hasTimeBlockingField && Boolean(creds?.dbTodo));
  useEffect(() => {
    const fetchSub = () => {
      const wid = !isLocalMode(creds) && creds?.workspaceId ? `&wid=${encodeURIComponent(creds.workspaceId)}` : '';
      const base = isLocalMode(creds)
        ? resolveApiUrl(`/api/subscription?customerKey=${encodeURIComponent(getLocalCustomerKey())}&_t=${Date.now()}`)
        : resolveApiUrl(`/api/subscription?_t=${Date.now()}${wid}`);
      fetch(base, { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setSubscription(j))
        .catch(() => setSubscription(null));
    };
    fetchSub();
    // billing-result에서 돌아올 때 _subRefresh 파라미터 → URL 정리 후 즉시 재조회
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('_subRefresh')) {
      window.history.replaceState(null, '', '/');
    }
    const onVisible = () => { if (document.visibilityState === 'visible') fetchSub(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [creds?.authMode]);

  const forceFree = typeof window !== 'undefined' && localStorage.getItem('nock_force_free') === '1';
  const hasPremium =
    !PREMIUM_GATES_ENABLED ||
    (!forceFree && (
      subscription?.status === 'active' ||
      (subscription?.status === 'trialing' && new Date(subscription.trial_end_at) > new Date())
    ));

  const trySetViewDate = useCallback(
    (nextStr) => {
      const today = localDateKey();
      if (nextStr !== today && !hasPremium) {
        onPremiumGate?.();
        return;
      }
      setViewDate(nextStr);
    },
    [hasPremium, onPremiumGate]
  );

  const timer  = useTimer();
  const timerRef = useRef(timer);
  const pausedRef = useRef(null);
  const hasServerSyncRef = useRef(false);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const fmt    = (m) => fmtMin(m, ko);
  const persistDayTodos = (dateStr, list) => {
    if (isLocalMode(creds)) saveLocalTodosForDay(dateStr, list);
    else saveCache(dateStr, list);
  };
  const updateTodos = (updater) => {
    setTodos((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistDayTodos(viewDateRef.current, next);
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

    (async () => {
      const tr = timerRef.current;
      if (tr.isRunning) {
        const p = tr.peekSessionTotals();
        if (p && hasNotionAuth(prior) && p.todoId && hasServerSyncRef.current) {
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
        if (pz?.todoId && hasNotionAuth(prior) && hasServerSyncRef.current) {
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
  }, [creds, settings]);

  useEffect(() => {
    try { const r = localStorage.getItem(PAUSED_KEY); if(r) setPausedRaw(JSON.parse(r)); } catch {}
  }, []);

  useEffect(() => {
    hasServerSyncRef.current = false;
  }, [creds?.authMode, creds?.dbTodo]);

  useEffect(() => {
    onSheetOpenChange?.(sheet === 'add' || sheet === 'feedback');
    return () => onSheetOpenChange?.(false);
  }, [sheet, onSheetOpenChange]);

  /** 시간표 탭은 오늘만 */
  useEffect(() => {
    if (homeSurface !== 'timetable') return;
    const today = todayStr();
    setViewDate((prev) => (prev !== today ? today : prev));
  }, [homeSurface]);

  const openAddSignalRef = useRef(0);
  /** 시간표 빈 칸에서 새 할 일 저장 후 이 시간에 바로 배정 */
  const timetablePendingHourRef = useRef(null);

  useEffect(() => {
    if (openAddSignal > openAddSignalRef.current) {
      timetablePendingHourRef.current = null;
      setEditingTodo(null);
      setSheet('add');
    }
    openAddSignalRef.current = openAddSignal;
  }, [openAddSignal]);

  useEffect(() => {
    setHourColorsMap(readHourColorsMap(viewDate));
  }, [viewDate]);

  const openEditTodo = (todo) => {
    timetablePendingHourRef.current = null;
    setSelectedId(null);
    setEditingTodo({
      id: todo.id,
      name: todo.name,
      date: todo.date,
      accum: todo.accum || 0,
      accumSec: Number.isFinite(todo?.accumSec) ? todo.accumSec : null,
      goalPageId: todo.goalPageId || '',
    });
    setSheet('add');
  };

  // ── Load todos ─────────────────────────────────────────────
  /** `background: true` = silent refresh (no full-screen loader); use after optimistic UI updates. */
  const loadTodos = async (opts = {}) => {
    const { background = false } = opts;
    try {
      const dbTodo = creds ? creds.dbTodo : null;

      if (isLocalMode(creds)) {
        const dayKey = viewDateRef.current;
        const stored = loadLocalTodosForDay(dayKey);
        const list = stored ?? [];
        const merged = applyLocalTbMerge(list, dayKey);
        setTodos(dedupeTodosById(merged));
        setLoading(false);
        setPulling(false);
        return;
      }

      if (!usesNotionTodoApi(creds)) {
        setTodos([]);
        setLoading(false);
        setPulling(false);
        return;
      }

      const dayKey = viewDateRef.current;
      const cached = loadCache(dayKey);
      if (!background) {
        if (cached) { setTodos(cached); setLoading(false); }
        else { setLoading(true); }
      }
      setError('');

      const data = await apiFetch(
        '/api/todos?date=' + encodeURIComponent(dayKey) + '&_=' + Date.now(),
        { method: 'GET' },
        creds,
        settings
      );
      const list = (Array.isArray(data?.todos) ? data.todos : []).map((todo) => ({
        ...todo,
        accum: normalizeAccumMin(todo?.accum),
      }));
      /** 노션 GET이 타임블록을 아직 안 실어 오거나, 로컬 전용 배정만 있는 경우를 위해 항상 로컬 TB 맵 오버레이 */
      const merged = applyLocalTbMerge(list, dayKey);
      const deduped = dedupeTodosById(merged);
      saveCache(dayKey, deduped);
      setTodos(deduped);
      const tr = timerRef.current;
      if (tr?.isRunning && tr.peekSessionTotals && tr.reconcileWithServer) {
        const row = deduped.find((x) => normalizeTodoId(x.id) === normalizeTodoId(tr.activeId));
        if (row) {
          const p = tr.peekSessionTotals();
          if (
            p &&
            normalizeTodoId(p.todoId) === normalizeTodoId(row.id) &&
            Math.abs(p.totalMin - (row.accum || 0)) > 1
          ) {
            tr.reconcileWithServer(row.accum);
          }
        }
      }
      setPausedRaw((p) => {
        if (!p) return p;
        const row = deduped.find((x) => normalizeTodoId(x.id) === normalizeTodoId(p.todoId));
        if (!row) {
          // Keep cross-day paused info (midnight rollover flow) even if today's list doesn't contain the task.
          if (p.taskDate && p.taskDate !== dayKey) return p;
          try { localStorage.removeItem(PAUSED_KEY); } catch {}
          return null;
        }
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
      hasServerSyncRef.current = true;
    } catch (e) {
      const type = e?.constructor?.name || 'Error';
      const msg  = e?.message || String(e) || '알 수 없는 오류';
      setError('[' + type + '] ' + msg);
    } finally {
      if (!background) setLoading(false);
      setPulling(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setOverlayReady(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Hydrate from local cache before first paint (avoids empty list / full-screen loader flash on HMR)
  useLayoutEffect(() => {
    if (isLocalMode(creds)) {
      const stored = loadLocalTodosForDay(viewDate);
      if (stored) {
        const merged = applyLocalTbMerge(stored, viewDate);
        setTodos(dedupeTodosById(merged));
      }
      setLoading(false);
      return;
    }
    if (!usesNotionTodoApi(creds)) return;
    const cached = loadCache(viewDate);
    if (cached) {
      const merged = applyLocalTbMerge(cached, viewDate);
      setTodos(dedupeTodosById(merged));
      setLoading(false);
    }
  }, [creds, creds?.dbTodo, viewDate, settings?.timetableStorageMode]);

  useEffect(() => {
    loadTodos();
  }, [creds, creds?.dbTodo, viewDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stuck on full-screen loader (slow network / hung API) — recover instead of a permanent blank
  useEffect(() => {
    if (!loading || isLocalMode(creds)) return;
    const t = setTimeout(() => {
      setLoading(false);
      setError((e) => e || (ko
        ? '불러오는 데 너무 오래 걸렸어요. 인터넷과 노션 연결을 확인한 뒤, 아래에서 다시 시도하거나 화면을 당겨 새로고침해요.'
        : 'Loading is taking too long. Check your connection and try again, or pull to refresh.'));
    }, 25000);
    return () => clearTimeout(t);
  }, [loading, creds?.authMode, ko]);

  const getScrollParent = () => {
    if (typeof document === 'undefined') return null;
    return document.querySelector('.shell .content');
  };

  // Pull-to-refresh: only at scroll top, longer pull to avoid accidents
  const onTouchStart = (e) => {
    const el = getScrollParent();
    if (el && el.scrollTop > 6) {
      pullStartY.current = null;
      return;
    }
    pullStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (pullStartY.current === null) return;
    const el = getScrollParent();
    if (el && el.scrollTop > 6) {
      pullStartY.current = null;
      return;
    }
    const dy = e.changedTouches[0].clientY - pullStartY.current;
    pullStartY.current = null;
    if (dy > 130) {
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

  const selectTodosForHour = useCallback((hour) => {
    const incomplete = todos.filter((row) => !row.done);
    const assigned = todos.find(
      (row) => Array.isArray(row.timeBlockingHours) && row.timeBlockingHours.includes(hour)
    );
    if (!assigned) return incomplete;
    if (incomplete.some((r) => normalizeTodoId(r.id) === normalizeTodoId(assigned.id))) return incomplete;
    return [assigned, ...incomplete];
  }, [todos]);

  const doneCount = todos.filter(t => t.done).length;
  const pct       = todos.length ? Math.round(doneCount/todos.length*100) : 0;
  const onTodayView = viewDate === todayStr();
  const activeTimerInToday =
    onTodayView &&
    timer.isRunning &&
    todos.some((t) => normalizeTodoId(t.id) === normalizeTodoId(timer.activeId));
  /** Running task: accum는 체크포인트로 이미 세션 포함 가능 — ID당 한 줄만 합산해 중복·폭주 방지 */
  const liveSum = activeTimerInToday ? timer.peekSessionTotals() : null;
  const accumById = new Map();
  for (const t of todos) {
    const k = normalizeTodoId(t.id);
    const v = Number(t.accum) || 0;
    accumById.set(k, Math.max(accumById.get(k) ?? 0, v));
  }
  const rawSum = [...accumById.values()].reduce((a, b) => a + b, 0);
  const activeKey = liveSum ? normalizeTodoId(liveSum.todoId) : null;
  const headerTotalMin =
    liveSum && activeKey != null
      ? rawSum - (accumById.get(activeKey) ?? 0) + liveSum.totalMin
      : rawSum;
  const focusSummaryLabel = fmt(headerTotalMin);
  useEffect(() => {
    onFocusSummaryChange?.(focusSummaryLabel);
  }, [focusSummaryLabel, onFocusSummaryChange]);
  const selected = todos.find((t) => normalizeTodoId(t.id) === normalizeTodoId(selectedId));
  const isRunning = timer.isRunning && normalizeTodoId(timer.activeId) === normalizeTodoId(selectedId);
  const isPaused = !timer.isRunning && normalizeTodoId(paused?.todoId) === normalizeTodoId(selectedId);

  // ── Card selection — ask before switching while timer runs (today only) ─
  const handleSelect = (todo) => {
    if (todo.date && todo.date !== viewDate) return;
    if (normalizeTodoId(selectedId) === normalizeTodoId(todo.id)) {
      setSelectedId(null);
      return;
    }
    // Timer is running on a DIFFERENT todo → confirm
    if (timer.isRunning && normalizeTodoId(timer.activeId) !== normalizeTodoId(todo.id)) {
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
      updateTodos((p) =>
        p.map((t) =>
          normalizeTodoId(t.id) === normalizeTodoId(r.todoId) ? { ...t, accum: r.totalMin, accumSec: r.totalSec } : t
        )
      );
      silentSave(r.todoId, r.totalMin).catch(() => {});
      clearAccumCheckpoint();
    }
  };

  const rebuildLocalTbMapFromTodos = (list, dateStr) => {
    const map = {};
    for (const t of list) {
      map[normalizeTodoId(t.id)] = Array.isArray(t.timeBlockingHours) ? [...t.timeBlockingHours] : [];
    }
    writeLocalTbMap(dateStr, map);
  };

  const assignHourToTodo = async (hour, targetIdRaw, slotColorHex) => {
    const targetId = targetIdRaw && String(targetIdRaw).trim() !== '' ? targetIdRaw : null;
    hapticSelect();

    let prevSnap = null;
    let nextSnap = null;
    updateTodos((prev) => {
      prevSnap = prev;
      nextSnap = prev.map((t) => {
        let hrs = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])].filter((x) => x !== hour);
        if (targetId && normalizeTodoId(t.id) === normalizeTodoId(targetId)) {
          hrs = [...hrs, hour].sort((a, b) => a - b);
        }
        return { ...t, timeBlockingHours: hrs };
      });
      // 항상 로컬 TB 맵 갱신 — 노션 미연동·속성 미매핑 상태에서도 칸 탭이 동작하고 새로고침 후 유지됨
      rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
      return nextSnap;
    });

    const dayK = viewDateRef.current;
    const nextColors = { ...readHourColorsMap(dayK) };
    if (targetId) {
      nextColors[String(hour)] = slotColorHex || DEFAULT_TIMETABLE_CHIP;
    } else {
      delete nextColors[String(hour)];
    }
    writeHourColorsMap(dayK, nextColors);
    setHourColorsMap(nextColors);

    const shouldPatchNotion =
      timetableStorageMode === 'notion' &&
      usesNotionTodoApi(creds) &&
      hasTimeBlockingField &&
      notionTimetableReady;

    if (!shouldPatchNotion) return;

    const changed = [];
    for (const t of nextSnap) {
      const p = prevSnap.find((x) => normalizeTodoId(x.id) === normalizeTodoId(t.id));
      const a = JSON.stringify(p?.timeBlockingHours || []);
      const b = JSON.stringify(t.timeBlockingHours || []);
      if (a !== b) changed.push(t);
    }
    try {
      await Promise.all(
        changed.map((t) =>
          apiFetch(
            `/api/todos/${t.id}`,
            { method: 'PATCH', body: JSON.stringify({ timeBlockingHours: t.timeBlockingHours || [] }) },
            creds,
            settings
          )
        )
      );
    } catch (e) {
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + (e?.message || ''));
      loadTodos({ background: true });
    }
  };

  const applyTimetableHourColor = useCallback(
    (hour, hex) => {
      hapticLight();
      const assigned = todos.find(
        (r) => Array.isArray(r.timeBlockingHours) && r.timeBlockingHours.includes(hour)
      );
      const dayK = viewDateRef.current;
      if (!assigned) {
        const next = { ...readHourColorsMap(dayK), [String(hour)]: hex };
        writeHourColorsMap(dayK, next);
        setHourColorsMap(next);
        setTimetableColorHour(null);
        return;
      }
      setTimetableColorHour(null);
      void assignHourToTodo(hour, assigned.id, hex);
    },
    [todos, assignHourToTodo]
  );

  /** 한 번에 `fromHour` → `toHour` 로 옮김 (드래그앤드롭). 같은 시간의 다른 할 일은 칸이 비워짐 */
  const moveHourAssignment = useCallback(
    async (fromHour, toHour, todoIdRaw) => {
      const targetId = todoIdRaw && String(todoIdRaw).trim() !== '' ? todoIdRaw : null;
      if (fromHour === toHour || !targetId) return;
      hapticSelect();

      let prevSnap = null;
      let nextSnap = null;
      updateTodos((prev) => {
        prevSnap = prev;
        nextSnap = prev.map((t) => {
          let hrs = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])].filter(
            (x) => x !== fromHour && x !== toHour
          );
          if (normalizeTodoId(t.id) === normalizeTodoId(targetId)) {
            hrs = [...hrs, toHour].sort((a, b) => a - b);
          }
          return { ...t, timeBlockingHours: hrs };
        });
        rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
        return nextSnap;
      });

      const dayK = viewDateRef.current;
      const nextColors = { ...readHourColorsMap(dayK) };
      const movedHex = nextColors[String(fromHour)];
      delete nextColors[String(fromHour)];
      if (movedHex) nextColors[String(toHour)] = movedHex;
      writeHourColorsMap(dayK, nextColors);
      setHourColorsMap(nextColors);

      const shouldPatchNotion =
        timetableStorageMode === 'notion' &&
        usesNotionTodoApi(creds) &&
        hasTimeBlockingField &&
        notionTimetableReady;

      if (!shouldPatchNotion) return;

      const changed = [];
      for (const t of nextSnap) {
        const p = prevSnap.find((x) => normalizeTodoId(x.id) === normalizeTodoId(t.id));
        const a = JSON.stringify(p?.timeBlockingHours || []);
        const b = JSON.stringify(t.timeBlockingHours || []);
        if (a !== b) changed.push(t);
      }
      try {
        await Promise.all(
          changed.map((t) =>
            apiFetch(
              `/api/todos/${t.id}`,
              { method: 'PATCH', body: JSON.stringify({ timeBlockingHours: t.timeBlockingHours || [] }) },
              creds,
              settings
            )
          )
        );
      } catch (e) {
        setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + (e?.message || ''));
        loadTodos({ background: true });
      }
    },
    [
      creds,
      settings,
      timetableStorageMode,
      hasTimeBlockingField,
      notionTimetableReady,
      ko,
      loadTodos,
    ]
  );

  const handleTimetableDragStart = useCallback((e, hour, todoId) => {
    try {
      e.dataTransfer.setData('application/x-nock-tb', JSON.stringify({ hour, todoId }));
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      /* Safari */
    }
  }, []);
  const handleTimetableDragOver = useCallback((e) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* */
    }
  }, []);
  const handleTimetableDrop = useCallback(
    (e, toHour) => {
      e.preventDefault();
      let payload = null;
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/x-nock-tb') || '');
      } catch {
        return;
      }
      if (!payload || typeof payload.hour !== 'number' || payload.todoId == null) return;
      void moveHourAssignment(payload.hour, toHour, payload.todoId);
    },
    [moveHourAssignment]
  );

  /** 노션 동기화 버튼 — 동작은 추후 연결 */
  const handleTimetableFetchFromNotion = () => {};
  const handleTimetablePushToNotion = () => {};

  // ── Timer actions ──────────────────────────────────────────
  const handleStart = () => {
    if (!selected) return;
    if (!onTodayView) {
      setPopupError(ko ? '타이머는 오늘 날짜 보기에서만 사용할 수 있어요.' : 'Use the timer while viewing today.');
      return;
    }
    const base = isPaused ? (paused.savedAccum ?? selected.accum ?? 0) : (selected.accum ?? 0);
    const baseSec = isPaused ? paused?.savedSec : (Number.isFinite(selected?.accumSec) ? selected.accumSec : null);
    if (isPaused) setPaused(null);
    clearAccumCheckpoint();
    // Uncheck if done
    if (selected.done) {
      updateTodos(p => p.map(t => t.id === selected.id ? { ...t, done: false } : t));
      if (usesNotionTodoApi(creds)) {
        apiFetch(`/api/todos/${selected.id}`, { method:'PATCH', body:JSON.stringify({ done:false }) }, creds, settings).catch(() => {});
      }
    }
    timer.start(selected.id, base, baseSec, {
      taskName: typeof selected.name === 'string' ? selected.name : '',
      taskDate: selected.date || todayStr(),
    });
  };

  const handlePause = async () => {
    if (!onTodayView) return;
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
    clearAccumCheckpoint();
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
    const isCur = normalizeTodoId(todo.id) === normalizeTodoId(selectedId);
    const isTodayRow = (todo.date || todayStr()) === todayStr();
    let fin = todo.accum || 0;
    let finSec = Number.isFinite(todo?.accumSec) ? todo.accumSec : Math.max(0, (todo.accum || 0) * 60);
    if (isCur && isRunning) {
      const r = timer.stop();
      if (r) {
        fin = r.totalMin;
        finSec = r.totalSec;
      }
      setPaused(null);
    } else if (isCur && isPaused) {
      fin = paused.savedAccum ?? todo.accum ?? 0;
      finSec = paused.savedSec ?? Math.max(0, fin * 60);
      setPaused(null);
    } else if (!isCur && timer.isRunning && normalizeTodoId(timer.activeId) === normalizeTodoId(todo.id)) {
      const r = timer.stop();
      if (r) {
        fin = r.totalMin;
        finSec = r.totalSec;
      }
      setPaused(null);
    } else if (!isCur && !timer.isRunning && normalizeTodoId(paused?.todoId) === normalizeTodoId(todo.id)) {
      fin = paused.savedAccum ?? todo.accum ?? 0;
      finSec = paused.savedSec ?? Math.max(0, fin * 60);
      setPaused(null);
    }

    const nextDone = !todo.done;
    updateTodos((p) => p.map((t) => (t.id === todo.id ? { ...t, done: nextDone, accum: fin, accumSec: finSec } : t)));
    if (isCur) setSelectedId(null);

    if (!usesNotionTodoApi(creds)) {
      clearAccumCheckpoint();
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${todo.id}`, { method:'PATCH', body:JSON.stringify({ done: nextDone, accum: fin }) }, creds, settings);
    } catch {}
    finally { setSaving(false); }
    clearAccumCheckpoint();
  };

  const handleResetTime = async (todoId) => {
    if (!todos.find((x) => x.id === todoId)) return;
    hapticMedium();
    if (timer.isRunning && normalizeTodoId(timer.activeId) === normalizeTodoId(todoId)) timer.stop();
    if (normalizeTodoId(paused?.todoId) === normalizeTodoId(todoId)) setPaused(null);
    updateTodos((p) => p.map((t) => (t.id === todoId ? { ...t, accum: 0, accumSec: 0 } : t)));
    clearAccumCheckpoint();
    if (!usesNotionTodoApi(creds)) return;
    apiFetch(`/api/todos/${todoId}`, { method: 'PATCH', body: JSON.stringify({ accum: 0 }) }, creds, settings).catch((e) =>
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + (e?.message || String(e)))
    );
  };

  const handleDelete = async (todoId) => {
    hapticMedium();
    updateTodos((p) => p.filter((t) => t.id !== todoId));
    if (selectedId === todoId) setSelectedId(null);
    if (normalizeTodoId(timer.activeId) === normalizeTodoId(todoId)) timer.stop();
    clearAccumCheckpoint();
    if (!usesNotionTodoApi(creds)) return;
    apiFetch(`/api/todos/${todoId}`, { method:'DELETE' }, creds, settings).catch(() => {});
  };

  const silentSave = useCallback(async (id, min, opts = {}) => {
    if (!usesNotionTodoApi(creds)) return;
    if (!hasServerSyncRef.current) return;
    try {
      await apiFetch(
        `/api/todos/${id}`,
        { method: 'PATCH', body: JSON.stringify({ accum: min }), keepalive: !!opts.keepalive },
        creds,
        settings
      );
    } catch {}
  }, [creds, settings]);

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
    if (usesNotionTodoApi(creds)) void silentSave(tid, min);
    clearAccumCheckpoint();
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
      clearAccumCheckpoint();
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
        if (!prev.some((t) => normalizeTodoId(t.id) === normalizeTodoId(r.todoId))) return prev;
        const next = prev.map((t) =>
          normalizeTodoId(t.id) === normalizeTodoId(r.todoId) ? { ...t, accum: r.totalMin, accumSec: r.totalSec } : t
        );
        persistDayTodos(prevDay, next);
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
  }, [silentSave, creds]);

  /* 측정 중: 로컬 1분 체크포인트 + 탭 숨김·나갈 때 노션 1회(keepalive) */
  useEffect(() => {
    if (!timer.isRunning) return undefined;

    const pushLocalOnly = () => {
      const p = timerRef.current.peekSessionTotals();
      if (p) writeAccumCheckpoint(p);
    };

    if (!usesNotionTodoApi(creds)) {
      pushLocalOnly();
      const localIv = setInterval(pushLocalOnly, 60 * 1000);
      return () => clearInterval(localIv);
    }

    const flushNotion = (keepalive) => {
      const p = timerRef.current.peekSessionTotals();
      if (!p || !hasServerSyncRef.current) return;
      writeAccumCheckpoint(p);
      silentSave(p.todoId, p.totalMin, { keepalive });
    };

    pushLocalOnly();
    const localIv = setInterval(pushLocalOnly, 60 * 1000);

    const onVis = () => {
      if (document.visibilityState === 'hidden') flushNotion(true);
    };
    const onPageHide = () => flushNotion(true);
    const onBeforeUnload = () => flushNotion(true);

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      clearInterval(localIv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [timer.isRunning, creds, silentSave]);

  const handleSaveTodo = async (name, dateInput, extra = {}) => {
    const dateStr = dateInput || viewDate;
    const trimmed = (name || '').trim();
    const accumMin = Math.max(0, Number(extra?.accumMin ?? 0) || 0);
    const totalSec = Math.floor(accumMin * 60);
    const accum = accumMin;
    const goalPageIdSaved = extra.goalPageId !== undefined ? String(extra.goalPageId || '').trim() : undefined;

    if (editingTodo) {
      timetablePendingHourRef.current = null;
      const id = editingTodo.id;
      if (!usesNotionTodoApi(creds)) {
        updateTodos((p) => {
          if (dateStr !== viewDate) return p.filter((t) => t.id !== id);
          return p.map((t) =>
            t.id === id
              ? {
                  ...t,
                  name: trimmed,
                  date: dateStr,
                  accum,
                  accumSec: totalSec,
                  ...(goalPageIdSaved !== undefined ? { goalPageId: goalPageIdSaved } : {}),
                }
              : t
          );
        });
        setEditingTodo(null);
        setSheet(null);
        return;
      }
      updateTodos((p) => {
        if (dateStr !== viewDate) return p.filter((t) => t.id !== id);
        return p.map((t) =>
          t.id === id
            ? {
                ...t,
                name: trimmed,
                date: dateStr,
                accum,
                accumSec: totalSec,
                ...(goalPageIdSaved !== undefined ? { goalPageId: goalPageIdSaved } : {}),
              }
            : t
        );
      });
      setEditingTodo(null);
      setSheet(null);
      apiFetch(
        `/api/todos/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: trimmed,
            date: dateStr,
            accum,
            ...(goalPageIdSaved !== undefined ? { goalPageId: goalPageIdSaved } : {}),
          }),
        },
        creds,
        settings
      )
        .then(() => loadTodos({ background: true }))
        .catch((e) => setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message));
      return;
    }

    if (!usesNotionTodoApi(creds)) {
      const newDemoId = String(Date.now());
      const tbHour = timetablePendingHourRef.current;
      timetablePendingHourRef.current = null;
      updateTodos((p) => [
        ...p,
        {
          id: newDemoId,
          name: trimmed,
          date: dateStr,
          done: false,
          accum,
          accumSec: totalSec,
          goalPageId: goalPageIdSaved !== undefined ? goalPageIdSaved : '',
        },
      ]);
      setSheet(null);
      if (tbHour != null) void assignHourToTodo(tbHour, newDemoId, DEFAULT_TIMETABLE_CHIP);
      return;
    }
    const tbHourPending = timetablePendingHourRef.current;
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
      goalPageId: goalPageIdSaved !== undefined ? goalPageIdSaved : '',
    };
    if (dateStr === viewDate) updateTodos((p) => [...p, optimisticTodo]);
    setSheet(null);
    try {
      const data = await apiFetch(
        '/api/todos',
        {
          method: 'POST',
          body: JSON.stringify({
            name: trimmed,
            date: dateStr,
            accum: accumMin > 0 ? accum : undefined,
            ...(goalPageIdSaved !== undefined && goalPageIdSaved ? { goalPageId: goalPageIdSaved } : {}),
          }),
        },
        creds,
        settings
      );
      const newId = data?.todo?.id;
      if (newId) {
        if (normalizeTodoId(selectedId) === normalizeTodoId(tempId)) setSelectedId(newId);
        if (timer.remapTodoId) timer.remapTodoId(tempId, newId);
        setPausedRaw((p) => {
          if (!p) return p;
          if (normalizeTodoId(p.todoId) !== normalizeTodoId(tempId)) return p;
          const next = { ...p, todoId: newId };
          try { localStorage.setItem(PAUSED_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      }
      updateTodos((prev) =>
        prev
          .map((t) =>
            t.id === tempId
              ? (data.todo?.date === viewDate
                ? { ...data.todo, clientKey: t.clientKey, accumSec: totalSec }
                : null)
              : t
          )
          .filter(Boolean)
      );
      timetablePendingHourRef.current = null;
      if (tbHourPending != null && newId) await assignHourToTodo(tbHourPending, newId, DEFAULT_TIMETABLE_CHIP);
    } catch (e) {
      timetablePendingHourRef.current = null;
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message);
    }
  };

  const handleSaveFeedback = (text) => {
    if (!usesNotionTodoApi(creds)) {
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
    if (!usesNotionTodoApi(creds)) {
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
        const sel = normalizeTodoId(selectedId) === normalizeTodoId(todo.id);
        const run =
          onTodayView && timer.isRunning && normalizeTodoId(timer.activeId) === normalizeTodoId(todo.id);
        const pau =
          onTodayView &&
          !timer.isRunning &&
          normalizeTodoId(paused?.todoId) === normalizeTodoId(todo.id);
        const la =
          onTodayView && normalizeTodoId(timer.activeId) === normalizeTodoId(todo.id) ? liveAccum : null;
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
                    <button
                      className="btn btn-muted btn-md flex-1"
                      onClick={handlePause}
                      disabled={saving || !onTodayView}
                      style={{ borderRadius: '999px' }}
                    >
                      <Pause size={16} strokeWidth={2.1} /> {ko ? '일시정지' : 'Pause'}
                    </button>
                    <button
                      className="btn btn-complete-blue btn-md flex-1"
                      onClick={() => handleComplete()}
                      disabled={saving}
                      style={{ borderRadius: '999px' }}
                    >
                      {saving ? <span className="spin" /> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                    </button>
                  </>
                ) : pau ? (
                  <>
                    <button
                      className="btn btn-dark btn-md flex-1"
                      onClick={handleStart}
                      disabled={!onTodayView}
                      style={{ borderRadius: '999px' }}
                    >
                      <Play size={16} strokeWidth={2.1} /> {ko ? '재개' : 'Resume'}
                    </button>
                    <button
                      className="btn btn-complete-blue btn-md flex-1"
                      onClick={() => handleComplete()}
                      disabled={saving}
                      style={{ borderRadius: '999px' }}
                    >
                      {saving ? <span className="spin" /> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-dark btn-md flex-1"
                      onClick={handleStart}
                      disabled={!onTodayView}
                      style={{ borderRadius: '999px' }}
                    >
                      <Play size={16} strokeWidth={2.1} /> {t.start}
                    </button>
                    {!todo.done && (
                      <button
                        className="btn btn-complete-blue btn-md flex-1"
                        onClick={() => handleComplete()}
                        disabled={saving}
                        style={{ borderRadius: '999px' }}
                      >
                        {saving ? <span className="spin" /> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
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

  const tpHour = timetableTaskPickerHour;
  const tpPickTodos = tpHour != null ? selectTodosForHour(tpHour) : [];
  const tpAssignedRow =
    tpHour != null
      ? todos.find((todo) => Array.isArray(todo.timeBlockingHours) && todo.timeBlockingHours.includes(tpHour)) ?? null
      : null;
  const tpSlotCol = tpHour != null ? hourColorsMap[String(tpHour)] || DEFAULT_TIMETABLE_CHIP : DEFAULT_TIMETABLE_CHIP;
  const tpHasAssignment = Boolean(tpAssignedRow);
  const tpAssignedId = tpAssignedRow ? String(tpAssignedRow.id) : '';
  const tpValueInList =
    tpAssignedId &&
    tpPickTodos.some((r) => normalizeTodoId(r.id) === normalizeTodoId(tpAssignedId))
      ? tpAssignedId
      : '';

  return (
    <div
      style={{
        minHeight: '100%',
        paddingBottom: 24,
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <NotionLoadingOverlay open={overlayReady && usesNotionTodoApi(creds) && loading && todos.length === 0} message={t.notionLoadingMessage} />
      {pulling && (
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
          <div className="spin spin-dark" />
        </div>
      )}

      {homeSurface === 'timer' && (
        <div style={{ padding: '4px 16px 12px' }}>
          <div
            style={{
              background: 'var(--bg2)',
              borderRadius: 'var(--r)',
              boxShadow: 'var(--shadow)',
              padding: '20px 22px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-2px', color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
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
                <span style={{ color: 'var(--orange)', fontSize: 13, animation: 'pulse 2s ease-in-out infinite' }} aria-hidden>
                  ●
                </span>
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
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--orange)', fontWeight: 600 }}>
                  <Pause size={12} strokeWidth={2.1} />
                  <span>{ko ? '일시정지' : 'Paused'}</span>
                </div>
              </button>
            )}
            {todos.length > 0 && (
              <>
                <div style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 500, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
                  <div className="prog-fill" style={{ width: `${pct}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Todo list ── */}
      <div style={{ padding: '4px 14px' }}>
        {homeSurface === 'timer' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            margin: '6px 4px 10px',
          }}
        >
          <button
            type="button"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              border: 'none',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 10,
            }}
            aria-label={ko ? '이전 날' : 'Previous day'}
            onClick={() => {
              hapticLight();
              trySetViewDate(addCalendarDays(viewDate, -1));
            }}
          >
            <ChevronLeft size={22} strokeWidth={2.1} color="var(--text3)" />
          </button>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  maxWidth: '100%',
                  minWidth: 0,
                }}
              >
                <input
                  type="date"
                  value={viewDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) trySetViewDate(v);
                  }}
                  aria-label={t.date}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: 'var(--text)',
                    lineHeight: 1.35,
                    pointerEvents: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 'min(100%, 260px)',
                  }}
                  title={formatCalendarDateLine(viewDate, locale)}
                >
                  {formatHomeDateHeading(viewDate, locale)}
                </span>
              </label>
              {viewDate !== todayStr() && (
                <button
                  type="button"
                  className="btn btn-muted btn-sm"
                  style={{ borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600 }}
                  onClick={() => {
                    hapticLight();
                    trySetViewDate(todayStr());
                  }}
                >
                  {t.jumpToday}
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              border: 'none',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 10,
            }}
            aria-label={ko ? '다음 날' : 'Next day'}
            onClick={() => {
              hapticLight();
              trySetViewDate(addCalendarDays(viewDate, 1));
            }}
          >
            <ChevronRight size={22} strokeWidth={2.1} color="var(--text3)" />
          </button>
        </div>
        )}
        {homeSurface === 'timetable' && !TIMETABLE_HOME_ENABLED && (
          <div className="home-timetable-section home-timetable-section--soon">
            <div className="home-timetable-page-head">
              <h1 className="page-title home-timetable-page-title">{t.homeIslandTimetable}</h1>
              <p className="home-timetable-soon-message">{t.timetableComingSoon}</p>
            </div>
          </div>
        )}
        {homeSurface === 'timetable' && TIMETABLE_HOME_ENABLED && (
          <div className="home-timetable-section">
            <div className="home-timetable-page-head">
              <div className="home-timetable-title-row">
                <h1 className="page-title home-timetable-page-title">{t.homeIslandTimetable}</h1>
                {timetableStorageMode === 'notion' && (
                  <div className="home-timetable-sync-orbit">
                    <button
                      type="button"
                      className="home-timetable-sync-circle"
                      aria-label={t.timetableSyncFromNotionAria}
                      onClick={handleTimetableFetchFromNotion}
                    >
                      <Download size={18} strokeWidth={2.25} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="home-timetable-sync-circle"
                      aria-label={t.timetableSyncToNotionAria}
                      onClick={handleTimetablePushToNotion}
                    >
                      <Upload size={18} strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
              <p className="home-timetable-hint">
                <Hand className="home-timetable-hint-icon" size={20} strokeWidth={2.1} aria-hidden />
                <span>{t.timetableTapHint}</span>
              </p>
            </div>
            <div className="home-timetable-timeline" ref={timetableTimelineRef}>
              <div className="home-timetable-timeline-line" aria-hidden />
              {timetableNowLineTopPx != null && (
                <div
                  className="home-timetable-now-marker"
                  style={{ top: timetableNowLineTopPx }}
                  aria-hidden
                >
                  <span className="home-timetable-now-marker-label">{ko ? '지금' : 'Now'}</span>
                  <span className="home-timetable-now-marker-line" />
                </div>
              )}
              {visibleHours.map((h) => {
                const row =
                  todos.find((todo) => Array.isArray(todo.timeBlockingHours) && todo.timeBlockingHours.includes(h)) ||
                  null;
                const has = Boolean(row);
                const hourFace = formatHourTimetableAmPm(h);
                const ariaPick = ko ? `${hourFace}에 할 일 지정` : `Assign task at ${hourFace}`;
                const pickTodos = selectTodosForHour(h);
                const assignedId = row ? String(row.id) : '';
                const selectValue =
                  assignedId &&
                  pickTodos.some((r) => normalizeTodoId(r.id) === normalizeTodoId(assignedId))
                    ? assignedId
                    : '';
                const faceLabel = selectValue
                  ? row?.name || (ko ? '(제목 없음)' : '(Untitled)')
                  : ko
                    ? '할 일 선택'
                    : 'Choose task';
                const slotCol = hourColorsMap[String(h)] || DEFAULT_TIMETABLE_CHIP;
                const dotFilled = has || Boolean(hourColorsMap[String(h)]);
                return (
                  <div
                    key={h}
                    data-tb-hour={h}
                    className="home-timetable-timeline-row"
                    onDragOver={handleTimetableDragOver}
                    onDrop={(e) => handleTimetableDrop(e, h)}
                  >
                    {!has ? (
                      <span className="home-timetable-hour-label">{hourFace}</span>
                    ) : (
                      <span
                        className="home-timetable-hour-label home-timetable-hour-label--drag"
                        draggable
                        onDragStart={(e) => handleTimetableDragStart(e, h, row.id)}
                        style={{ cursor: 'grab', touchAction: 'none' }}
                      >
                        {hourFace}
                      </span>
                    )}
                    <div className="home-timetable-rail">
                      <button
                        type="button"
                        className="home-timetable-dot-btn"
                        aria-label={ko ? '칸 색' : 'Slot color'}
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticLight();
                          setTimetableTaskPickerHour(null);
                          setTimetableColorHour(h);
                        }}
                      >
                        <span
                          className={`home-timetable-dot ${dotFilled ? 'home-timetable-dot--filled' : 'home-timetable-dot--empty'}`}
                          style={
                            dotFilled
                              ? {
                                  background: slotCol,
                                  border: 'none',
                                }
                              : undefined
                          }
                        />
                      </button>
                    </div>
                    <div className="home-timetable-slot-wrap">
                      <button
                        type="button"
                        className="settings-select-shell home-timetable-inline-select home-timetable-slot-trigger"
                        aria-label={ariaPick}
                        aria-haspopup="dialog"
                        aria-expanded={timetableTaskPickerHour === h}
                        onClick={() => {
                          hapticLight();
                          setTimetableColorHour(null);
                          setTimetableTaskPickerHour(h);
                        }}
                      >
                        <span className="settings-select-face" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {selectValue && row && todoHasGoalLink(row) && (
                            <Target size={17} strokeWidth={2.2} color="var(--text3)" style={{ flexShrink: 0 }} aria-hidden />
                          )}
                          <span className="truncate">{faceLabel}</span>
                        </span>
                        <span className="settings-chevron" aria-hidden>
                          ›
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {loading && usesNotionTodoApi(creds) ? (
          <div style={{ minHeight: 200 }} aria-hidden />
        ) : !loading ? (
        error ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><TriangleAlert size={36} strokeWidth={2.1} color="var(--red)" /></div>
            <div style={{ fontSize:14, fontWeight: 600, color:'var(--red)', marginBottom:8 }}>{ko ? '불러오기 실패' : 'Failed to load'}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, wordBreak:'break-all', lineHeight:1.6 }}>{error}</div>
            <button className="btn btn-dark btn-sm" onClick={loadTodos}>{ko ? '다시 시도' : 'Retry'}</button>
          </div>
        ) : sortedTodos.length === 0 && homeSurface !== 'timetable' ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><ClipboardList size={48} strokeWidth={2.0} color="var(--text3)" /></div>
            <div style={{ color:'var(--text3)', fontWeight: 600, marginBottom:20 }}>{t.noTodos}</div>
            <button
              type="button"
              className="btn btn-dark btn-sm btn-pill-add"
              onClick={() => {
                setEditingTodo(null);
                setSheet('add');
              }}
            >
              {t.addFirst}
            </button>
          </div>
        ) : homeSurface === 'timetable' ? null : (
            renderTodayStack()
        )
        ) : null}
      </div>

      {/* ── Confirm switch dialog ── */}
      {confirmSwitch && (
        <PopupDialog
          title={ko ? '측정 중인 할일이 있어요' : 'Timer is running'}
          message={ko ? '현재 측정을 멈추고 다른 할 일로 전환할까요?' : 'Stop the current timer and switch to another task?'}
          cancelText={t.cancel}
          confirmText={ko ? '전환하기' : 'Switch'}
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
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
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
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
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
          onCancel={() => setConfirmReset(null)}
          onConfirm={() => {
            const id = confirmReset.todoId;
            setConfirmReset(null);
            handleResetTime(id);
          }}
        />
      )}

      {TIMETABLE_HOME_ENABLED && timetableTaskPickerHour != null && (
        <>
          <div
            className="backdrop"
            role="presentation"
            onClick={() => setTimetableTaskPickerHour(null)}
            aria-hidden
          />
          <div
            className="sheet timetable-native-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timetable-task-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chrome-bottom-sheet-handle-wrap" aria-hidden>
              <div className="chrome-bottom-sheet-handle" />
            </div>
            <div className="timer-save-nav">
              <button
                type="button"
                className="nav-circle-btn nav-circle-btn--dismiss"
                onClick={() => setTimetableTaskPickerHour(null)}
                aria-label={t.cancel}
              >
                <X size={22} strokeWidth={2.2} aria-hidden />
              </button>
              <div className="timer-save-nav-title">
                <div id="timetable-task-picker-title" className="timer-save-nav-name">
                  {formatHourTimetableAmPm(tpHour)}
                </div>
                <div className="timer-save-nav-date">
                  {ko ? '할 일 선택' : 'Choose task'}
                </div>
              </div>
              <button
                type="button"
                className="nav-circle-btn nav-circle-btn--dismiss"
                disabled={!tpHasAssignment}
                title={ko ? '이 시간 배정 취소' : 'Clear this slot'}
                aria-label={ko ? '이 시간 배정 취소' : 'Clear this slot'}
                onClick={() => {
                  if (!tpHasAssignment || tpHour == null) return;
                  hapticMedium();
                  void assignHourToTodo(tpHour, '', tpSlotCol);
                  setTimetableTaskPickerHour(null);
                }}
              >
                <RotateCcw size={22} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
            <div className="timetable-native-picker-body">
              {tpPickTodos.length === 0 ? (
                <p className="timetable-native-picker-empty">
                  {ko ? '완료되지 않은 할 일이 없어요.' : 'No open tasks.'}
                </p>
              ) : (
                <ul className="timetable-native-picker-list" role="listbox" aria-label={ko ? '할 일 목록' : 'Tasks'}>
                  {tpPickTodos.map((todo) => {
                    const name = todo.name || (ko ? '(제목 없음)' : '(Untitled)');
                    const selected =
                      Boolean(tpValueInList) &&
                      normalizeTodoId(todo.id) === normalizeTodoId(tpValueInList);
                    return (
                      <li key={String(todo.id)} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`timetable-native-picker-row${selected ? ' timetable-native-picker-row--selected' : ''}`}
                          onClick={() => {
                            hapticLight();
                            void assignHourToTodo(tpHour, String(todo.id), tpSlotCol);
                            setTimetableTaskPickerHour(null);
                          }}
                        >
                          {todoHasGoalLink(todo) && (
                            <Target size={18} strokeWidth={2.2} color="var(--text3)" style={{ flexShrink: 0 }} aria-hidden />
                          )}
                          <span className="truncate timetable-native-picker-row-label">{name}</span>
                          {selected ? (
                            <Check className="timetable-native-picker-row-check" size={20} strokeWidth={2.75} aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {TIMETABLE_HOME_ENABLED && timetableColorHour != null && (
        <>
          <div
            className="popup-backdrop"
            role="presentation"
            onClick={() => setTimetableColorHour(null)}
            aria-hidden
          />
          <div className="popup-wrap">
            <div
              className="popup pop-in popup--header-dismiss popup-timetable-pick popup-timetable-color-only"
              role="dialog"
              aria-modal="true"
              aria-labelledby="timetable-color-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="popup-header-field">
                <button
                  type="button"
                  className="popup-close-x"
                  aria-label={t.cancel}
                  onClick={() => setTimetableColorHour(null)}
                >
                  <X size={22} strokeWidth={2.2} aria-hidden />
                </button>
                <div id="timetable-color-title" className="popup-title popup-title--header-row">
                  {formatHourTimetableAmPm(timetableColorHour)}
                </div>
                <span className="popup-header-spacer" aria-hidden />
              </div>
              <div
                className="home-timetable-pick-colors home-timetable-pick-colors--solo"
                role="listbox"
                aria-label={ko ? '이 시간 칸 색' : 'Slot color'}
              >
                {TIMETABLE_CHIP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="option"
                    aria-selected={(hourColorsMap[String(timetableColorHour)] || DEFAULT_TIMETABLE_CHIP) === c}
                    className="home-timetable-pick-color-chip"
                    data-selected={
                      (hourColorsMap[String(timetableColorHour)] || DEFAULT_TIMETABLE_CHIP) === c
                        ? 'true'
                        : undefined
                    }
                    style={{ '--chip-color': c }}
                    onClick={() => applyTimetableHourColor(timetableColorHour, c)}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {popupError && !timerSaveUi && (
        <PopupDialog
          title={ko ? '오류가 발생했어요' : 'Something went wrong'}
          message={popupError}
          confirmText={ko ? '확인' : 'OK'}
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
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
                  variant="compact"
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
          creds={creds}
          settings={settings}
          defaultTodoDate={viewDate}
          editingTodo={editingTodo}
          onSave={handleSaveTodo}
          onClose={() => {
            setSheet(null);
            setEditingTodo(null);
            timetablePendingHourRef.current = null;
          }}
        />
      )}
      {pastDayProPopupOpen && (
        <PopupDialog
          title={ko ? 'Pro 기능' : 'Pro feature'}
          message={t.homePastDaysPro}
          confirmText={t.btnOk}
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
          onCancel={() => setPastDayProPopupOpen(false)}
          onConfirm={() => setPastDayProPopupOpen(false)}
          singleAction
        />
      )}
      {sheet === 'feedback' && (
        <FeedbackSheet
          t={t}
          showConnectHint={!usesNotionTodoApi(creds)}
          initialText={feedbackInitialText}
          onSave={handleSaveFeedback}
          onClose={() => setSheet(null)}
        />
      )}
      {typeof onRequestAddTodo === 'function' && (
        <button
          type="button"
          className="home-add-todo-fab"
          aria-label={t.addTodo}
          onClick={() => {
            hapticLight();
            onRequestAddTodo();
          }}
        >
          <Plus size={24} strokeWidth={2.4} aria-hidden />
        </button>
      )}
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
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontWeight: 400,
                fontSize: 18,
                color: 'var(--text)',
                opacity: todo.done ? 0.4 : 1,
                textDecoration: todo.done ? 'line-through' : 'none',
                minWidth: 0,
              }}
              className="truncate"
            >
              {todo.name}
            </span>
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
