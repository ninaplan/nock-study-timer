'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Loader2,
  CheckCircle2,
  Circle,
  Target,
} from 'lucide-react';
import { apiFetch, resolveApiUrl } from './lib/apiClient';
import { isLocalMode, usesNotionTodoApi } from '@/app/lib/credsMode';
import { loadLocalTodosInRange } from '@/app/lib/localTodosStore';
import { localDateKey } from '@/app/lib/dateUtils';
import { normalizeAccumMin, todoHasGoalLink } from '@/app/lib/todoAccum';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import { hapticLight } from './lib/haptics';
import { getLocale } from '@/app/lib/i18n';
import { PREMIUM_GATES_ENABLED } from '@/app/lib/featureFlags';
import { getUserKey } from '@/app/lib/getUserKey';
const FILTERS = ['daily','weekly','monthly','yearly'];
const STATS_PRESETS = ['thisWeek', 'thisMonth', 'thisYear'];
const WEEK_DAYS = 7;
const WINDOW_SIZE = 7;
/** Solid blue bars; selected = darker blue */
const BAR_UNSELECTED = 'var(--notion)';
const BAR_SELECTED = 'var(--notion-press)';

function dayCountInclusive(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return 1;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function toDateKey(d) {
  return localDateKey(d instanceof Date ? d : new Date(d));
}

function startOfWeek(date, weekStart) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 Sun ... 6 Sat
  const weekStartDow = weekStart === 'sunday' ? 0 : 1;
  const diff = (dow - weekStartDow + WEEK_DAYS) % WEEK_DAYS;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getRange(f, pages, weekStart) {
  const now = new Date();
  const thisWeekStart = startOfWeek(now, weekStart);

  if (f === 'daily') {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - (pages * WINDOW_SIZE - 1));
    return { start: toDateKey(start), end: toDateKey(end), by: 'day' };
  }

  if (f === 'weekly') {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - (pages * WINDOW_SIZE - 1) * WEEK_DAYS);
    const end = new Date(thisWeekStart);
    end.setDate(end.getDate() + WEEK_DAYS - 1);
    return { start: toDateKey(start), end: toDateKey(end), by: 'week' };
  }

  if (f === 'monthly') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const start = new Date(now.getFullYear(), now.getMonth() - (pages * WINDOW_SIZE - 1), 1);
    return { start: toDateKey(start), end: toDateKey(end), by: 'month' };
  }

  const end = new Date(now.getFullYear(), 11, 31);
  const start = new Date(now.getFullYear() - (pages * WINDOW_SIZE - 1), 0, 1);
  return { start: toDateKey(start), end: toDateKey(end), by: 'year' };
}

function getStatsRange(period, weekStart) {
  const now = new Date();
  if (period === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toDateKey(start), end: toDateKey(end) };
  }
  if (period === 'thisYear') {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { start: toDateKey(start), end: toDateKey(end) };
  }
  // thisWeek: raw Mon–Sun (or Sun–Sat) can straddle two months. Stats "이번 주" is intersected
  // with the current calendar month so the sum never exceeds "이번 달" (e.g. Mar 30–Apr 5 vs April-only).
  const week0 = startOfWeek(now, weekStart);
  const week1 = new Date(week0);
  week1.setDate(week1.getDate() + 6);
  const month0 = new Date(now.getFullYear(), now.getMonth(), 1);
  const month1 = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const s = week0 > month0 ? week0 : month0;
  const e = week1 < month1 ? week1 : month1;
  return { start: toDateKey(s), end: toDateKey(e) };
}

/** 통계 카드용: 프리셋 또는 커스텀 YYYY-MM-DD 구간 */
function getStatsRangeForState(period, weekStart, customStart, customEnd) {
  if (period === 'custom') {
    if (customStart && customEnd) {
      const a = customStart <= customEnd ? customStart : customEnd;
      const b = customStart <= customEnd ? customEnd : customStart;
      return { start: a, end: b };
    }
    return getStatsRange('thisWeek', weekStart);
  }
  return getStatsRange(period, weekStart);
}

