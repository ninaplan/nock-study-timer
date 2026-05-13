'use client';
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  X,
  Trash2,
  Pause,
  Play,
  TriangleAlert,
  ClipboardList,
  Pencil,
  RotateCcw,
  Plus,
  Hand,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { NOCK_TIMER_PAUSED_KEY, useTimer } from './lib/useTimer';
import { apiFetch, resolveApiUrl } from './lib/apiClient';
import { describeTodoFetchFailure, NOTION_STATUS_PAGE_URL } from './lib/notionLoadErrors';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { localDateKey, addCalendarDays } from '@/app/lib/dateUtils';
import {
  normalizeAccumMin,
  dedupeTodosById,
  normalizeTodoKey as normalizeTodoId,
} from '@/app/lib/todoAccum';
import { getLocale } from '@/app/lib/i18n';
import { getDayWindowHourIndicesFromSettings } from '@/app/lib/dayWindow';
import {
  timeToYWithHourBandLayout,
  getTimelineSpanMinutes,
  isMinuteInVisibleTimeline,
} from '@/app/lib/timelineLayout';
import { PREMIUM_GATES_ENABLED, TIMETABLE_HOME_ENABLED } from '@/app/lib/featureFlags';
import { isLocalMode, usesNotionTodoApi } from '@/app/lib/credsMode';
import { getUserKey } from '@/app/lib/getUserKey';
import { loadLocalTodosForDay, saveLocalTodosForDay } from '@/app/lib/localTodosStore';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';
import PopupDialog from './PopupDialog';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import TimeWheelPicker from './TimeWheelPicker';
import TimetableTaskPickPopover from './TimetableTaskPickPopover';
import { hapticHeavy, hapticLight, hapticMedium, hapticSelect, hapticSuccess } from './lib/haptics';

/** 타임라인 트랙 `.home-timetable-track`의 padding과 동기 — timeToY paddingTop·높이 계산에 사용 */
const TIMELINE_PAD_TOP = 8;
const TIMELINE_PAD_BOTTOM = 16;

/** 시간 칸 안 세로선: 위·아래 정각 점(시간 경계)과 겹치지 않게 띄우는 여백 (px). */
const TB_SPINE_SEGMENT_EDGE_INSET_PX = 8;

/**
 * 한 시간 밴드(.home-timetable-hour-band) 최소 높이(px) — 빈 시간대 폭에 사용되는 기준.
 * 시간 축 높이 측정은 화면 가능 영역(shell content)만 쓰고, 특정 시간에 할 일이 많아
 * 해당 칸만 늘어날 때는 다른 빈 시간대 높이는 그대로 둔다(트랙 minHeight로 전체 스택).
 * 많은 시간 보기에서 px/분이 너무 작아지면 칩이 세로로 눌린다 → px/분·밴드에 바닥을 둔다.
 */
const TB_MIN_HOUR_BAND_PX = 76;
const TB_MIN_PX_PER_MIN = TB_MIN_HOUR_BAND_PX / 60;

/** 세로 스택 높이 추정 — app/globals 의 칩 높이·열 간격과 맞춤(스크롤 대신 px/분 바닥으로 칸 길게) */
const TB_STACK_PILL_PX = 44;
const TB_STACK_SEG_GAP_PX = 6;
const TB_STACK_WRAP_GAP_PX = 4;
const TB_STACK_TAIL_DROP_PX = 8;
const TB_STACK_SURFACE_VERT_PAD_PX = 4;

function tbEstimatedStackBandPx(maxTodosInSlot) {
  const n = Math.floor(Number(maxTodosInSlot)) || 0;
  if (n <= 0) return TB_MIN_HOUR_BAND_PX;
  const chips = n * TB_STACK_PILL_PX + Math.max(0, n - 1) * TB_STACK_SEG_GAP_PX;
  return Math.max(
    TB_MIN_HOUR_BAND_PX,
    TB_STACK_SURFACE_VERT_PAD_PX + chips + TB_STACK_WRAP_GAP_PX + TB_STACK_TAIL_DROP_PX
  );
}
// ── Utils ─────────────────────────────────────────────────────
const fmtMin = (m, ko) => {
  if (!m) return ko ? '0분' : '0m';
  const h = Math.floor(m/60), r = m%60;
  if (ko) { if(h&&r) return `${h}시간 ${r}분`; if(h) return `${h}시간`; return `${r}분`; }
  if(h&&r) return `${h}h ${r}m`; if(h) return `${h}h`; return `${r}m`;
};
const todayStr = () => localDateKey();

