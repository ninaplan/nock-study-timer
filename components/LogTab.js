'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  BarChart3,
  CheckCircle2,
  Circle,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { apiFetch, resolveApiUrl } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { localDateKey } from '@/app/lib/dateUtils';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import { hapticLight } from './lib/haptics';
import { PREMIUM_GATES_ENABLED } from '@/app/lib/featureFlags';
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
    if (compact) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (by === 'month') {
    const [y, m] = k.split('-');
    if (compact) return lo === 'ko' ? `${+m}월` : new Date(+y, +m - 1).toLocaleDateString('en', { month: 'short' });
    return lo === 'ko' ? `${y}년 ${+m}월` : new Date(+y, +m - 1).toLocaleDateString('en', { year: 'numeric', month: 'long' });
  }
  return k;
}
const fmtM = m => { if(!m) return '0m'; const h=Math.floor(m/60),r=m%60; if(h&&r)return`${h}h ${r}m`; if(h)return`${h}h`; return`${r}m`; };
const normalizeAccumMin = (value) => {
  const n = Math.max(0, Number(value) || 0);
  if (n > 1440 && n % 60 === 0 && n / 60 <= 1440) return n / 60;
  return n;
};

function demoData() {
  const out=[]; const now=new Date();
  for(let i=13;i>=0;i--) {
    const d=new Date(now); d.setDate(d.getDate()-i);
    const date=localDateKey(d);
    const n=Math.floor(Math.random()*3)+1;
    for(let j=0;j<n;j++) out.push({id:`d-${i}-${j}`,name:['알고리즘','운영체제','영어','수학'][j%4],date,accum:Math.floor(Math.random()*90)+10,done:Math.random()>.3});
  }
  return out;
}