function formatStatsChipLabel(period, customStart, customEnd, labels, ko) {
  if (period === 'custom' && customStart && customEnd) {
    const s = parseKeyDate(customStart);
    const e = parseKeyDate(customEnd);
    if (s.getFullYear() !== e.getFullYear()) {
      return ko
        ? `${s.getFullYear()}.${s.getMonth() + 1}.${s.getDate()} – ${e.getFullYear()}.${e.getMonth() + 1}.${e.getDate()}`
        : `${customStart.slice(0, 10)} → ${customEnd.slice(0, 10)}`;
    }
    return ko
      ? `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
      : `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (period && period !== 'custom') return labels[period];
  return labels.thisWeek;
}

function groupData(todos, by, weekStart) {
  const map={};
  todos.forEach(t => {
    if(!t.date) return;
    const d=new Date(t.date); let k;
    if(by==='day')   k=t.date;
    else if(by==='week') k = toDateKey(startOfWeek(d, weekStart));
    else if(by==='month') k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    else k=String(d.getFullYear());
    if(!map[k]) map[k]={k,min:0,todos:[]};
    map[k].min += (t.accum || 0); map[k].todos.push(t);
  });
  return Object.values(map).sort((a,b)=>a.k.localeCompare(b.k));
}

function buildRangeKeys(start, end, by, weekStart) {
  const out = [];
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;

  if (by === 'day') {
    const cur = new Date(s);
    while (cur <= e) {
      out.push(localDateKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  if (by === 'week') {
    const cur = startOfWeek(s, weekStart);
    while (cur <= e) {
      out.push(toDateKey(cur));
      cur.setDate(cur.getDate() + 7);
    }
    return out;
  }

  if (by === 'month') {
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    const endMonth = new Date(e.getFullYear(), e.getMonth(), 1);
    while (cur <= endMonth) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }

  for (let y = s.getFullYear(); y <= e.getFullYear(); y += 1) out.push(String(y));
  return out;
}

function parseKeyDate(k) {
  if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) {
    const [Y, M, D] = k.split('-').map(Number);
    return new Date(Y, M - 1, D);
  }
  return new Date(k);
}

function barLabel(k, by, lo, compact = false) {
  if (by === 'day' || by === 'week') {
    const d = parseKeyDate(k);
    if (lo === 'ko') {
      if (compact) return `${d.getMonth() + 1}/${d.getDate()}`;
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
    if (compact) return `${d.toLocaleDateString('en-US', { month: 'short' })}\n${d.getDate()}`;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (by === 'month') {
    const [y, m] = k.split('-');
    if (compact) return lo === 'ko' ? `${+m}월` : new Date(+y, +m - 1).toLocaleDateString('en', { month: 'short' });
    return lo === 'ko' ? `${y}년 ${+m}월` : new Date(+y, +m - 1).toLocaleDateString('en', { year: 'numeric', month: 'long' });
  }
  return k;
}

function formatVisibleRangeLabel(sliced, by, locale) {
  if (!sliced || sliced.length === 0) return '';
  const first = sliced[0];
  const last = sliced[sliced.length - 1];
  if (by === 'day' || by === 'week') {
    return `${barLabel(first.k, by, locale, true)} - ${barLabel(last.k, by, locale, true)}`;
  }
  return `${barLabel(first.k, by, locale, false)} - ${barLabel(last.k, by, locale, false)}`;
}
function fmtYAxisHours(min, locale) {
  const h = Math.max(0, Math.floor((Number(min) || 0) / 60));
  if (locale === 'ko') return `${h}시간`;
  return `${h}h`;
}
const fmtM = m => { if(!m) return '0m'; const h=Math.floor(m/60),r=m%60; if(h&&r)return`${h}h ${r}m`; if(h)return`${h}h`; return`${r}m`; };

export default function LogTab({
  t,
  creds,
  settings,
  onSheetOpenChange,
  onPremiumGate,
  inBottomSheet,
  subscription: subscriptionProp = null,
  onOpenHomeTimetable,
}) {
  const [subscription, setSubscription] = useState(null);
  const effectiveSubscription = subscriptionProp ?? subscription;
  const [viewMode, setViewMode] = useState('stats');
  const [filter,      setFilter]      = useState('daily');
  const [historyPages, setHistoryPages] = useState(1);
  const [todos,       setTodos]       = useState([]);
  const [statsTodos,  setStatsTodos]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statsLoading,setStatsLoading]= useState(true);
  const [selBar,      setSelBar]      = useState(null);
  const [statsPeriod, setStatsPeriod] = useState('thisWeek');
  const [statsCustomStart, setStatsCustomStart] = useState(null);
  const [statsCustomEnd, setStatsCustomEnd] = useState(null);
  const [premiumHint, setPremiumHint] = useState('');
  const premiumHintTimerRef = useRef(null);
  const triggerPremiumGate = useCallback(() => {
    if (onPremiumGate) { onPremiumGate(); return; }
    // fallback: 인라인 힌트
    setPremiumHint('Premium 기능이에요');
    clearTimeout(premiumHintTimerRef.current);
    premiumHintTimerRef.current = setTimeout(() => setPremiumHint(''), 3000);
  }, [onPremiumGate]);
  const locale = getLocale(settings?.lang);
  const ko     = locale==='ko';
  const weekStart = settings?.weekStart || 'monday';
  const fLabels = {daily:t.daily,weekly:t.weekly,monthly:t.monthly,yearly:t.yearly};
  const statPeriodLabels = {
    thisWeek: ko ? '이번주' : 'Week',
    thisMonth: ko ? '이번달' : 'Month',
    thisYear: ko ? '올해' : 'Year',
  };
  const rangeCacheRef = useRef(new Map());
  const inflightRef = useRef(new Map());

  useEffect(() => {
    const fetchSub = () => {
      const userKey = getUserKey(creds);
      const url = userKey
        ? resolveApiUrl(`/api/subscription?customerKey=${encodeURIComponent(userKey)}&_t=${Date.now()}`)
        : resolveApiUrl(`/api/subscription?_t=${Date.now()}`);
      fetch(url, { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setSubscription(j))
        .catch(() => setSubscription(null));
    };
    fetchSub();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchSub(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchSub);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchSub);
    };
  }, [creds?.authMode, creds?.workspaceId]);

  const hasPremium =
    !PREMIUM_GATES_ENABLED || (
      effectiveSubscription?.status === 'active' ||
      (effectiveSubscription?.status === 'trialing' && new Date(effectiveSubscription.trial_end_at) > new Date()) ||
      (effectiveSubscription?.status === 'cancelled' && effectiveSubscription.next_charge_at && new Date(effectiveSubscription.next_charge_at) > new Date())
    );

  const showPremiumHint = useCallback((msg) => {
    setPremiumHint(msg);
    clearTimeout(premiumHintTimerRef.current);
    premiumHintTimerRef.current = setTimeout(() => setPremiumHint(''), 3000);
  }, []);

  useEffect(() => {
    if (hasPremium) return;
    setFilter('daily');
    setHistoryPages(1);
    setStatsPeriod('thisWeek');
    setStatsCustomStart(null);
    setStatsCustomEnd(null);
  }, [hasPremium]);

  const effectiveFilter = hasPremium ? filter : 'daily';
  const effectiveHistoryPages = hasPremium ? historyPages : 1;

  const statsRange = useMemo(() => {
    if (!hasPremium) return getStatsRange('thisWeek', weekStart);
    return getStatsRangeForState(statsPeriod, weekStart, statsCustomStart, statsCustomEnd);
  }, [hasPremium, statsPeriod, weekStart, statsCustomStart, statsCustomEnd]);

  const getPresetRange = useCallback((p) => getStatsRange(p, weekStart), [weekStart]);

  const getRangeCacheKey = (start, end) => `${start}|${end}`;
  const hasRangeCache = useCallback((start, end) => {
    return rangeCacheRef.current.has(getRangeCacheKey(start, end));
  }, []);
  const fetchRangeTodos = useCallback(async (start, end, options = {}) => {
    const { force = false, fresh = false } = options;
    const key = getRangeCacheKey(start, end);
    if (!force && rangeCacheRef.current.has(key)) return rangeCacheRef.current.get(key);
    const inflightKey = `${key}|f${fresh ? 1 : 0}`;
    if (inflightRef.current.has(inflightKey)) return inflightRef.current.get(inflightKey);

    const req = (async () => {
      const data = await apiFetch(
        '/api/log',
        {
          method: 'POST',
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            ...(fresh ? { fresh: true } : {}),
          }),
        },
        creds,
        settings
      );
      const todosInRange = data.todos || [];
      const normalized = todosInRange.map((todo) => ({
        ...todo,
        accum: normalizeAccumMin(todo?.accum),
      }));
      rangeCacheRef.current.set(key, normalized);
      return normalized;
    })();

    inflightRef.current.set(inflightKey, req);
    try {
      return await req;
    } finally {
      inflightRef.current.delete(inflightKey);
    }
  }, [creds, settings]);

  const loadData = useCallback(async (options = {}) => {
    const { fresh = false } = options;
    if (isLocalMode(creds)) {
      const range = getRange(effectiveFilter, effectiveHistoryPages, weekStart);
      const raw = loadLocalTodosInRange(range.start, range.end);
      const normalized = raw.map((todo) => ({
        ...todo,
        accum: normalizeAccumMin(todo?.accum),
      }));
      setTodos(normalized);
      setLoading(false);
      return;
    }
    if (!usesNotionTodoApi(creds)) {
      setTodos([]);
      setLoading(false);
      return;
    }
    const range = getRange(effectiveFilter, effectiveHistoryPages, weekStart);
    setLoading(!hasRangeCache(range.start, range.end));
    try {
      const list = await fetchRangeTodos(range.start, range.end, { force: fresh, fresh });
      setTodos(list);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [effectiveFilter, effectiveHistoryPages, weekStart, creds, hasRangeCache, fetchRangeTodos]);

  const loadStatsData = useCallback(async () => {
    const sr = statsRange;
    if (isLocalMode(creds)) {
      const raw = loadLocalTodosInRange(sr.start, sr.end);
      const normalized = raw.map((todo) => ({
        ...todo,
        accum: normalizeAccumMin(todo?.accum),
      }));
      setStatsTodos(normalized);
      setStatsLoading(false);
      return;
    }
    if (!usesNotionTodoApi(creds)) {
      setStatsTodos([]);
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    try {
      const list = await fetchRangeTodos(sr.start, sr.end, { force: true, fresh: true });
      setStatsTodos(list);
    } catch {
      setStatsTodos([]);
    } finally {
      setStatsLoading(false);
    }
  }, [statsRange, creds, fetchRangeTodos]);

  useEffect(() => { loadData(); setSelBar(null); }, [loadData]);
  useEffect(() => { setHistoryPages(1); }, [filter, weekStart, hasPremium]);
  useEffect(() => { loadStatsData(); }, [loadStatsData]);
  useEffect(() => {
    rangeCacheRef.current.clear();
    inflightRef.current.clear();
  }, [creds, creds?.dbTodo, JSON.stringify(settings?.todoFields || {})]);

  useEffect(() => {
    if (isLocalMode(creds) || (!loading && !statsLoading)) return;
    const id = setTimeout(() => {
      setLoading(false);
      setStatsLoading(false);
    }, 25000);
    return () => clearTimeout(id);
  }, [loading, statsLoading, creds?.authMode]);

  const range   = getRange(effectiveFilter, effectiveHistoryPages, weekStart);
  const groupedRaw = groupData(todos, range.by, weekStart);
  const groupedMap = new Map(groupedRaw.map((g) => [g.k, g]));
  const grouped = buildRangeKeys(range.start, range.end, range.by, weekStart).map((k) => groupedMap.get(k) || { k, min: 0, todos: [] });
  const maxMin  = Math.max(...grouped.map(g=>g.min),1);
  const statsTotal = statsTodos.reduce((s,t)=>s+(t.accum||0),0);
  const statsAvg = Math.round(statsTotal / dayCountInclusive(statsRange.start, statsRange.end));

  // Refresh selected bucket when data reloads; avoid deps on selBar to reduce churn on touch.
  useEffect(() => {
    setSelBar((prev) => {
      if (!prev?.k) return prev;
      const latest = grouped.find((item) => item.k === prev.k);
      return latest || null;
    });
  }, [grouped]);

  useEffect(() => {
    onSheetOpenChange?.(false);
  }, [onSheetOpenChange]);

  return (
    <div className="log-tab-page" style={{ minHeight: '100%' }}>
      <NotionLoadingOverlay open={usesNotionTodoApi(creds) && !!loading && grouped.length === 0} message={t.notionLoadingMessage} />
      {!inBottomSheet && (
        <div className="page-header">
          <div className="page-title">{t.log}</div>
        </div>
      )}

      <div style={{ padding: inBottomSheet ? '8px 16px 28px' : '0 16px 32px' }}>
        <div className="seg mb-20">
          <button
            className={`seg-btn ui-type-section-heading ${viewMode === 'stats' ? 'on' : ''}`}
            onClick={() => setViewMode('stats')}
          >
            {t.statsTab}
          </button>
          <button
            className={`seg-btn ui-type-section-heading ${viewMode === 'timetable' ? 'on' : ''}`}
            onClick={() => setViewMode('timetable')}
          >
            {t.logTimeLogTab}
          </button>
        </div>

        {viewMode === 'timetable' ? (
          <div className="card card-p" style={{ padding: '22px 20px 24px' }}>
            <div style={{ fontSize: 'var(--font-size-headline)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', marginBottom: 10 }}>
              {t.timetableLogIntroTitle}
            </div>
            <p className="ui-type-caption-aux" style={{ margin: 0, marginBottom: onOpenHomeTimetable ? 18 : 0, textAlign: 'left' }}>
              {t.timetableLogIntro}
            </p>
            {onOpenHomeTimetable ? (
              <button
                type="button"
                className="btn btn-dark"
                style={{ width: '100%', marginTop: 4 }}
                onClick={() => {
                  hapticLight();
                  onOpenHomeTimetable();
                }}
              >
                {t.timetableLogOpenCta}
              </button>
            ) : null}
          </div>
        ) : (
          <>

        {/* Stats period tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              marginBottom: 14,
              padding: '0 2px 2px',
              borderBottom: '1px solid var(--color-separator)',
            }}
          >
            {STATS_PRESETS.map((p) => {
              const on = statsPeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  className="log-tab-filter-btn ui-type-section-heading"
                  onClick={() => {
                    hapticLight();
                    if (!hasPremium && p !== 'thisWeek') {
                      triggerPremiumGate();
                      return;
                    }
                    setStatsPeriod(p);
                    setStatsCustomStart(null);
                    setStatsCustomEnd(null);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: on ? 'var(--color-text-primary)' : (!hasPremium && p !== 'thisWeek') ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                    padding: '6px 0',
                    cursor: (!hasPremium && p !== 'thisWeek') ? 'default' : 'pointer',
                    borderBottom: on ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                    marginBottom: -3,
                    fontFamily: 'var(--font)',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {statPeriodLabels[p]}
                  {/* lock icon removed */}
                </button>
              );
            })}
          </div>
          {premiumHint && (
            <div className="ui-type-caption-aux" style={{ padding: '6px 4px 0', display: 'flex', alignItems: 'center', gap: 5, animation: 'fadeIn .18s ease' }}>
              {premiumHint}
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 20 }}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <StatCard label={ko?'총 집중시간':'Total'} value={fmtM(statsTotal)} loading={statsLoading}/>
              <StatCard label={ko?'일평균':'Avg/day'}    value={fmtM(statsAvg)} loading={statsLoading}/>
            </div>
          </div>

        <div style={{ display:'flex', alignItems:'center', gap:18, marginBottom:14, padding:'0 2px 2px', borderBottom:'1px solid var(--color-separator)' }}>
          {FILTERS.map((f) => {
            const on = filter === f;
            const locked = !hasPremium && f !== 'daily';
            return (
              <button
                key={f}
                type="button"
                className="log-tab-filter-btn ui-type-section-heading"
                onClick={() => {
                  hapticLight();
                  if (locked) {
                    triggerPremiumGate();
                    return;
                  }
                  setFilter(f);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: on ? 'var(--color-text-primary)' : locked ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                  padding: '6px 0',
                  cursor: locked ? 'default' : 'pointer',
                  borderBottom: on ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                  marginBottom: -2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: 'var(--font)',
                  whiteSpace: 'nowrap',
                }}
              >
                {fLabels[f]}
                {/* lock icon removed */}
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div
          className="card card-p mb-14 log-graph-card"
          style={{
            ...(loading && usesNotionTodoApi(creds) && grouped.length === 0 ? { minHeight: 200 } : {}),
            position: 'relative',
          }}
        >
          {loading && usesNotionTodoApi(creds) && grouped.length > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                pointerEvents: 'none',
              }}
              aria-label={ko ? '그래프 로딩 중' : 'Loading chart'}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-separator)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                <Loader2 size={16} strokeWidth={2.2} style={{ animation: '_spin .8s linear infinite' }} />
              </div>
            </div>
          )}
          {loading && usesNotionTodoApi(creds) && grouped.length === 0 ? null : !loading && grouped.length === 0 ? (
            <div className="log-graph-empty">
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                <BarChart3 size={36} strokeWidth={1.9} color="var(--ui-meta-footnote-color)" aria-hidden />
              </div>
              <div className="log-graph-empty-title">{t.noData}</div>
            </div>
          ) : grouped.length > 0 ? (
            <BarChart
              key={effectiveFilter}
              data={grouped}
              by={range.by}
              maxMin={maxMin}
              locale={locale}
              rangeStart={range.start}
              rangeEnd={range.end}
              sel={selBar}
              onSel={setSelBar}
              onNeedOlder={() => setHistoryPages((p) => p + 1)}
              hasPremium={hasPremium}
              ko={ko}
              t={t}
              chartLoading={loading && usesNotionTodoApi(creds)}
            />
          ) : null}
        </div>

        {/* Bar detail */}
        {selBar && (
          <div className="slide-in log-bar-detail-wrap" style={{ marginTop: 'var(--gap-stack-sm)', padding: '0 calc(var(--gap-stack-xs) / 2)' }}>
            <div className="app-grouped-section-label app-grouped-section-label--first">
              {barLabel(selBar.k, range.by, locale, false)} · {fmtM(selBar.min)}
            </div>
            <div className="app-grouped-list">
              {selBar.todos.filter((todo) => (todo.accum || 0) > 0).map((todo) => (
                <div key={todo.id} className="app-grouped-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-stack-sm)', flex: 1, minWidth: 0 }}>
                    {todo.done ? (
                      <CheckCircle2 size={20} strokeWidth={2.1} color="var(--notion)" style={{ flexShrink: 0 }} aria-hidden />
                    ) : (
                      <Circle size={20} strokeWidth={2.1} color="var(--color-text-tertiary)" style={{ flexShrink: 0 }} aria-hidden />
                    )}
                    {todoHasGoalLink(todo) && (
                      <Target size={20} strokeWidth={2.2} color="var(--color-text-tertiary)" style={{ flexShrink: 0 }} aria-hidden />
                    )}
                    <span className="app-list-label truncate">{todo.name}</span>
                  </div>
                  <span className="app-list-value" style={{ flexShrink: 0, marginLeft: 'var(--gap-stack-sm)' }}>
                    {fmtM(todo.accum)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>

    </div>
  );
}

const StatCard = ({ label, value, loading = false }) => (
  <div className="card card-p" style={{ textAlign: 'center', padding: '16px 12px', minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    {loading ? (
      <Loader2 size={18} strokeWidth={2.2} style={{ animation: '_spin .8s linear infinite', color: 'var(--color-text-tertiary)' }} />
    ) : (
      <>
        <div className="ui-stat-card-value">{value}</div>
        <div className="ui-type-caption-aux" style={{ marginTop: 3 }}>
          {label}
        </div>
      </>
    )}
  </div>
);

function BarChart({ data, by, maxMin, locale, sel, onSel, onNeedOlder, hasPremium, ko, t, chartLoading = false }) {
  const [offset, setOffset] = useState(() => Math.max(0, data.length - WINDOW_SIZE));
  const pendingOlderRef = useRef(false);
  const GAP = 8;
  const H = 148;
  const Y_AXIS_W = 34;
  const maxOffset = Math.max(0, data.length - WINDOW_SIZE);
  const sliced = data.slice(offset, offset + WINDOW_SIZE);
  const gridSteps = [0, 0.5, 1];
  const visibleRangeLabel = formatVisibleRangeLabel(sliced, by, locale);

  useEffect(() => {
    setOffset((o) => Math.min(o, maxOffset));
  }, [maxOffset]);

  useEffect(() => {
    if (!pendingOlderRef.current) return;
    setOffset(0);
    pendingOlderRef.current = false;
  }, [data.length]);

  useEffect(() => {
    if (!hasPremium) setOffset(maxOffset);
  }, [hasPremium, maxOffset, data.length]);

  const showNav = hasPremium;

  return (
    <div className="log-chart-card" style={{ opacity: chartLoading ? 0.55 : 1, transition: 'opacity 0.2s ease', pointerEvents: chartLoading ? 'none' : 'auto' }}>
      {/* Header: reserve space for arrows so selection text never runs under them */}
      <div className="log-chart-range-row">
        <div className="log-chart-range-text">
          {sel ? (
            <span>
              <span className="log-chart-range-muted">{barLabel(sel.k, by, locale, true)}</span>
              <span className="log-chart-range-strong">{fmtM(sel.min)}</span>
            </span>
          ) : (
            <span className="log-chart-range-muted">{visibleRangeLabel}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginTop: -2 }}>
          {showNav ? (
            <>
              <button
                type="button"
                onClick={() => {
                  hapticLight();
                  if (offset === 0) {
                    pendingOlderRef.current = true;
                    onNeedOlder?.();
                    return;
                  }
                  setOffset((v) => Math.max(0, v - WINDOW_SIZE));
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '4px 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
                aria-label={ko ? '이전 구간' : 'Older'}
              >
                <ChevronLeft size={24} strokeWidth={2.5} color="var(--ui-caption-standard-color)" />
              </button>
              <button
                type="button"
                onClick={() => {
                  hapticLight();
                  setOffset((v) => Math.min(maxOffset, v + WINDOW_SIZE));
                }}
                disabled={offset >= maxOffset}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '4px 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: offset >= maxOffset ? 'default' : 'pointer',
                  opacity: offset >= maxOffset ? 0.3 : 1,
                  touchAction: 'manipulation',
                }}
                aria-label={ko ? '다음 구간' : 'Newer'}
              >
                <ChevronRight size={24} strokeWidth={2.5} color="var(--ui-caption-standard-color)" />
              </button>
            </>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 'var(--font-size-mini)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-tertiary)',
              }}
              title={t.logPremiumNavLocked}
            >
              <span>{t.premiumShort}</span>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, width: '100%' }}>
        <div
          style={{
            width: Y_AXIS_W,
            flexShrink: 0,
            height: H,
            position: 'relative',
            pointerEvents: 'none',
          }}
        >
          <div
            className="log-chart-y-tick log-chart-y-tick--top"
          >
            {fmtYAxisHours(maxMin, locale)}
          </div>
          <div
            className="log-chart-y-tick log-chart-y-tick--mid"
          >
            {fmtYAxisHours(Math.round(maxMin / 2), locale)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative', height: H, marginBottom: 0 }}>
            {/* Gridlines */}
            {gridSteps.map((gt, i) => (
              <div
                key={`g-${i}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${gt * 100}%`,
                  height: 1,
                  background: 'var(--color-separator)',
                  opacity: i === 0 || i === 2 ? 0.5 : 0.32,
                  pointerEvents: 'none',
                }}
              />
            ))}
            {/* Bars */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                top: 0,
                display: 'flex',
                alignItems: 'flex-end',
                gap: GAP,
                paddingLeft: 2,
                paddingRight: 2,
              }}
            >
              {sliced.map((item) => {
                const pct = maxMin > 0 ? item.min / maxMin : 0;
                const barH = Math.max(4, Math.round(pct * H));
                const isSel = sel?.k === item.k;
                return (
                  <button
                    type="button"
                    key={item.k}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      cursor: 'pointer',
                      flex: '1 1 0',
                      minWidth: 0,
                      height: '100%',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      margin: 0,
                      font: 'inherit',
                      color: 'inherit',
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                    }}
                    onClick={() => { hapticLight(); onSel(isSel ? null : item); }}
                  >
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 44,
                        height: H,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        margin: '0 auto',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 44,
                          height: barH,
                          borderRadius: 'var(--radius-xs) var(--radius-xs) 0 0',
                          background: isSel ? BAR_SELECTED : BAR_UNSELECTED,
                          transition: 'height .3s ease, background .2s',
                          opacity: item.min === 0 ? 0.2 : 1,
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div style={{ display: 'flex', gap: GAP, padding: '10px 2px 0', marginLeft: 0 }}>
            {sliced.map((item) => {
              const isSel = sel?.k === item.k;
              return (
                <div
                  key={`${item.k}-cap`}
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    minHeight: 36,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    className="log-chart-x-label"
                    data-selected={isSel ? 'true' : 'false'}
                  >
                    {barLabel(item.k, by, locale, true)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