/** 로컬 전용 새 할 일 id — 같은 ms 연속 생성 충돌 방지 */
function allocateLocalTodoId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `nock-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const TB_DND_EMPTY_GIF =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

let tbSingletonEmptyDragImg = null;
function getTbEmptyDragImg() {
  if (tbSingletonEmptyDragImg) return tbSingletonEmptyDragImg;
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = TB_DND_EMPTY_GIF;
  tbSingletonEmptyDragImg = img;
  return img;
}

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

/** 시간표 시간 축 레이블 — AM/PM 없이 숫자만 (`use24h`면 0–23, 아니면 1–12) */
function formatHourTimetableAxis(hour, use24h) {
  const h = (((hour % 24) + 24) % 24);
  if (use24h) return String(h);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return String(hh);
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
const LS_HOME_GOAL_GROUP = 'nock_home_goal_group_v1';
const LS_HOME_HIDE_DONE = 'nock_home_hide_done_v1';

function readHomeBoolPref(key, defaultVal) {
  try {
    if (typeof localStorage === 'undefined') return defaultVal;
    const v = localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  return defaultVal;
}

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

/** 날짜별로 각 시각 칸 할 일 순서만 로컬에 보관(timeBlockingHours과 병행 · 노연동 대상 아님) */
const LOCAL_TB_SLOT_ORDER_PREFIX = 'nock_tb_slot_order_v1_';
function localTbSlotOrderKey(d) {
  return LOCAL_TB_SLOT_ORDER_PREFIX + d;
}
function readLocalTbSlotOrder(d) {
  try {
    const r = localStorage.getItem(localTbSlotOrderKey(d));
    if (!r) return {};
    const o = JSON.parse(r);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (!Array.isArray(v)) continue;
      out[String(k)] = v.map((x) => String(x));
    }
    return out;
  } catch {
    return {};
  }
}
function writeLocalTbSlotOrder(d, orderByHourStr) {
  try {
    localStorage.setItem(localTbSlotOrderKey(d), JSON.stringify(orderByHourStr));
  } catch {
    /* */
  }
}

/** orderMap[hourStr] = 정규화 id 순서 배열 · 없으면 sortedTodos 순으로 꼬리 붙임 */
function sortTodosForTbHourSlot(slotTodos, hourStr, tbOrderMap, sortedTodosGlobal) {
  const byNorm = new Map(slotTodos.map((t) => [normalizeTodoId(t.id), t]));
  const orderArr =
    tbOrderMap[hourStr] && Array.isArray(tbOrderMap[hourStr]) ? [...tbOrderMap[hourStr]] : [];
  const inSlotNorms = new Set([...byNorm.keys()]);
  const ordered = [];
  const used = new Set();
  for (const oid of orderArr) {
    const n = normalizeTodoId(oid);
    if (!inSlotNorms.has(n) || used.has(n)) continue;
    const row = byNorm.get(n);
    if (row) {
      ordered.push(row);
      used.add(n);
    }
  }
  for (const t of sortedTodosGlobal) {
    const n = normalizeTodoId(t.id);
    if (!inSlotNorms.has(n) || used.has(n)) continue;
    ordered.push(t);
    used.add(n);
  }
  return ordered;
}

function sanitizeTbSlotOrderMap(prev, todosInDaySorted) {
  const next = { ...prev };
  for (const hk of Object.keys(next)) {
    const hn = Number(hk);
    if (!Number.isFinite(hn)) {
      delete next[hk];
      continue;
    }
    const slotSet = new Set(
      todosInDaySorted
        .filter((ti) => Array.isArray(ti.timeBlockingHours) && ti.timeBlockingHours.includes(hn))
        .map((ti) => normalizeTodoId(ti.id))
    );
    const arr = Array.isArray(next[hk]) ? next[hk] : [];
    const filtered = [];
    const seen = new Set();
    for (const oid of arr) {
      const n = normalizeTodoId(oid);
      if (!slotSet.has(n) || seen.has(n)) continue;
      filtered.push(n);
      seen.add(n);
    }
    for (const t of todosInDaySorted) {
      const n = normalizeTodoId(t.id);
      if (!slotSet.has(n) || seen.has(n)) continue;
      filtered.push(n);
      seen.add(n);
    }
    if (filtered.length === 0) delete next[hk];
    else next[hk] = filtered;
  }
  return next;
}

function tbOrderAppendToHour(prev, hour, normId) {
  const k = String(hour);
  const n = normalizeTodoId(normId);
  const arr = [...(prev[k] || [])].filter((x) => normalizeTodoId(x) !== n);
  arr.push(n);
  return { ...prev, [k]: arr };
}

function tbOrderRemoveFromHour(prev, hour, normId) {
  const k = String(hour);
  const n = normalizeTodoId(normId);
  const arr = [...(prev[k] || [])].filter((x) => normalizeTodoId(x) !== n);
  if (arr.length === 0) {
    const copy = { ...prev };
    delete copy[k];
    return copy;
  }
  return { ...prev, [k]: arr };
}

function tbOrderReorderInsertBefore(prev, hour, movingNorm, beforeNormNullable) {
  const k = String(hour);
  const m = normalizeTodoId(movingNorm);
  let arr = [...(prev[k] || [])].filter((x) => normalizeTodoId(x) !== m);
  if (beforeNormNullable == null) {
    arr.push(m);
    return { ...prev, [k]: arr };
  }
  const b = normalizeTodoId(beforeNormNullable);
  const idx = arr.findIndex((x) => normalizeTodoId(x) === b);
  if (idx < 0) arr.push(m);
  else arr.splice(idx, 0, m);
  return { ...prev, [k]: arr };
}

function tbOrderAfterSingleMove(prev, fromHour, toHour, movingNorm) {
  let next = tbOrderRemoveFromHour(prev, fromHour, movingNorm);
  next = tbOrderAppendToHour(next, toHour, movingNorm);
  return next;
}

function tbOrderAfterBlockDnD(prev, fromHour, toHour, movedOrderedNormIds) {
  const fk = String(fromHour);
  const tk = String(toHour);
  const movedSet = new Set(movedOrderedNormIds.map((id) => normalizeTodoId(id)));
  const next = { ...prev };
  next[fk] = [...(prev[fk] || [])].filter((x) => !movedSet.has(normalizeTodoId(x)));
  if (next[fk].length === 0) delete next[fk];

  let toArr = [...(prev[tk] || [])];
  for (const id of movedOrderedNormIds) {
    const n = normalizeTodoId(id);
    toArr = toArr.filter((x) => normalizeTodoId(x) !== n);
  }
  for (const id of movedOrderedNormIds) {
    toArr.push(normalizeTodoId(id));
  }
  next[tk] = toArr;
  return next;
}

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

/** `viewDate`에 해당하는 행만 — 타임블록·순서 로컬 정리 시 날짜 섞임 방지 */
function buildSortedTodosForDay(allTodos, dayKey) {
  const f = [];
  for (const t of allTodos) {
    if (t.date && t.date !== dayKey) continue;
    f.push(t);
  }
  return [...f.filter((t) => !t.done), ...f.filter((t) => t.done)];
}

export default function HomeTab({
  t,
  creds,
  settings,
  /** `'timer' | 'timetable' | …` — 셸 `.content` 스크롤과 타임블록 '지금' 정렬용 */
  mainTab = 'timer',
  onSheetOpenChange,
  onSaveSettings,
  openAddSignal = 0,
  onRequestAddTodo,
  onPremiumGate,
  subscription: subscriptionProp = null,
}) {
  const [todos,      setTodos]      = useState([]);
  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);
  const [loading,    setLoading]    = useState(true);
  const [overlayReady, setOverlayReady] = useState(false);
  /** 할 일 동기화 실패 안내 — blocking 이면 전체 에러 화면, 아니면 목록 위 배너 */
  const [todoFetchIssue, setTodoFetchIssue] = useState(null);
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
  // App.js에서 내려오는 구독 상태 우선 사용 (Realtime/focus 연동)
  const effectiveSubscription = subscriptionProp ?? subscription;
  /** 상단 타이머 탭 → 시간 휠 저장 (`openedWheelMin`: 열었을 때 분 — 휠 미수정 시 체크에서 실시간 peek 우선) */
  const [timerSaveUi, setTimerSaveUi] = useState(null); // null | { todoId, taskName, taskDate, wheelTotalMin, openedWheelMin }
  /** 타임블록 — 슬롯 DOM 앵커 */
  const tbHourSlotSurfaceRef = useRef({});
  /** 노션 PATCH 보류 대상(정규화 id) — «노션으로 보내기»에서 일괄 */
  const tbNotionDirtyNormIdsRef = useRef(new Set());
  const tbLongPressTimerRef = useRef(null);
  const tbDidDragStartRef = useRef(false);
  /** 짧은 탭에서 pointerup으로 피커 연 뒤 합성 click 무시 */
  const tbSuppressTbSlotClickRef = useRef(false);
  /** 길게 누르기 판별용 포인터 세션 */
  const tbSlotGestureRef = useRef(null);
  /** 빈 슬롯: 길게 누르기 후 피커 · 블록 있음: 길게 누른 뒤에만 드래그 가능 */
  const [tbDragArmedHour, setTbDragArmedHour] = useState(null);
  /** 타임블록 드래그 오버레이(포인터 위치 · 소스 세그먼트 치수) */
  const [tbDragFloat, setTbDragFloat] = useState(null);
  const [tbDragClient, setTbDragClient] = useState(null);
  const tbDocDragCleanupRef = useRef(null);
  const tbDragRafRef = useRef(null);
  const tbDragPendingRef = useRef(null);

  const bumpTbDragClient = useCallback((x, y) => {
    tbDragPendingRef.current = { x, y };
    if (tbDragRafRef.current != null) return;
    tbDragRafRef.current = window.requestAnimationFrame(() => {
      tbDragRafRef.current = null;
      const p = tbDragPendingRef.current;
      if (p) setTbDragClient(p);
    });
  }, []);

  useEffect(
    () => () => {
      tbDocDragCleanupRef.current?.();
      tbDocDragCleanupRef.current = null;
      if (tbDragRafRef.current != null) {
        window.cancelAnimationFrame(tbDragRafRef.current);
        tbDragRafRef.current = null;
      }
    },
    []
  );
  /** 할 일 피커 시트 — 열린 시각(0–23) */
  const [timetableTaskPickerHour, setTimetableTaskPickerHour] = useState(null); // null | hour 0–23
  const [tbPushSaving, setTbPushSaving] = useState(false);
  const pullStartY = useRef(null);
  /** 시간표 타임라인 — ‘오늘+지금으로 스크롤’ 무표시 앵커(ref) */
  const timetableTimelineRef = useRef(null);
  const timetableNowMarkerRef = useRef(null);
  /** 타임블록 ‘지금으로 스크롤’ 세션키 — 초당 좌표 갱신에는 반복 스크롤 안 함 */
  const tbScrollToNowHandledRef = useRef('');
  const [timetableNowLineTopPx, setTimetableNowLineTopPx] = useState(null);
  /** 표시 중인 타임블록 타임라인에서 ‘지금’이 속한 벽시계 시(0–23) — 숫자·도트 하이라이트용 */
  const [timetableNowClockHour, setTimetableNowClockHour] = useState(null);
  const [goalPages, setGoalPages] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalGroupingEnabled, setGoalGroupingEnabled] = useState(() => readHomeBoolPref(LS_HOME_GOAL_GROUP, true));
  const [hideCompletedTodos, setHideCompletedTodos] = useState(() => readHomeBoolPref(LS_HOME_HIDE_DONE, false));
  const [homeGoalCategoriesHintOpen, setHomeGoalCategoriesHintOpen] = useState(false);
  const [homeGoalManageSoonOpen, setHomeGoalManageSoonOpen] = useState(false);
  const locale = getLocale(settings?.lang);
  const ko     = locale === 'ko';
  const homeSurface = settings?.homeSurface === 'timetable' ? 'timetable' : 'timer';
  const timeDisplay = settings?.timeDisplay === '12' ? '12' : '24';
  const visibleHours = useMemo(
    () => getDayWindowHourIndicesFromSettings(settings),
    [settings?.dayWindowStart, settings?.dayWindowEnd, settings?.dayWindowStartMin, settings?.dayWindowEndMin]
  );

  const spanMinutes = useMemo(() => getTimelineSpanMinutes(visibleHours), [visibleHours]);
  const timetableTrackInnerRef = useRef(null);
  /** 셸 스크롤 영역 높이(트랙 minHeight와 분리) — 스택 확장 피드백으로 빈 시간 칸까지 px/분 부풀리지 않기 위함 */
  const [timelineViewportInnerPx, setTimelineViewportInnerPx] = useState(0);

  const tbBaselinePxPerMin = useMemo(() => {
    const inner = timelineViewportInnerPx > 140 ? timelineViewportInnerPx : 0;
    if (spanMinutes <= 0 || inner <= 0) return TB_MIN_PX_PER_MIN;
    return Math.max(inner / spanMinutes, TB_MIN_PX_PER_MIN);
  }, [timelineViewportInnerPx, spanMinutes]);

  /** 시간마다 높이 가변 · 스택이 많은 칸만 레이아웃상 길게 — 기본 높이는 트랙이 아니라 viewport 기준 분밀만 사용 */
  const tbHourBandLayout = useMemo(() => {
    const dayList = buildSortedTodosForDay(todos, viewDate);
    const heights = {};
    const tops = {};
    const defaultBand = Math.max(60 * tbBaselinePxPerMin, TB_MIN_HOUR_BAND_PX);
    let y = TIMELINE_PAD_TOP;
    for (const h of visibleHours) {
      let n = 0;
      for (const ti of dayList) {
        if (!Array.isArray(ti.timeBlockingHours) || !ti.timeBlockingHours.includes(h)) continue;
        n++;
      }
      tops[h] = y;
      const bandH =
        n > 0 ? Math.max(defaultBand, tbEstimatedStackBandPx(n)) : defaultBand;
      heights[h] = bandH;
      y += bandH;
    }
    return {
      tops,
      heights,
      totalPx: y + TIMELINE_PAD_BOTTOM,
    };
  }, [todos, viewDate, visibleHours, tbBaselinePxPerMin]);

  /** 타임라인 트랙 최소 높이 — 시간 칸 누적 + 패딩 */
  const timetableTrackMinHeightPx = useMemo(() => Math.max(240, tbHourBandLayout.totalPx), [tbHourBandLayout.totalPx]);

  const timeToYCoord = useCallback(
    (m) => timeToYWithHourBandLayout(m, visibleHours, tbHourBandLayout.tops, tbHourBandLayout.heights),
    [visibleHours, tbHourBandLayout]
  );

  const updateTimetableNowLinePosition = useCallback(() => {
    if (homeSurface !== 'timetable' || viewDate !== todayStr()) {
      setTimetableNowLineTopPx(null);
      setTimetableNowClockHour(null);
      return;
    }
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    if (!isMinuteInVisibleTimeline(nowMin, visibleHours)) {
      setTimetableNowLineTopPx(null);
      setTimetableNowClockHour(null);
      return;
    }
    const y = timeToYCoord(nowMin);
    setTimetableNowLineTopPx(y);
    setTimetableNowClockHour(d.getHours());
  }, [homeSurface, viewDate, visibleHours, timeToYCoord]);

  const syncTimetableTimelineLayout = useCallback(() => {
    updateTimetableNowLinePosition();
  }, [updateTimetableNowLinePosition]);

  useLayoutEffect(() => {
    if (homeSurface !== 'timetable') {
      setTimelineViewportInnerPx(0);
      return undefined;
    }
    const shell = typeof document !== 'undefined' ? document.querySelector('.shell') : null;
    const content = shell?.querySelector(':scope > .content');
    if (!content || typeof ResizeObserver === 'undefined') return undefined;

    const measureViewport = () => {
      try {
        const ch = Number(content.clientHeight) || 0;
        /** 홈 헤더·탭바·타임블록 헤더/힌트 등 타임라인 외 크기 대상 감안(과대하면 빈 시간 칸이 너무 낮음) */
        const reserved = Math.min(340, Math.max(164, Math.round(ch * 0.42)));
        setTimelineViewportInnerPx(Math.max(200, ch - reserved));
      } catch {
        const vh =
          typeof window !== 'undefined'
            ? Math.floor(Number(window.visualViewport?.height ?? window.innerHeight) || 600)
            : 520;
        setTimelineViewportInnerPx(Math.max(200, Math.floor(vh * 0.5)));
      }
    };

    measureViewport();
    const ro = new ResizeObserver(measureViewport);
    ro.observe(content);
    window.addEventListener('resize', measureViewport);
    return () => {
      window.removeEventListener('resize', measureViewport);
      ro.disconnect();
    };
  }, [homeSurface, visibleHours]);

  useLayoutEffect(() => {
    let cancelled = false;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        if (!cancelled) syncTimetableTimelineLayout();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [syncTimetableTimelineLayout, visibleHours, tbHourBandLayout.totalPx]);

  useEffect(() => {
    if (homeSurface === 'timetable') syncTimetableTimelineLayout();
  }, [homeSurface, syncTimetableTimelineLayout, visibleHours, tbHourBandLayout.totalPx]);

  /** 타임라인 ‘지금’ 좌표 — 스크롤 앵커용 (가로선 미표시) */
  useEffect(() => {
    if (homeSurface !== 'timetable' || viewDate !== todayStr()) return undefined;
    const id = window.setInterval(() => updateTimetableNowLinePosition(), 1000);
    return () => window.clearInterval(id);
  }, [homeSurface, viewDate, updateTimetableNowLinePosition]);

  useEffect(() => {
    const onResize = () => syncTimetableTimelineLayout();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncTimetableTimelineLayout]);

  /** 타임블록 탭을 나가거나 다른 날로 보면 ‘오늘+지금으로 스크롤’ 다시 허용 */
  useEffect(() => {
    if (mainTab !== 'timetable' || viewDate !== todayStr()) {
      tbScrollToNowHandledRef.current = '';
    }
  }, [mainTab, viewDate]);

  /** 타임블록 ‘지금’ 위치 초기 스크롤 — 무표시 앵커를 화면 중앙 근처로 */
  useLayoutEffect(() => {
    if (!TIMETABLE_HOME_ENABLED || mainTab !== 'timetable' || homeSurface !== 'timetable') return undefined;
    if (viewDate !== todayStr()) return undefined;
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    if (!isMinuteInVisibleTimeline(nowMin, visibleHours)) return undefined;
    if (timetableNowLineTopPx == null) return undefined;

    const sessionKey = `${viewDate}:${visibleHours.join(',')}`;
    if (tbScrollToNowHandledRef.current === sessionKey) return undefined;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;
    const run = () => {
      if (cancelled) return;
      const el = timetableNowMarkerRef.current;
      if (el) {
        try {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        } catch {
          /* noop */
        }
        tbScrollToNowHandledRef.current = sessionKey;
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) requestAnimationFrame(run);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
    };
  }, [mainTab, homeSurface, viewDate, visibleHours, timetableNowLineTopPx, tbHourBandLayout.totalPx]);

  const closeTbPicker = useCallback(() => {
    setTimetableTaskPickerHour(null);
  }, []);

  useEffect(() => {
    if (timetableTaskPickerHour == null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeTbPicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timetableTaskPickerHour, closeTbPicker]);

  const hasTimeBlockingField = Boolean(String(settings?.todoFields?.timeBlocking || '').trim());
  const timetableStorageMode = settings?.timetableStorageMode === 'notion' ? 'notion' : 'local';
  const notionTimetableReady =
    isLocalMode(creds) || (hasNotionAuth(creds) && hasTimeBlockingField && Boolean(creds?.dbTodo));
  useEffect(() => {
    const fetchSub = () => {
      const userKey = getUserKey(creds);
      const base = userKey
        ? resolveApiUrl(`/api/subscription?customerKey=${encodeURIComponent(userKey)}&_t=${Date.now()}`)
        : resolveApiUrl(`/api/subscription?_t=${Date.now()}`);
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
  }, [creds?.authMode, creds?.workspaceId]);

  const hasPremium =
    !PREMIUM_GATES_ENABLED || (
      effectiveSubscription?.status === 'active' ||
      (effectiveSubscription?.status === 'trialing' && new Date(effectiveSubscription.trial_end_at) > new Date()) ||
      (effectiveSubscription?.status === 'cancelled' && effectiveSubscription.next_charge_at && new Date(effectiveSubscription.next_charge_at) > new Date())
    );

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
    /* 타임블록 할 일 피커는 경량 팝오버 — 하단 아일랜드 숨김(sheet 오픈)에 포함하지 않음 */
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

  useEffect(
    () => () => {
      if (tbLongPressTimerRef.current) {
        clearTimeout(tbLongPressTimerRef.current);
        tbLongPressTimerRef.current = null;
      }
    },
    []
  );

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
    let cacheHadRows = false;
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
        setTodoFetchIssue(null);
        return;
      }

      if (!usesNotionTodoApi(creds)) {
        setTodos([]);
        setLoading(false);
        setPulling(false);
        setTodoFetchIssue(null);
        return;
      }

      const dayKey = viewDateRef.current;
      const cachedList = loadCache(dayKey);
      cacheHadRows = Array.isArray(cachedList) && cachedList.length > 0;
      if (!background) {
        setTodoFetchIssue(null);
        if (cachedList) {
          setTodos(cachedList);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }

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
      setTodoFetchIssue(null);
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
      if (background) {
        return;
      }
      const friendly = describeTodoFetchFailure(e, t);
      const blocking = !cacheHadRows && todosRef.current.length === 0;
      setTodoFetchIssue({
        title: friendly.title,
        detail: friendly.detail,
        blocking,
        showStatusLink: friendly.showStatusLink,
      });
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

  const goalLinked = !!(creds?.dbGoal && String(creds.dbGoal).trim());
  useEffect(() => {
    if (!goalLinked || !hasNotionAuth(creds) || !usesNotionTodoApi(creds)) {
      setGoalPages([]);
      setGoalsLoading(false);
      return;
    }
    let cancelled = false;
    setGoalsLoading(true);
    (async () => {
      try {
        const data = await apiFetch('/api/goals', { method: 'GET' }, creds, settings);
        if (!cancelled) setGoalPages(Array.isArray(data?.goals) ? data.goals : []);
      } catch {
        if (!cancelled) setGoalPages([]);
      } finally {
        if (!cancelled) setGoalsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goalLinked, creds, creds?.token, creds?.authMode, settings]);

  // Stuck on full-screen loader (slow network / hung API) — recover instead of a permanent blank
  useEffect(() => {
    if (!loading || isLocalMode(creds)) return;
    const timeoutId = setTimeout(() => {
      setLoading(false);
      const blocking = todosRef.current.length === 0;
      setTodoFetchIssue((prev) => {
        if (prev && !prev.blocking) return prev;
        return {
          title: t.notionTodoFetchTimeoutTitle,
          detail: t.notionTodoFetchStuckDetail,
          blocking,
          showStatusLink: true,
        };
      });
    }, 25000);
    return () => clearTimeout(timeoutId);
  }, [loading, creds?.authMode, t]);

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

  const onHomeToolbarSelect = useCallback(
    (e) => {
      const sel = e.target;
      const v = sel.value;
      sel.value = '';
      if (!v) return;
      hapticLight();
      if (v === 'goal') {
        if (!goalLinked || !usesNotionTodoApi(creds)) {
          setHomeGoalCategoriesHintOpen(true);
          return;
        }
        const next = !goalGroupingEnabled;
        setGoalGroupingEnabled(next);
        try {
          localStorage.setItem(LS_HOME_GOAL_GROUP, next ? '1' : '0');
        } catch {
          /* noop */
        }
        return;
      }
      if (v === 'hide') {
        const next = !hideCompletedTodos;
        setHideCompletedTodos(next);
        try {
          localStorage.setItem(LS_HOME_HIDE_DONE, next ? '1' : '0');
        } catch {
          /* noop */
        }
        return;
      }
      if (v === 'manage') {
        setHomeGoalManageSoonOpen(true);
      }
    },
    [goalLinked, creds, goalGroupingEnabled, hideCompletedTodos]
  );

  // ── Derived state ──────────────────────────────────────────
  const sortedTodosDay = useMemo(() => buildSortedTodosForDay(todos, viewDate), [todos, viewDate]);

  const homeListTodosOrdered = useMemo(() => {
    if (!hideCompletedTodos) return sortedTodosDay;
    return sortedTodosDay.filter((x) => !x.done);
  }, [sortedTodosDay, hideCompletedTodos]);

  const [tbSlotOrder, setTbSlotOrder] = useState(() => ({}));
  const tbSlotOrderRef = useRef(tbSlotOrder);
  useEffect(() => {
    tbSlotOrderRef.current = tbSlotOrder;
  }, [tbSlotOrder]);

  useEffect(() => {
    setTbSlotOrder(readLocalTbSlotOrder(viewDate));
  }, [viewDate]);

  const mutateTbSlotOrder = useCallback((updater) => {
    setTbSlotOrder((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!next || typeof next !== 'object') return prev;
      const prevJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(next);
      if (prevJson === nextJson) return prev;
      writeLocalTbSlotOrder(viewDateRef.current, next);
      return next;
    });
  }, []);

  useEffect(() => {
    setTbSlotOrder((prev) => {
      const next = sanitizeTbSlotOrderMap(prev, sortedTodosDay);
      const prevJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(next);
      if (prevJson === nextJson) return prev;
      writeLocalTbSlotOrder(viewDateRef.current, next);
      return next;
    });
  }, [sortedTodosDay]);

  const timetableTaskPickerTodos = useMemo(() => {
    const hour = timetableTaskPickerHour;
    if (hour == null) return [];
    return sortedTodosDay
      .filter((ti) => !ti.done)
      .map((ti) => ({
        id: String(ti.id),
        name: ti.name || (ko ? '(제목 없음)' : '(Untitled)'),
        assigned: Array.isArray(ti.timeBlockingHours) && ti.timeBlockingHours.includes(hour),
      }));
  }, [sortedTodosDay, timetableTaskPickerHour, ko]);

  const getTbPickerAnchorRect = useCallback(() => {
    const h = timetableTaskPickerHour;
    if (h == null) return null;
    const el = tbHourSlotSurfaceRef.current[h];
    return el?.getBoundingClientRect?.() ?? null;
  }, [timetableTaskPickerHour]);

  const normGoalId = useCallback((s) => String(s || '').replace(/-/g, '').toLowerCase(), []);

  const homeTodoSections = useMemo(() => {
    const dateHeading = formatHomeDateHeading(viewDate, locale);
    const bucketed =
      goalGroupingEnabled &&
      goalLinked &&
      usesNotionTodoApi(creds) &&
      !goalsLoading;

    if (!bucketed) {
      return [{ key: 'date', label: dateHeading, todos: homeListTodosOrdered }];
    }
    const titleByNorm = new Map(
      goalPages.map((g) => [normGoalId(g.id), typeof g.name === 'string' ? g.name.trim() : ''])
    );
    const noneKey = '__none__';
    const buckets = new Map();
    const pushBucket = (key, todo) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(todo);
    };
    for (const todo of homeListTodosOrdered) {
      const raw = String(todo.goalPageId || '').trim();
      if (!raw) {
        pushBucket(noneKey, todo);
      } else {
        pushBucket(normGoalId(raw), todo);
      }
    }
    const labelFor = (key) => {
      if (key === noneKey) return t.homeSectionNoGoal;
      const name = titleByNorm.get(key);
      return name || (ko ? '목표' : 'Goal');
    };
    const entries = [...buckets.entries()].map(([key, td]) => ({
      key,
      label: labelFor(key),
      todos: td,
    }));
    const noneSec = entries.find((e) => e.key === noneKey);
    const rest = entries
      .filter((e) => e.key !== noneKey)
      .sort((a, b) => a.label.localeCompare(b.label, ko ? 'ko' : 'en'));
    const ordered = [];
    if (noneSec) ordered.push(noneSec);
    ordered.push(...rest);
    return ordered.length > 0 ? ordered : [{ key: 'date', label: dateHeading, todos: homeListTodosOrdered }];
  }, [
    homeListTodosOrdered,
    goalGroupingEnabled,
    goalLinked,
    creds,
    goalsLoading,
    goalPages,
    viewDate,
    locale,
    ko,
    t.homeSectionNoGoal,
    normGoalId,
  ]);


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

  /**
   * 타임블록(timeBlockingHours) 변경 시 노연동.
   * notion 저장 모드: 즉시 PATCH 하지 않고 dirty 집합에만 쌓아 «노션으로 보내기»에서 일괄 전송.
   */
  const flushTbNotionPatches = useCallback(
    (prevSnap, nextSnap) => {
      if (!nextSnap || !prevSnap) return;
      const deferToNotionBatch =
        timetableStorageMode === 'notion' && usesNotionTodoApi(creds) && hasTimeBlockingField;

      const changedNorm = new Set();
      for (const t of nextSnap) {
        const p = prevSnap.find((x) => normalizeTodoId(x.id) === normalizeTodoId(t.id));
        const a = JSON.stringify(p?.timeBlockingHours || []);
        const b = JSON.stringify(t.timeBlockingHours || []);
        if (a !== b) changedNorm.add(normalizeTodoId(t.id));
      }
      if (changedNorm.size === 0) return;

      if (deferToNotionBatch) {
        const bag = tbNotionDirtyNormIdsRef.current;
        changedNorm.forEach((id) => bag.add(id));
      }
    },
    [timetableStorageMode, creds, hasTimeBlockingField]
  );

  const appendTodoToHourOnly = useCallback(
    (hour, todoRawId) => {
      if (todoRawId == null || String(todoRawId).trim() === '') return;
      let prevSnap = null;
      let nextSnap = null;
      updateTodos((prev) => {
        prevSnap = prev;
        nextSnap = prev.map((t) => {
          let hrs = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])];
          if (normalizeTodoId(t.id) === normalizeTodoId(todoRawId)) {
            if (!hrs.includes(hour)) hrs = [...hrs, hour].sort((a, b) => a - b);
          }
          return { ...t, timeBlockingHours: hrs };
        });
        rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
        return nextSnap;
      });
      void flushTbNotionPatches(prevSnap, nextSnap);
      mutateTbSlotOrder((prev) => tbOrderAppendToHour(prev, hour, todoRawId));
    },
    [flushTbNotionPatches, mutateTbSlotOrder]
  );

  /** 이 시간에서 할 일 한 개만 빼기 */
  const removeTodoFromHourOnly = useCallback(
    (hour, todoRawId) => {
      if (todoRawId == null || String(todoRawId).trim() === '') return;
      let prevSnap = null;
      let nextSnap = null;
      updateTodos((prev) => {
        prevSnap = prev;
        nextSnap = prev.map((t) => {
          let hrs = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])];
          if (normalizeTodoId(t.id) === normalizeTodoId(todoRawId)) {
            hrs = hrs.filter((x) => x !== hour);
          }
          return { ...t, timeBlockingHours: hrs };
        });
        rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
        return nextSnap;
      });
      void flushTbNotionPatches(prevSnap, nextSnap);
      mutateTbSlotOrder((prev) => tbOrderRemoveFromHour(prev, hour, todoRawId));
    },
    [flushTbNotionPatches, mutateTbSlotOrder]
  );

  /** 이 시간 칸에 연결된 모든 할 일을 다른 시각으로 이동 */
  const moveHourBlockDnD = useCallback(
    (fromHour, toHour) => {
      if (fromHour === toHour) return;
      hapticSelect();
      const dayKey = viewDateRef.current;
      const prevTodosAll = todosRef.current;
      const sortedDayGlobal = buildSortedTodosForDay(prevTodosAll, dayKey);
      const slotTodosPrev = sortedDayGlobal.filter(
        (ti) => Array.isArray(ti.timeBlockingHours) && ti.timeBlockingHours.includes(fromHour)
      );
      const movedOrderedNormIds = sortTodosForTbHourSlot(
        slotTodosPrev,
        String(fromHour),
        tbSlotOrderRef.current,
        sortedDayGlobal
      ).map((t) => normalizeTodoId(t.id));
      let prevSnap = null;
      let nextSnap = null;
      updateTodos((prev) => {
        prevSnap = prev;
        nextSnap = prev.map((t) => {
          const hrsRaw = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])];
          if (!hrsRaw.includes(fromHour)) return t;
          const without = hrsRaw.filter((x) => x !== fromHour && x !== toHour);
          const merged = [...without, toHour].sort((a, b) => a - b);
          return { ...t, timeBlockingHours: merged };
        });
        rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
        return nextSnap;
      });
      void flushTbNotionPatches(prevSnap, nextSnap);
      mutateTbSlotOrder((prev) => tbOrderAfterBlockDnD(prev, fromHour, toHour, movedOrderedNormIds));
    },
    [flushTbNotionPatches, mutateTbSlotOrder]
  );

  function clearTbLongPressTimer() {
    if (tbLongPressTimerRef.current) {
      clearTimeout(tbLongPressTimerRef.current);
      tbLongPressTimerRef.current = null;
    }
  }

  const TB_SLOT_TAP_MAX_MS = 300;
  const TB_SLOT_MOVE_SLOP = 12;
  /** 세로로 긋기 시작하면 페이지 스크롤 의도로 보고 롱프레스·탭 피커 취소 */
  const TB_SLOT_SCROLL_CANCEL_Y = 14;
  /* 할 일 있는 칸: 드래그 무장까지 대기 시간(탭 피커와 균형) */
  const TB_LONG_MS_FILLED = 260;
  const TB_LONG_MS_EMPTY = 400;

  const openTbPicker = useCallback((hour) => {
    setTbDragArmedHour(null);
    setTimetableTaskPickerHour(hour);
    hapticSelect();
  }, []);

  function startTbSlotLongPress(h, hasTodos, clientX, clientY) {
    clearTbLongPressTimer();
    tbSlotGestureRef.current = {
      hour: h,
      hasTodos,
      start: Date.now(),
      x: clientX,
      y: clientY,
      longPressFired: false,
      suppressTap: false,
      suppressLongPress: false,
    };
    const delay = hasTodos ? TB_LONG_MS_FILLED : TB_LONG_MS_EMPTY;
    tbLongPressTimerRef.current = window.setTimeout(() => {
      tbLongPressTimerRef.current = null;
      const g = tbSlotGestureRef.current;
      if (!g || g.hour !== h || g.suppressLongPress) return;
      g.longPressFired = true;
      if (hasTodos) {
        setTbDragArmedHour(h);
        hapticHeavy();
      } else {
        openTbPicker(h);
      }
    }, delay);
  }

  const relayTbHourBandPointerMove = useCallback((ev, hourSlot) => {
    const g = tbSlotGestureRef.current;
    if (!g || g.hour !== hourSlot) return;
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    if (Math.hypot(dx, dy) > TB_SLOT_MOVE_SLOP) {
      g.suppressTap = true;
      clearTbLongPressTimer();
    }
    if (Math.abs(dy) > TB_SLOT_SCROLL_CANCEL_Y && Math.abs(dy) > Math.abs(dx) * 1.08) {
      g.suppressLongPress = true;
      clearTbLongPressTimer();
    }
  }, []);

  const finalizeTbHourBandPointerUp = useCallback(
    (ev, hourSlot, releaseCaptureEl) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      try {
        if (releaseCaptureEl?.hasPointerCapture?.(ev.pointerId)) {
          releaseCaptureEl.releasePointerCapture(ev.pointerId);
        }
      } catch {
        /* noop */
      }
      const g = tbSlotGestureRef.current;
      clearTbLongPressTimer();
      if (!g || g.hour !== hourSlot) {
        window.setTimeout(() => {
          if (!tbDidDragStartRef.current) setTbDragArmedHour((prev) => (prev === hourSlot ? null : prev));
        }, 90);
        return;
      }
      const elapsed = Date.now() - g.start;
      const moved =
        Number.isFinite(ev.clientX) &&
        Number.isFinite(ev.clientY) &&
        Math.hypot(ev.clientX - g.x, ev.clientY - g.y) > TB_SLOT_MOVE_SLOP;
      const didLong = g.longPressFired;
      tbSlotGestureRef.current = null;

      if (didLong) {
        tbSuppressTbSlotClickRef.current = true;
        window.setTimeout(() => {
          if (!tbDidDragStartRef.current) setTbDragArmedHour((prev) => (prev === hourSlot ? null : prev));
        }, 90);
        return;
      }

      const shortTap =
        elapsed <= TB_SLOT_TAP_MAX_MS &&
        !moved &&
        !g.suppressTap &&
        !g.suppressLongPress &&
        TIMETABLE_HOME_ENABLED;
      if (shortTap) {
        tbSuppressTbSlotClickRef.current = true;
        openTbPicker(hourSlot);
      } else {
        window.setTimeout(() => {
          if (!tbDidDragStartRef.current) setTbDragArmedHour((prev) => (prev === hourSlot ? null : prev));
        }, 90);
      }
    },
    [openTbPicker]
  );

  const handleTimetableDragStart = useCallback((e, hour, todoId) => {
    try {
      const payload = { hour };
      if (todoId != null && todoId !== '') payload.todoId = String(todoId);
      const json = JSON.stringify(payload);
      /* Safari/Chromium 호환 + 드래그 세션 활성화: text/plain 필요한 경우 많음 */
      e.dataTransfer.setData('text/plain', json);
      e.dataTransfer.setData('application/x-nock-tb', json);
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      /* Safari */
    }
  }, []);

  const endTbTimetableDrag = useCallback(() => {
    tbDocDragCleanupRef.current?.();
    tbDocDragCleanupRef.current = null;
    tbDragPendingRef.current = null;
    if (tbDragRafRef.current != null) {
      window.cancelAnimationFrame(tbDragRafRef.current);
      tbDragRafRef.current = null;
    }
    setTbDragFloat(null);
    setTbDragClient(null);
    tbDidDragStartRef.current = false;
    setTbDragArmedHour(null);
  }, []);

  const readTimetableDragPayload = useCallback((dt) => {
    if (!dt) return null;
    const raw =
      dt.getData('application/x-nock-tb') ||
      dt.getData('text/plain') ||
      '';
    if (!raw || typeof raw !== 'string') return null;
    try {
      const j = JSON.parse(raw);
      if (!j || typeof j !== 'object') return null;
      let nh = j.hour;
      if (typeof nh === 'string' && /^-?\d+$/.test(nh)) nh = Number(nh);
      if (typeof nh !== 'number' || !Number.isFinite(nh)) return null;
      const out = { ...j, hour: nh };
      if (out.todoId != null && out.todoId !== '') out.todoId = String(out.todoId);
      return out;
    } catch {
      return null;
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
  const handleTimetableBandDragEnter = useCallback((e) => {
    e.preventDefault();
  }, []);
  const handleTbSegmentDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* */
    }
  }, []);
  const handleTbSegmentDrop = useCallback(
    (e, destHourRaw, insertBeforeNormNullable) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const payload = readTimetableDragPayload(e.dataTransfer);
        if (!payload || typeof payload.hour !== 'number') return;
        const rawTodo = payload.todoId != null ? String(payload.todoId).trim() : '';
        if (rawTodo === '') return;
        const fromHour = Number(payload.hour);
        const destHour = Number(destHourRaw);
        if (!Number.isFinite(fromHour) || !Number.isFinite(destHour)) return;
        const movingNorm = normalizeTodoId(rawTodo);
        const beforeNorm =
          insertBeforeNormNullable != null && String(insertBeforeNormNullable).trim() !== ''
            ? normalizeTodoId(insertBeforeNormNullable)
            : null;
        if (beforeNorm !== null && beforeNorm === movingNorm) return;

        const crossesHour = fromHour !== destHour;
        if (crossesHour) {
          let prevSnap = null;
          let nextSnap = null;
          updateTodos((prev) => {
            prevSnap = prev;
            nextSnap = prev.map((t) => {
              if (normalizeTodoId(t.id) !== movingNorm) return t;
              let hrs = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])];
              hrs = hrs.filter((x) => x !== fromHour && x !== destHour);
              hrs = [...hrs, destHour].sort((a, b) => a - b);
              return { ...t, timeBlockingHours: hrs };
            });
            rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
            return nextSnap;
          });
          void flushTbNotionPatches(prevSnap, nextSnap);
        }

        mutateTbSlotOrder((prev) => {
          if (crossesHour) {
            const removed = tbOrderRemoveFromHour(prev, fromHour, movingNorm);
            return tbOrderReorderInsertBefore(removed, destHour, movingNorm, beforeNorm);
          }
          return tbOrderReorderInsertBefore(prev, destHour, movingNorm, beforeNorm);
        });
        hapticLight();
      } finally {
        endTbTimetableDrag();
      }
    },
    [flushTbNotionPatches, readTimetableDragPayload, endTbTimetableDrag, mutateTbSlotOrder]
  );

  const handleTimetableDrop = useCallback(
    (e, destHourRaw) => {
      e.preventDefault();
      try {
        const payload = readTimetableDragPayload(e.dataTransfer);
        if (!payload || typeof payload.hour !== 'number') return;
        const fromHour = Number(payload.hour);
        const destHour = Number(destHourRaw);
        if (!Number.isFinite(fromHour) || !Number.isFinite(destHour)) return;
        if (fromHour === destHour) return;

        if (payload.todoId != null && String(payload.todoId).trim() !== '') {
          let prevSnap = null;
          let nextSnap = null;
          const rawId = String(payload.todoId);
          const movingNorm = normalizeTodoId(rawId);
          updateTodos((prev) => {
            prevSnap = prev;
            nextSnap = prev.map((t) => {
              if (normalizeTodoId(t.id) !== movingNorm) return t;
              let hrs = [...(Array.isArray(t.timeBlockingHours) ? t.timeBlockingHours : [])];
              hrs = hrs.filter((x) => x !== fromHour && x !== destHour);
              hrs = [...hrs, destHour].sort((a, b) => a - b);
              return { ...t, timeBlockingHours: hrs };
            });
            rebuildLocalTbMapFromTodos(nextSnap, viewDateRef.current);
            return nextSnap;
          });
          mutateTbSlotOrder((prev) => tbOrderAfterSingleMove(prev, fromHour, destHour, movingNorm));
          void flushTbNotionPatches(prevSnap, nextSnap);
          return;
        }
        moveHourBlockDnD(fromHour, destHour);
      } finally {
        endTbTimetableDrag();
      }
    },
    [moveHourBlockDnD, flushTbNotionPatches, readTimetableDragPayload, endTbTimetableDrag, mutateTbSlotOrder]
  );

  const handleTimetableFetchFromNotion = () => {
    if (!TIMETABLE_HOME_ENABLED || timetableStorageMode !== 'notion' || !usesNotionTodoApi(creds)) return;
    hapticLight();
    setPulling(true);
    loadTodos().catch(() => {});
  };

  const handleTimetablePushToNotion = () => {
    if (!TIMETABLE_HOME_ENABLED) return;
    if (tbPushSaving) return;
    if (timetableStorageMode !== 'notion' || !usesNotionTodoApi(creds) || !hasTimeBlockingField) return;
    hapticLight();
    if (!notionTimetableReady) {
      setPopupError(ko ? '노션에 타임블록 필드를 먼저 연결해 주세요.' : 'Connect the Notion time block field first.');
      return;
    }
    const bag = tbNotionDirtyNormIdsRef.current;
    if (!bag || bag.size === 0) {
      hapticLight();
      return;
    }
    const ids = [...bag];
    const listNow = todosRef.current;
    const rows = ids
      .map((nid) => listNow.find((t) => normalizeTodoId(t.id) === nid))
      .filter(Boolean);
    if (rows.length === 0) {
      bag.clear();
      return;
    }
    setTbPushSaving(true);
    (async () => {
      try {
        await Promise.all(
          rows.map((trow) =>
            apiFetch(
              `/api/todos/${trow.id}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ timeBlockingHours: trow.timeBlockingHours || [] }),
              },
              creds,
              settings
            )
          )
        );
        ids.forEach((nid) => bag.delete(nid));
        hapticSuccess();
      } catch (e) {
        setPopupError((ko ? '노션 저장 실패: ' : 'Could not sync to Notion: ') + (e?.message || ''));
        loadTodos({ background: true }).catch(() => {});
      } finally {
        setTbPushSaving(false);
      }
    })();
  };

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
        return String(id);
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
      return String(id);
    }

    if (!usesNotionTodoApi(creds)) {
      const newDemoId = allocateLocalTodoId();
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
      if (tbHour != null) void appendTodoToHourOnly(tbHour, newDemoId);
      return String(newDemoId);
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
      if (tbHourPending != null && newId) await appendTodoToHourOnly(tbHourPending, newId);
      return newId ? String(newId) : String(tempId);
    } catch (e) {
      timetablePendingHourRef.current = null;
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message);
      return null;
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

  const renderTodayStack = () => {
    let delayBase = 0;
    return (
      <>
        {homeTodoSections.map((sec) => {
          const secTodos = sec.todos;
          const n = secTodos.length;
          const startDelay = delayBase;
          delayBase += n;
          return (
            <div key={sec.key} className="home-todo-section">
              <div className="home-todo-section-label">{sec.label}</div>
              <div className="home-todo-grouped-list app-grouped-list">
                {secTodos.map((todo, i) => {
                  const sel = normalizeTodoId(selectedId) === normalizeTodoId(todo.id);
                  const run =
                    onTodayView && timer.isRunning && normalizeTodoId(timer.activeId) === normalizeTodoId(todo.id);
                  const pau =
                    onTodayView &&
                    !timer.isRunning &&
                    normalizeTodoId(paused?.todoId) === normalizeTodoId(todo.id);
                  const la =
                    onTodayView && normalizeTodoId(timer.activeId) === normalizeTodoId(todo.id) ? liveAccum : null;
                  const ld = run
                    ? timer.formatElapsedTotal()
                    : pau
                      ? formatTotalSecClock(
                          paused?.savedSec ?? Math.max(0, Math.floor((paused?.savedAccum ?? todo.accum ?? 0) * 60))
                        )
                      : null;

                  const showActions = sel;
                  const borderUnderRow = i < n - 1 || showActions;
                  const borderUnderExpanded = showActions && i < n - 1;

                  return (
                    <Fragment key={todo.clientKey || todo.id}>
                      <div
                        className="home-todo-grouped-item"
                        style={{
                          borderBottom: borderUnderRow ? '0.5px solid var(--color-separator)' : 'none',
                        }}
                      >
                        <SwipeCard
                          todo={todo}
                          ko={ko}
                          fmt={fmt}
                          t={t}
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
                          delay={(startDelay + i) * 30}
                        />
                      </div>
                      {showActions && (
                        <div
                          className="home-todo-expanded-actions slide-in"
                          style={{
                            borderBottom: borderUnderExpanded ? '0.5px solid var(--color-separator)' : 'none',
                          }}
                        >
                          {run ? (
                            <>
                              <button
                                className="btn btn-muted btn-md flex-1"
                                onClick={handlePause}
                                disabled={saving || !onTodayView}
                                style={{ borderRadius: 'var(--radius-pill)' }}
                              >
                                <Pause size={16} strokeWidth={2.1} /> {ko ? '일시정지' : 'Pause'}
                              </button>
                              <button
                                className="btn btn-complete-blue btn-md flex-1"
                                onClick={() => handleComplete()}
                                disabled={saving}
                                style={{ borderRadius: 'var(--radius-pill)' }}
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
                                style={{ borderRadius: 'var(--radius-pill)' }}
                              >
                                <Play size={16} strokeWidth={2.1} /> {ko ? '재개' : 'Resume'}
                              </button>
                              <button
                                className="btn btn-complete-blue btn-md flex-1"
                                onClick={() => handleComplete()}
                                disabled={saving}
                                style={{ borderRadius: 'var(--radius-pill)' }}
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
                                style={{ borderRadius: 'var(--radius-pill)' }}
                              >
                                <Play size={16} strokeWidth={2.1} /> {t.start}
                              </button>
                              {!todo.done && (
                                <button
                                  className="btn btn-complete-blue btn-md flex-1"
                                  onClick={() => handleComplete()}
                                  disabled={saving}
                                  style={{ borderRadius: 'var(--radius-pill)' }}
                                >
                                  {saving ? <span className="spin" /> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div
      className={homeSurface === 'timer' ? 'home-top-float-host home-tab--timer-top-float' : undefined}
      style={{
        minHeight: '100%',
        paddingBottom: 24,
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <NotionLoadingOverlay open={overlayReady && usesNotionTodoApi(creds) && loading && todos.length === 0} message={t.notionLoadingMessage} />
      {homeSurface === 'timer' && (
        <nav className="home-top-float-bar" aria-label={ko ? '날짜·할 일 목록 도구' : 'Date and task list tools'}>
          <div className="home-top-float-bar-edge home-top-float-bar-edge--start">
            <div className="home-date-nav-btn home-date-nav-btn--glass home-top-float-chev-cluster">
              <button
                type="button"
                className="home-top-float-chev-part"
                aria-label={t.homeTopFloatPrevDay}
                onClick={() => {
                  hapticLight();
                  trySetViewDate(addCalendarDays(viewDate, -1));
                }}
              >
                <ChevronLeft className="home-date-nav-icon" size={22} strokeWidth={2.35} aria-hidden />
              </button>
              <button
                type="button"
                className="home-top-float-chev-part"
                aria-label={t.homeTopFloatNextDay}
                onClick={() => {
                  hapticLight();
                  trySetViewDate(addCalendarDays(viewDate, 1));
                }}
              >
                <ChevronRight className="home-date-nav-icon" size={22} strokeWidth={2.35} aria-hidden />
              </button>
            </div>
          </div>
          <div className="home-top-float-bar-center">
            <label className="home-top-float-date-plain">
              <input
                type="date"
                value={viewDate}
                onChange={(ev) => {
                  const next = ev.target.value;
                  if (next) trySetViewDate(next);
                }}
                aria-label={t.homeTopFloatPickDate}
              />
              <span className="home-top-float-date-plain-text" title={formatCalendarDateLine(viewDate, locale)}>
                {formatCalendarDateLine(viewDate, locale)}
              </span>
            </label>
          </div>
          <div className="home-top-float-bar-edge home-top-float-bar-edge--end">
            <div className="home-date-nav-btn home-date-nav-btn--glass home-date-nav-btn--icon-only home-top-float-more-native-wrap">
              <MoreHorizontal className="home-date-nav-icon home-top-float-more-native-icon" size={22} strokeWidth={2.35} aria-hidden />
              <select
                className="home-top-float-more-native-select"
                aria-label={t.homeTopFloatMore}
                defaultValue=""
                onChange={onHomeToolbarSelect}
              >
                <option value="" disabled hidden>
                  {t.homeTopFloatMore}
                </option>
                <option value="goal">
                  {ko
                    ? `${t.homeActionViewGoalCategories}${goalGroupingEnabled ? ' · 켜짐' : ' · 꺼짐'}`
                    : `${t.homeActionViewGoalCategories}${goalGroupingEnabled ? ' · On' : ' · Off'}`}
                </option>
                <option value="hide">
                  {ko
                    ? `${t.homeActionHideCompleted}${hideCompletedTodos ? ' · 켜짐' : ' · 꺼짐'}`
                    : `${t.homeActionHideCompleted}${hideCompletedTodos ? ' · On' : ' · Off'}`}
                </option>
                <option value="manage">{t.homeActionGoalManage}</option>
              </select>
            </div>
          </div>
        </nav>
      )}
      {typeof document !== 'undefined' &&
        tbDragFloat &&
        tbDragClient &&
        createPortal(
          <div
            className="tb-drag-float-chip"
            style={{
              position: 'fixed',
              left: tbDragClient.x - tbDragFloat.ox,
              top: tbDragClient.y - tbDragFloat.oy,
              width: tbDragFloat.w,
              height: tbDragFloat.h,
              zIndex: 975,
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
            aria-hidden
          >
            <span className="tb-block-chip tb-slot-float-chip-inner">
              <span className="tb-slot-chip-label">{tbDragFloat.label}</span>
            </span>
          </div>,
          document.body
        )}
      {pulling && (
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
          <div className="spin spin-dark" />
        </div>
      )}

      {homeSurface === 'timer' && (
        <div className="home-timer-summary-wrap">
          <div className="home-timer-summary-surface">
            <div
              style={{
                fontSize: 'var(--font-size-display-num)',
                fontWeight: 'var(--font-weight-bold)',
                letterSpacing: '-2px',
                color: 'var(--color-text-primary)',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                marginBottom: 8,
              }}
            >
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
                  borderRadius: 'var(--radius-control-sm)',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ color: 'var(--color-action-orange)', fontSize: 'var(--font-size-footnote)', animation: 'pulse 2s ease-in-out infinite' }} aria-hidden>
                  ●
                </span>
                <span
                  style={{
                    fontSize: 'var(--font-size-caption)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 'var(--font-weight-medium)',
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
                  borderRadius: 'var(--radius-control-sm)',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 'var(--font-size-caption)', color: 'var(--color-action-orange)', fontWeight: 'var(--font-weight-semibold)' }}>
                  <Pause size={12} strokeWidth={2.1} />
                  <span>{ko ? '일시정지' : 'Paused'}</span>
                </div>
              </button>
            )}
            {todos.length > 0 && (
              <>
                <div className="ui-caption-standard" style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span>{ko ? `${todos.length}개 중 ${doneCount}개 완료 · ${pct}%` : `${doneCount} of ${todos.length} done · ${pct}%`}</span>
                  <button
                    type="button"
                    aria-label={ko ? '하루 리뷰 입력' : 'Write daily review'}
                    onClick={openFeedbackSheet}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--ui-caption-standard-color)',
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
      <div className="home-todo-page-block">
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
                      className="home-date-nav-btn home-date-nav-btn--glass home-date-nav-btn--flat home-date-nav-btn--icon-only"
                      aria-label={t.timetableSyncFromNotionAria}
                      disabled={pulling || tbPushSaving}
                      onClick={handleTimetableFetchFromNotion}
                    >
                      {pulling ? (
                        <span className="spin spin-dark home-date-nav-icon-spin" aria-hidden />
                      ) : (
                        <Download className="home-date-nav-icon" size={24} strokeWidth={2.5} aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      className="home-date-nav-btn home-date-nav-btn--glass home-date-nav-btn--flat home-date-nav-btn--icon-only"
                      aria-label={t.timetableSyncToNotionAria}
                      disabled={tbPushSaving || pulling}
                      onClick={handleTimetablePushToNotion}
                    >
                      {tbPushSaving ? (
                        <span className="spin spin-dark home-date-nav-icon-spin" aria-hidden />
                      ) : (
                        <Upload className="home-date-nav-icon" size={24} strokeWidth={2.5} aria-hidden />
                      )}
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
              <div
                ref={timetableTrackInnerRef}
                className="home-timetable-track"
                style={{ minHeight: timetableTrackMinHeightPx }}
              >
                {timetableNowLineTopPx != null && (
                  <div
                    ref={timetableNowMarkerRef}
                    className="home-timetable-now-scroll-anchor"
                    style={{ top: timetableNowLineTopPx }}
                    aria-hidden
                  />
                )}
                {visibleHours.map((hh) => {
                  const bandTop = tbHourBandLayout.tops[hh];
                  const bandH = tbHourBandLayout.heights[hh];
                  const inset = TB_SPINE_SEGMENT_EDGE_INSET_PX;
                  const segH = Math.max(1, bandH - 2 * inset);
                  let hasAny = false;
                  for (const ti of sortedTodosDay) {
                    if (Array.isArray(ti.timeBlockingHours) && ti.timeBlockingHours.includes(hh)) {
                      hasAny = true;
                      break;
                    }
                  }
                  return (
                    <div
                      key={`tb-spine-${hh}`}
                      className={`home-timetable-spine-segment${hasAny ? ' home-timetable-spine-segment--has-todos' : ''}`}
                      style={{ top: bandTop + inset, height: segH }}
                      aria-hidden
                    />
                  );
                })}
                {visibleHours.map((h) => {
                  const hourFace = formatHourTimetableAxis(h, timeDisplay === '24');
                  const slotTodos = sortedTodosDay.filter(
                    (ti) => Array.isArray(ti.timeBlockingHours) && ti.timeBlockingHours.includes(h)
                  );
                  const slotTodosSorted = sortTodosForTbHourSlot(
                    slotTodos,
                    String(h),
                    tbSlotOrder,
                    sortedTodosDay
                  );
                  const hasTodos = slotTodosSorted.length > 0;
                  const ariaSlot = ko ? `${h}시 타임블록` : `Block ${h}:00`;
                  const tickY = timeToYCoord(h * 60);
                  const bandTop = tbHourBandLayout.tops[h];
                  const bandH = tbHourBandLayout.heights[h];
                  return (
                    <Fragment key={h}>
                      <div
                        className={`home-timetable-tick-label${viewDate === todayStr() && timetableNowClockHour === h ? ' home-timetable-tick-label--current' : ''}`}
                        style={{ top: tickY }}
                      >
                        {hourFace}
                      </div>
                      <div className="home-timetable-tick-rail" style={{ top: tickY }} aria-hidden>
                        <span
                          className={`home-timetable-rail-dot${viewDate === todayStr() && timetableNowClockHour === h ? ' home-timetable-rail-dot--current' : ''}`}
                        />
                      </div>
                      <div
                        className="home-timetable-hour-band"
                        data-tb-hour={h}
                        style={{ top: bandTop, height: bandH }}
                        onDragEnter={handleTimetableBandDragEnter}
                        onDragOver={handleTimetableDragOver}
                        onDrop={(e) => handleTimetableDrop(e, h)}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={false}
                          aria-label={ariaSlot}
                          className={`tb-block-surface tb-block-surface--band${hasTodos ? ' tb-block-surface--has-todos' : ''}${tbDragArmedHour === h ? ' tb-block-surface--drag-armed' : ''}`}
                          data-tb-slot-hour={h}
                          ref={(el) => {
                            if (el) tbHourSlotSurfaceRef.current[h] = el;
                            else delete tbHourSlotSurfaceRef.current[h];
                          }}
                          onPointerDown={(ev) => {
                            if (ev.pointerType === 'mouse' && ev.button !== 0) return;
                            try {
                              ev.currentTarget.setPointerCapture(ev.pointerId);
                            } catch {
                              /* noop */
                            }
                            startTbSlotLongPress(h, hasTodos, ev.clientX, ev.clientY);
                          }}
                          onPointerMove={(ev) => {
                            relayTbHourBandPointerMove(ev, h);
                          }}
                          onPointerUp={(ev) => {
                            finalizeTbHourBandPointerUp(ev, h, ev.currentTarget);
                          }}
                          onPointerCancel={(ev) => {
                            try {
                              if (ev.currentTarget.hasPointerCapture?.(ev.pointerId)) {
                                ev.currentTarget.releasePointerCapture(ev.pointerId);
                              }
                            } catch {
                              /* noop */
                            }
                            clearTbLongPressTimer();
                            if (tbSlotGestureRef.current?.hour === h) tbSlotGestureRef.current = null;
                          }}
                          onClick={(ev) => {
                            if (!TIMETABLE_HOME_ENABLED) return;
                            if (tbSuppressTbSlotClickRef.current) {
                              ev.preventDefault();
                              ev.stopPropagation();
                              tbSuppressTbSlotClickRef.current = false;
                            }
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              openTbPicker(h);
                            }
                          }}
                        >
                          {slotTodosSorted.length === 0 ? null : (
                            <div className="tb-slot-segments-wrap">
                              <div key={`tb-seg-${h}`} className="tb-slot-segments-row">
                                {slotTodosSorted.map((ti) => {
                                  const draggingKeyNorm = normalizeTodoId(ti.id);
                                  const nm = ti.name || (ko ? '(제목 없음)' : '(Untitled)');
                                  const ariaSeg = ko ? `${hourFace}, ${nm}` : `${hourFace}: ${nm}`;
                                  const todoIdOk = ti.id != null && String(ti.id).trim() !== '';
                                  const isDimSource =
                                    tbDragFloat != null &&
                                    draggingKeyNorm === tbDragFloat.draggingKeyNorm;
                                  const dragReady = !!(todoIdOk && hasTodos && tbDragArmedHour === h);
                                  return (
                                    <div
                                      key={String(ti.id ?? nm)}
                                      role="presentation"
                                      className={`tb-slot-segment${isDimSource ? ' tb-slot-segment--drag-source-dimmed' : ''}${dragReady ? ' tb-slot-segment--drag-ready' : ''}`}
                                      draggable={dragReady}
                                      onDragEnter={handleTimetableBandDragEnter}
                                      onDragOver={handleTbSegmentDragOver}
                                      onDrop={(ev) => handleTbSegmentDrop(ev, h, draggingKeyNorm)}
                                      onClick={(ev) => {
                                        /* Android 등: 스크롤·포인터 캔슬 때 pointer 순탭 실패 보완 → click으로 피커 */
                                        if (!TIMETABLE_HOME_ENABLED || !todoIdOk) return;
                                        if (tbDragArmedHour === h) return;
                                        if (tbSuppressTbSlotClickRef.current) {
                                          tbSuppressTbSlotClickRef.current = false;
                                          ev.stopPropagation();
                                          return;
                                        }
                                        ev.stopPropagation();
                                        openTbPicker(h);
                                      }}
                                      onDragStart={(ev) => {
                                        ev.stopPropagation();
                                        if (!(todoIdOk && hasTodos && tbDragArmedHour === h)) {
                                          ev.preventDefault();
                                          return;
                                        }
                                        tbDidDragStartRef.current = true;
                                        handleTimetableDragStart(ev, h, ti.id);
                                        try {
                                          const im = getTbEmptyDragImg();
                                          if (im) ev.dataTransfer.setDragImage(im, 0, 0);
                                        } catch {
                                          /* noop */
                                        }
                                        const el = ev.currentTarget;
                                        const rect = el.getBoundingClientRect();
                                        setTbDragFloat({
                                          draggingKeyNorm,
                                          ox: ev.clientX - rect.left,
                                          oy: ev.clientY - rect.top,
                                          w: rect.width,
                                          h: rect.height,
                                          label: nm,
                                        });
                                        setTbDragClient({ x: ev.clientX, y: ev.clientY });

                                        tbDocDragCleanupRef.current?.();
                                        const onDocDrag = (e) => {
                                          if (e.clientX === 0 && e.clientY === 0) return;
                                          bumpTbDragClient(e.clientX, e.clientY);
                                        };
                                        document.addEventListener('drag', onDocDrag);
                                        tbDocDragCleanupRef.current = () =>
                                          document.removeEventListener('drag', onDocDrag);
                                      }}
                                      onDragEnd={(ev) => {
                                        ev.stopPropagation();
                                        endTbTimetableDrag();
                                      }}
                                    >
                                      <div className="tb-slot-segment-fg">
                                        <span
                                          className="tb-block-chip tb-block-chip--tb-slot"
                                          aria-label={ariaSeg}
                                        >
                                          <span
                                            className={`tb-slot-chip-label${ti.done ? ' tb-slot-chip-label--done' : ''}`}
                                          >
                                            {nm}
                                          </span>
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div
                                className="tb-slot-tail-drop"
                                onDragEnter={handleTimetableBandDragEnter}
                                onDragOver={handleTbSegmentDragOver}
                                onDrop={(ev) => handleTbSegmentDrop(ev, h, null)}
                                aria-hidden
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {(() => {
          if (loading && usesNotionTodoApi(creds)) {
            return <div style={{ minHeight: 200 }} aria-hidden />;
          }
          if (!loading && todoFetchIssue?.blocking) {
            return (
              <div style={{ textAlign:'center', padding:'48px 24px' }}>
                <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><TriangleAlert size={36} strokeWidth={2.1} color="var(--color-action-red)" /></div>
                <div style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-action-red)', marginBottom: 8 }}>{todoFetchIssue.title}</div>
                <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-tertiary)', marginBottom: 16, wordBreak: 'break-word', lineHeight: 1.6 }}>{todoFetchIssue.detail}</div>
                {todoFetchIssue.showStatusLink ? (
                  <div style={{ marginBottom: 20 }}>
                    <a
                      href={NOTION_STATUS_PAGE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-action-blue)', fontWeight: 'var(--font-weight-medium)' }}
                    >
                      {t.notionStatusPageLink}
                    </a>
                  </div>
                ) : null}
                <button type="button" className="btn btn-dark btn-sm" onClick={() => loadTodos()}>{t.retry}</button>
              </div>
            );
          }
          if (!loading && sortedTodosDay.length === 0 && homeSurface !== 'timetable') {
            return (
              <div style={{ textAlign:'center', padding:'48px 24px' }}>
                <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><ClipboardList size={48} strokeWidth={2.0} color="var(--color-text-tertiary)" /></div>
                <div style={{ color:'var(--color-text-tertiary)', fontWeight: 'var(--font-weight-semibold)', marginBottom:20 }}>{t.noTodos}</div>
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
            );
          }
          if (
            !loading &&
            homeSurface !== 'timetable' &&
            sortedTodosDay.length > 0 &&
            homeListTodosOrdered.length === 0
          ) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                  <ClipboardList size={48} strokeWidth={2.0} color="var(--color-text-tertiary)" />
                </div>
                <div
                  style={{
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 'var(--font-weight-semibold)',
                    marginBottom: 16,
                    lineHeight: 1.45,
                  }}
                >
                  {t.homeListOnlyCompletedHidden}
                </div>
              </div>
            );
          }
          if (!loading && homeSurface === 'timetable') {
            return null;
          }
          if (!loading) {
            return (
              <>
                {todoFetchIssue && !todoFetchIssue.blocking ? (
                  <div
                    role="alert"
                    style={{
                      margin: '0 16px 12px',
                      padding: '16px var(--spacing-card)',
                      borderRadius: 'var(--radius-group-card)',
                      background: 'color-mix(in srgb, var(--color-action-orange) 14%, transparent)',
                      border: '0.5px solid color-mix(in srgb, var(--color-action-orange) 38%, transparent)',
                    }}
                  >
                    <div style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 8 }}>
                      {todoFetchIssue.title}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', lineHeight: 1.45, marginBottom: 10 }}>
                      {todoFetchIssue.detail}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-tertiary)', lineHeight: 1.45, marginBottom: 12 }}>
                      {t.notionTodoFetchStaleHint}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                      <button type="button" className="btn btn-dark btn-sm" onClick={() => loadTodos()}>{t.retry}</button>
                      {todoFetchIssue.showStatusLink ? (
                        <a
                          href={NOTION_STATUS_PAGE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--color-action-blue)', fontWeight: 'var(--font-weight-medium)' }}
                        >
                          {t.notionStatusPageLink}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {renderTodayStack()}
              </>
            );
          }
          return null;
        })()}
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

      {TIMETABLE_HOME_ENABLED ? (
        <TimetableTaskPickPopover
          open={timetableTaskPickerHour != null}
          getAnchorRect={getTbPickerAnchorRect}
          onClose={closeTbPicker}
          pickerAriaLabel={t.timetableChooseTask}
          dismissAriaLabel={t.cancel}
          todos={timetableTaskPickerTodos}
          onAssignTodoId={(id) => {
            appendTodoToHourOnly(timetableTaskPickerHour, id);
          }}
          onUnassignTodoId={(id) => {
            removeTodoFromHourOnly(timetableTaskPickerHour, id);
          }}
          emptyHint={
            timetableTaskPickerHour != null && timetableTaskPickerTodos.length === 0
              ? t.timetablePickerNoAddable
              : undefined
          }
        />
      ) : null}
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
              <div className="timer-save-nav timer-save-nav--toolbar-flush">
                <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={handleTimerSaveDismiss} aria-label={t.cancel}>
                  <X strokeWidth={2.75} strokeLinecap="round" aria-hidden />
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
                  <Check strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden />
                </button>
              </div>
              <div className="popup-body" style={{ padding: '12px 14px 22px', margin: 0, color: 'var(--color-text-primary)' }}>
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
          hasPremium={hasPremium}
          onPremiumGate={onPremiumGate}
          onClose={() => {
            setSheet(null);
            setEditingTodo(null);
            timetablePendingHourRef.current = null;
          }}
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

      {homeGoalCategoriesHintOpen && (
        <PopupDialog
          title={ko ? '안내' : 'Notice'}
          message={t.homeActionGoalCategoriesNeedNotion}
          confirmText={t.btnOk}
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
          onCancel={() => setHomeGoalCategoriesHintOpen(false)}
          onConfirm={() => setHomeGoalCategoriesHintOpen(false)}
          singleAction
        />
      )}

      {homeGoalManageSoonOpen && (
        <PopupDialog
          title={t.comingSoonPopupTitle}
          message={t.comingSoonPopupBody}
          confirmText={t.btnOk}
          actionVariant="text"
          titleSize={18}
          titleWeight={600}
          onCancel={() => setHomeGoalManageSoonOpen(false)}
          onConfirm={() => setHomeGoalManageSoonOpen(false)}
          singleAction
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
      style={{ position: 'relative', borderRadius: 0, overflow: 'hidden', animationDelay: `${delay}ms` }}
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
        borderRadius: 'var(--radius-pill)',
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
        <RotateCcw size={22} strokeWidth={2.2} color="var(--color-bg-surface)" />
      </button>

      {/* Right: edit (green) + delete (red) — only via swipe */}
      <div style={{
        position:'absolute', right:0, top:0, bottom:0,
        width: rightReveal,
        display:'flex', flexDirection:'row',
        overflow:'visible',
        borderRadius: 0,
        transition: drag ? 'none' : `width ${SWIPE_SPRING}`,
      }}>
        <button
          type="button"
          aria-label={ko ? '편집' : 'Edit'}
          style={{
            width: editWidth,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--color-action-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderTopLeftRadius: editWidth > 0 ? 'var(--radius-pill)' : 0,
            borderBottomLeftRadius: editWidth > 0 ? 'var(--radius-pill)' : 0,
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
          <Pencil size={20} strokeWidth={2.2} color="var(--color-bg-surface)" />
        </button>
        <button
          type="button"
          aria-label={ko ? '삭제' : 'Delete'}
          style={{
            width: deleteWidth,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--color-action-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderTopRightRadius: deleteWidth > 0 ? 'var(--radius-pill)' : 0,
            borderBottomRightRadius: deleteWidth > 0 ? 'var(--radius-pill)' : 0,
          }}
          onTouchStart={() => hapticLight()}
          onClick={(e) => {
            e.stopPropagation();
            hapticMedium();
            setSx(0);
            setTimeout(() => onDelete?.(), 0);
          }}
        >
          <Trash2 size={22} strokeWidth={2.2} color="var(--color-bg-surface)" />
        </button>
      </div>

      {/* Row (grouped list — no per-row card chrome) */}
      <div
        className={`home-todo-row${selected ? ' home-todo-row--selected' : ''}`}
        tabIndex={0}
        style={{
          touchAction: 'pan-y',
          userSelect: 'none',
          cursor: 'pointer',
          transform: `translate3d(${sx}px, 0, 0)`,
          willChange: 'transform',
          transition: drag ? 'none' : `transform ${SWIPE_SPRING}`,
          position: 'relative',
          zIndex: 1,
          padding: '0 var(--spacing-card)',
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
        <div className="home-todo-row-inner">
          <div className={`chk ${todo.done ? 'done' : ''}`} onClick={e => { e.stopPropagation(); onToggleDone(); }}>
            {todo.done && <Check size={11} strokeWidth={2.3} color="var(--color-bg-surface)" />}
          </div>
          <div className="home-todo-row-title">
            <span
              className={`home-todo-row-title-text truncate${todo.done ? ' home-todo-row-title-text--done' : ''}`}
            >
              {todo.name}
            </span>
          </div>
          <div className="home-todo-row-trail">
            {showTimeTag && (
            <span className="home-todo-time-cluster">
              {hasLive ? (
                <>
                  {isPaused && (
                    <Pause size={12} strokeWidth={2.2} color="var(--color-action-orange)" style={{ flexShrink: 0 }} />
                  )}
                  {isRunning && !isPaused && (
                    <span className="home-todo-live-dot" aria-hidden>●</span>
                  )}
                  <span
                    className="home-todo-time-digits"
                  >
                    {liveDisplay || fmtHhMm(displayAccum)}
                  </span>
                </>
              ) : (
                <span
                  className="home-todo-time-digits"
                >
                  {fmt(todo.accum || 0)}
                </span>
              )}
            </span>
            )}
            <span
              className="settings-chevron settings-select-trail-chevron"
              style={{
                transform: selected ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
              aria-hidden
            >
              ›
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