export default function LogTab({ t, creds, settings, isDemoMode, onSheetOpenChange }) {
  const [subscription, setSubscription] = useState(null);
  const [viewMode, setViewMode] = useState('stats');
  const [filter,      setFilter]      = useState('daily');
  const [historyPages, setHistoryPages] = useState(1);
  const [todos,       setTodos]       = useState([]);
  const [statsTodos,  setStatsTodos]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statsLoading,setStatsLoading]= useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selBar,      setSelBar]      = useState(null);
  const [statsPeriod, setStatsPeriod] = useState('thisWeek');
  const [statsCustomStart, setStatsCustomStart] = useState(null);
  const [statsCustomEnd, setStatsCustomEnd] = useState(null);
  const [statsCustomOpen, setStatsCustomOpen] = useState(false);
  const [statsInlineError, setStatsInlineError] = useState('');
  const locale = settings?.lang||'ko';
  const ko     = locale==='ko';
  const weekStart = settings?.weekStart || 'monday';
  const fLabels = {daily:t.daily,weekly:t.weekly,monthly:t.monthly,yearly:t.yearly};
  const statPeriodLabels = {
    thisWeek: ko ? '이번주' : 'This week',
    thisMonth: ko ? '이번달' : 'This month',
    thisYear: ko ? '올해' : 'This year',
  };
  const rangeCacheRef = useRef(new Map());
  const inflightRef = useRef(new Map());

  useEffect(() => {
    if (isDemoMode) return;
    fetch(resolveApiUrl('/api/subscription'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSubscription(j))
      .catch(() => setSubscription(null));
  }, [isDemoMode]);

  const hasPremium =
    !PREMIUM_GATES_ENABLED ||
    isDemoMode ||
    subscription?.status === 'active' ||
    subscription?.status === 'trialing';

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
    if (isDemoMode || !hasNotionAuth(creds)) {
      setTodos(demoData());
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
  }, [effectiveFilter, effectiveHistoryPages, weekStart, creds, isDemoMode, hasRangeCache, fetchRangeTodos]);

  const loadStatsData = useCallback(async () => {
    const sr = statsRange;
    if (isDemoMode || !hasNotionAuth(creds)) {
      const demo = demoData().filter((x) => x.date >= sr.start && x.date <= sr.end);
      setStatsTodos(demo);
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
  }, [statsRange, creds, isDemoMode, fetchRangeTodos]);

  const refreshLogData = useCallback(async () => {
    rangeCacheRef.current.clear();
    inflightRef.current.clear();
    setIsRefreshing(true);
    try {
      await Promise.all([loadData({ fresh: true }), loadStatsData()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadData, loadStatsData]);

  useEffect(() => { loadData(); setSelBar(null); }, [loadData]);
  useEffect(() => { setHistoryPages(1); }, [filter, weekStart, hasPremium]);
  useEffect(() => { loadStatsData(); }, [loadStatsData]);
  useEffect(() => {
    rangeCacheRef.current.clear();
    inflightRef.current.clear();
  }, [creds, creds?.dbTodo, JSON.stringify(settings?.todoFields || {})]);

  useEffect(() => {
    if (isDemoMode || (!loading && !statsLoading)) return;
    const id = setTimeout(() => {
      setLoading(false);
      setStatsLoading(false);
    }, 25000);
    return () => clearTimeout(id);
  }, [loading, statsLoading, isDemoMode]);

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
      <NotionLoadingOverlay open={!isDemoMode && !!loading && grouped.length === 0} message={t.notionLoadingMessage} />
      <div className="page-header">
        <div className="page-title">{t.log}</div>
      </div>

      <div style={{ padding: '0 16px 32px' }}>
        <div className="seg mb-20">
          <button className={`seg-btn ${viewMode==='stats'?'on':''}`} onClick={() => setViewMode('stats')}>{t.statsTab}</button>
          <button className={`seg-btn ${viewMode==='timetable'?'on':''}`} onClick={() => setViewMode('timetable')}>{t.timetableTab}</button>
        </div>

        {viewMode === 'timetable' ? (
          <div className="card card-p" style={{ textAlign:'center', padding:'40px 20px', fontSize:17, fontWeight: 600, color:'var(--text3)' }}>
            {t.timetableComingSoon}
          </div>
        ) : (
          <>

        {/* Stats period row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 12,
              padding: '4px 2px 10px',
              borderBottom: '1px solid var(--sep)',
            }}
          >
            {STATS_PRESETS.map((p) => {
              const on = statsPeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    hapticLight();
                    setStatsPeriod(p);
                    setStatsCustomOpen(false);
                    setStatsInlineError('');
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: on ? 'var(--text)' : 'var(--text3)',
                    fontSize: 16,
                    fontWeight: on ? 700 : 600,
                    padding: '6px 0',
                    cursor: 'pointer',
                    borderBottom: on ? '2px solid var(--text)' : '2px solid transparent',
                    marginBottom: -3,
                    fontFamily: 'var(--font)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {statPeriodLabels[p]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                hapticLight();
                setStatsCustomOpen((v) => {
                  const next = !v;
                  if (next) {
                    const fallback = getPresetRange('thisWeek');
                    setStatsCustomStart((s) => s || fallback.start);
                    setStatsCustomEnd((e) => e || fallback.end);
                  }
                  return next;
                });
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: statsPeriod === 'custom' ? 'var(--text)' : 'var(--text3)',
                fontSize: 16,
                fontWeight: statsPeriod === 'custom' ? 700 : 600,
                padding: '6px 2px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 28,
                borderBottom: statsPeriod === 'custom' ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -3,
              }}
              aria-expanded={statsCustomOpen}
              aria-label={ko ? '기간 더보기 · 직접 선택' : 'More period options'}
              title={formatStatsChipLabel(statsPeriod, statsCustomStart, statsCustomEnd, statPeriodLabels, ko)}
            >
              <MoreHorizontal size={20} strokeWidth={2.2} />
            </button>
          </div>
          {statsCustomOpen && (
            <div className="card card-p" style={{ marginBottom: 14, padding: '12px 14px' }}>
              <div className="sheet-form-row" style={{ padding: '10px 4px', minHeight: 0 }}>
                <span className="sheet-form-label" style={{ fontSize: 14 }}>{t.statsPeriodStart}</span>
                <input
                  type="date"
                  className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                  value={statsCustomStart || ''}
                  onChange={(e) => {
                    setStatsCustomStart(e.target.value);
                    setStatsInlineError('');
                  }}
                />
              </div>
              <div className="sheet-form-row" style={{ padding: '10px 4px', minHeight: 0 }}>
                <span className="sheet-form-label" style={{ fontSize: 14 }}>{t.statsPeriodEnd}</span>
                <input
                  type="date"
                  className="sheet-form-date-pill sheet-form-date-pill--light-calendar"
                  value={statsCustomEnd || ''}
                  max={localDateKey()}
                  onChange={(e) => {
                    setStatsCustomEnd(e.target.value);
                    setStatsInlineError('');
                  }}
                />
              </div>
              {statsInlineError ? (
                <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 8 }}>{statsInlineError}</div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  onClick={() => {
                    if (!statsCustomStart || !statsCustomEnd) {
                      setStatsInlineError(t.statsPeriodInvalidRange);
                      return;
                    }
                    let s = statsCustomStart;
                    let e = statsCustomEnd;
                    if (s > e) [s, e] = [e, s];
                    setStatsPeriod('custom');
                    setStatsCustomStart(s);
                    setStatsCustomEnd(e);
                    setStatsCustomOpen(false);
                    setStatsInlineError('');
                  }}
                >
                  {t.statsApply}
                </button>
              </div>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            <StatCard label={ko?'총 집중시간':'Total'} value={fmtM(statsTotal)}/>
            <StatCard label={ko?'일평균':'Avg/day'}    value={fmtM(statsAvg)}/>
          </div>
          {statsLoading && (
            <div style={{ marginTop:-8, marginBottom:10, fontSize:12, color:'var(--text4)', fontWeight: 500 }}>
              {ko ? '통계 업데이트 중...' : 'Updating stats...'}
            </div>
          )}

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, padding:'0 2px 2px', borderBottom:'1px solid var(--sep)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:18, flex: 1, minWidth: 0 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  border:'none',
                  background:'transparent',
                  color: filter === f ? 'var(--text)' : 'var(--text3)',
                  fontSize:16,
                  fontWeight: filter === f ? 700 : 600,
                  padding:'6px 0',
                  cursor:'pointer',
                  borderBottom: filter === f ? '2px solid var(--text)' : '2px solid transparent',
                  marginBottom:-3,
                }}
              >
                {fLabels[f]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refreshLogData}
            disabled={isRefreshing}
            style={{
              border:'none',
              background:'transparent',
              color:'var(--text3)',
              display:'inline-flex',
              alignItems:'center',
              justifyContent:'center',
              padding:'6px 2px',
              cursor: isRefreshing ? 'default' : 'pointer',
              opacity: isRefreshing ? 0.5 : 1,
              whiteSpace:'nowrap',
            }}
            aria-label={t.refresh}
            title={t.refresh}
          >
            <RefreshCw size={16} strokeWidth={2.1} className={isRefreshing ? 'spin' : ''} />
          </button>
        </div>

        {/* Chart */}
        <div className="card card-p mb-14" style={loading && !isDemoMode && grouped.length === 0 ? { minHeight: 200 } : undefined}>
          {loading && !isDemoMode && grouped.length === 0 ? null : !loading && grouped.length === 0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
              <div style={{marginBottom:8, display:'flex', justifyContent:'center'}}>
                <BarChart3 size={36} strokeWidth={1.9} color="var(--text3)" />
              </div>
              <div style={{fontWeight: 600}}>{t.noData}</div>
            </div>
          ) : grouped.length > 0 ? (
            <BarChart
              key={effectiveFilter}
              data={grouped}
              by={range.by}
              maxMin={maxMin}
              locale={locale}
              sel={selBar}
              onSel={setSelBar}
              onNeedOlder={() => setHistoryPages((p) => p + 1)}
              hasPremium={hasPremium}
              ko={ko}
              t={t}
              chartLoading={loading && !isDemoMode}
            />
          ) : null}
        </div>

        {/* Bar detail */}
        {selBar && (
          <div className="slide-in" style={{ marginTop: 10, padding:'2px 4px' }}>
            <div style={{fontWeight: 500,fontSize:13,marginBottom:10,color:'var(--text3)'}}>
              {barLabel(selBar.k,range.by,locale,false)} · {fmtM(selBar.min)}
            </div>
            {selBar.todos.filter(todo => (todo.accum || 0) > 0).map(todo=>(
              <div key={todo.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'.5px solid var(--sep)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
                  {todo.done ? <CheckCircle2 size={14} strokeWidth={2.1} color="var(--notion)" /> : <Circle size={14} strokeWidth={2.1} color="var(--text4)" />}
                  <span style={{fontSize:14,fontWeight: 400,color:'var(--text2)'}} className="truncate">{todo.name}</span>
                </div>
                <span style={{fontSize:13,color:'var(--text3)',fontWeight: 400,flexShrink:0,marginLeft:8}}>{fmtM(todo.accum)}</span>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>

    </div>
  );
}

const StatCard = ({label,value}) => (
  <div className="card card-p" style={{textAlign:'center',padding:'16px 12px'}}>
    <div style={{fontSize:27,fontWeight: 700,color:'var(--text)',letterSpacing:'-.5px'}}>{value}</div>
    <div style={{fontSize:14,color:'var(--text3)',fontWeight: 600,marginTop:4}}>{label}</div>
  </div>
);

function BarChart({ data, by, maxMin, locale, sel, onSel, onNeedOlder, hasPremium, ko, t, chartLoading = false }) {
  const [offset, setOffset] = useState(() => Math.max(0, data.length - WINDOW_SIZE));
  const pendingOlderRef = useRef(false);
  const GAP = 8;
  const H = 148;
  const Y_AXIS_W = 40;
  const maxOffset = Math.max(0, data.length - WINDOW_SIZE);
  const sliced = data.slice(offset, offset + WINDOW_SIZE);
  const gridSteps = [0, 0.5, 1];
  const midVal = Math.round(maxMin / 2);

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
    <div style={{ opacity: chartLoading ? 0.55 : 1, transition: 'opacity 0.2s ease', pointerEvents: chartLoading ? 'none' : 'auto' }}>
      {/* Header: reserve space for arrows so selection text never runs under them */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
          minHeight: 36,
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            paddingRight: 8,
            lineHeight: 1.35,
            wordBreak: 'break-word',
          }}
        >
          {sel ? (
            <span>
              <span style={{ color: 'var(--text3)' }}>{barLabel(sel.k, by, locale, true)}</span>
              <span style={{ marginLeft: 6, color: 'var(--text)', fontWeight: 700 }}>{fmtM(sel.min)}</span>
            </span>
          ) : (
            <span style={{ color: 'var(--text4)' }}>{t.logAxisFocusTime}</span>
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
                <ChevronLeft size={22} strokeWidth={2.2} color="var(--text3)" />
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
                <ChevronRight size={22} strokeWidth={2.2} color="var(--text3)" />
              </button>
            </>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text4)',
              }}
              title={t.logPremiumNavLocked}
            >
              <Lock size={14} strokeWidth={2.1} aria-hidden />
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
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text3)',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {fmtM(maxMin)}
          </div>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              right: 0,
              transform: 'translateY(-50%)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text3)',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {fmtM(midVal)}
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
                  background: 'var(--sep)',
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
                          borderRadius: '6px 6px 0 0',
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
                    style={{
                      fontSize: 11,
                      color: isSel ? 'var(--text)' : 'var(--text3)',
                      fontWeight: isSel ? 700 : 600,
                      lineHeight: 1.3,
                      textAlign: 'center',
                      wordBreak: 'break-word',
                    }}
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
