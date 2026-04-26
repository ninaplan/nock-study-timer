'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, BarChart3, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { apiFetch } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { localDateKey } from '@/app/lib/dateUtils';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import { hapticLight } from './lib/haptics';
const FILTERS = ['daily','weekly','monthly','yearly'];
const STATS_PERIODS = ['thisWeek', 'thisMonth', 'thisYear'];
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

export default function LogTab({ t, creds, settings, isDemoMode }) {
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
      rangeCacheRef.current.set(key, todosInRange);
      return todosInRange;
    })();

    inflightRef.current.set(inflightKey, req);
    try {
      return await req;
    } finally {
      inflightRef.current.delete(inflightKey);
    }
  }, [creds, settings]);

  const loadData = useCallback(async () => {
    if(isDemoMode||!hasNotionAuth(creds)) { setTodos(demoData()); setLoading(false); return; }
    const range = getRange(filter, historyPages, weekStart);
    setLoading(!hasRangeCache(range.start, range.end));
    try {
      const list = await fetchRangeTodos(range.start, range.end);
      setTodos(list);
    } catch {}
    finally { setLoading(false); }
  }, [filter, historyPages, weekStart, creds, isDemoMode, hasRangeCache, fetchRangeTodos]);

  const loadStatsData = useCallback(async () => {
    const statsRange = getStatsRange(statsPeriod, weekStart);
    if (isDemoMode || !hasNotionAuth(creds)) {
      const demo = demoData().filter((x) => x.date >= statsRange.start && x.date <= statsRange.end);
      setStatsTodos(demo);
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    try {
      // Always revalidate: client cache + short server /api/log cache can leave "이번 달" older than "이번 주".
      const list = await fetchRangeTodos(statsRange.start, statsRange.end, { force: true, fresh: true });
      setStatsTodos(list);
    } catch {
      setStatsTodos([]);
    } finally {
      setStatsLoading(false);
    }
  }, [statsPeriod, weekStart, creds, isDemoMode, fetchRangeTodos]);

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
  useEffect(() => { setHistoryPages(1); }, [filter, weekStart]);
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

  const range   = getRange(filter, historyPages, weekStart);
  const statsRange = getStatsRange(statsPeriod, weekStart);
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

  return (
    <div style={{minHeight:'100%'}}>
      <NotionLoadingOverlay open={!!loading && !isDemoMode} message={t.notionLoadingMessage} />
      <div className="page-header">
        <div className="page-title">{t.log}</div>
      </div>

      <div style={{padding:'0 16px 32px'}}>
        <div className="seg mb-20">
          <button className={`seg-btn ${viewMode==='stats'?'on':''}`} onClick={() => setViewMode('stats')}>{t.statsTab}</button>
          <button className={`seg-btn ${viewMode==='timetable'?'on':''}`} onClick={() => setViewMode('timetable')}>{t.timetableTab}</button>
        </div>

        {viewMode === 'timetable' ? (
          <div className="card card-p" style={{ textAlign:'center', padding:'40px 20px', fontSize:17, fontWeight:700, color:'var(--text3)' }}>
            {t.timetableComingSoon}
          </div>
        ) : (
          <>

        {/* Stats */}
        {
          <>
          <div
            style={{
              display:'flex',
              alignItems:'center',
              gap:18,
              marginBottom:10,
              padding:'0 2px 2px',
              borderBottom:'1px solid var(--sep)',
            }}
          >
            {STATS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setStatsPeriod(p)}
                style={{
                  border:'none',
                  background:'transparent',
                  color: statsPeriod === p ? 'var(--text)' : 'var(--text3)',
                  fontSize:14,
                  fontWeight: statsPeriod === p ? 700 : 600,
                  padding:'6px 0',
                  cursor:'pointer',
                  borderBottom: statsPeriod === p ? '2px solid var(--text)' : '2px solid transparent',
                  marginBottom:-3,
                }}
              >
                {statPeriodLabels[p]}
              </button>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            <StatCard label={ko?'총 집중시간':'Total'} value={fmtM(statsTotal)}/>
            <StatCard label={ko?'일평균':'Avg/day'}    value={fmtM(statsAvg)}/>
          </div>
          {statsLoading && (
            <div style={{ marginTop:-8, marginBottom:10, fontSize:12, color:'var(--text4)', fontWeight:600 }}>
              {ko ? '통계 업데이트 중...' : 'Updating stats...'}
            </div>
          )}
          </>
        }

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, padding:'0 2px 2px', borderBottom:'1px solid var(--sep)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:18 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                border:'none',
                background:'transparent',
                color: filter === f ? 'var(--text)' : 'var(--text3)',
                fontSize:14,
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
        <div className="card card-p mb-14" style={loading && !isDemoMode ? { minHeight: 200 } : undefined}>
          {loading && !isDemoMode ? null : !loading && grouped.length===0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
              <div style={{marginBottom:8, display:'flex', justifyContent:'center'}}>
                <BarChart3 size={36} strokeWidth={1.9} color="var(--text3)" />
              </div>
              <div style={{fontWeight:700}}>{t.noData}</div>
            </div>
          ) : !loading ? (
            <BarChart
              key={filter}
              data={grouped}
              by={range.by}
              maxMin={maxMin}
              locale={locale}
              sel={selBar}
              onSel={setSelBar}
              onNeedOlder={() => setHistoryPages((p) => p + 1)}
            />
          ) : null}
        </div>

        {/* Bar detail */}
        {selBar && (
          <div className="slide-in" style={{ marginTop: 10, padding:'2px 4px' }}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:'var(--text3)'}}>
              {barLabel(selBar.k,range.by,locale,false)} · {fmtM(selBar.min)}
            </div>
            {selBar.todos.filter(todo => (todo.accum || 0) > 0).map(todo=>(
              <div key={todo.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'.5px solid var(--sep)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
                  {todo.done ? <CheckCircle2 size={14} strokeWidth={2.1} color="var(--green)" /> : <Circle size={14} strokeWidth={2.1} color="var(--text4)" />}
                  <span style={{fontSize:14,fontWeight:500,color:'var(--text2)'}} className="truncate">{todo.name}</span>
                </div>
                <span style={{fontSize:13,color:'var(--text3)',fontWeight:500,flexShrink:0,marginLeft:8}}>{fmtM(todo.accum)}</span>
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
    <div style={{fontSize:24,fontWeight:800,color:'var(--text)',letterSpacing:'-.5px'}}>{value}</div>
    <div style={{fontSize:12,color:'var(--text3)',fontWeight:700,marginTop:3}}>{label}</div>
  </div>
);

function BarChart({data,by,maxMin,locale,sel,onSel,onNeedOlder}) {
  const [offset, setOffset] = useState(() => Math.max(0, data.length - WINDOW_SIZE));
  const GAP = 8;
  const H   = 140;
  const maxOffset = Math.max(0, data.length - WINDOW_SIZE);
  const sliced = data.slice(offset, offset + WINDOW_SIZE);

  // Keep "newest on right" order, but show latest 7 on first load.
  useEffect(() => {
    setOffset(maxOffset);
  }, [maxOffset]);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:11,color:'var(--text4)',fontWeight:700}}>{fmtM(maxMin)}</div>
      </div>
      {/* Side-by-side with bars so chevrons never sit on top of bar hit targets (fixes flaky mobile taps). */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 2, width: '100%' }}>
        <button
          type="button"
          onClick={() => {
            hapticLight();
            if (offset === 0) {
              onNeedOlder?.();
              return;
            }
            setOffset((v) => Math.max(0, v - WINDOW_SIZE));
          }}
          style={{
            flexShrink: 0,
            alignSelf: 'center',
            border: 'none',
            background: 'transparent',
            padding: 6,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
          aria-label="Older"
        >
          <ChevronLeft size={18} strokeWidth={2.1} color="var(--text3)" />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: GAP, padding: '0 0 14px' }}>
        {sliced.map((item) => {
          const pct = maxMin > 0 ? item.min / maxMin : 0;
          const barH = Math.max(4, Math.round(pct * H));
          const isSel = sel?.k === item.k;
          const barBg = isSel ? BAR_SELECTED : BAR_UNSELECTED;
          const capCol = isSel ? BAR_SELECTED : 'var(--text4)';
          return (
            <button
              type="button"
              key={item.k}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                alignSelf: 'flex-end',
                cursor: 'pointer',
                flex: '1 1 0',
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                font: 'inherit',
                color: 'inherit',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
              onClick={() => {
                hapticLight();
                onSel(isSel ? null : item);
              }}
            >
              <div
                style={{
                  minHeight: 18,
                  fontSize: 10,
                  fontWeight: 800,
                  color: isSel ? BAR_SELECTED : 'transparent',
                  marginBottom: 4,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isSel ? fmtM(item.min) : ''}
              </div>
              <div style={{ width: '100%', maxWidth: 42, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 42,
                    height: barH,
                    borderRadius: '6px 6px 0 0',
                    background: barBg,
                    transition: 'height .3s ease, background .2s',
                    opacity: item.min === 0 ? 0.2 : 1,
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <div
                style={{
                  width: '100%',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  padding: '8px 2px 0',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: capCol,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    pointerEvents: 'none',
                  }}
                >
                  {barLabel(item.k, by, locale, true)}
                </span>
              </div>
            </button>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() => {
            hapticLight();
            setOffset((v) => Math.min(maxOffset, v + WINDOW_SIZE));
          }}
          disabled={offset >= maxOffset}
          style={{
            flexShrink: 0,
            alignSelf: 'center',
            border: 'none',
            background: 'transparent',
            padding: 6,
            cursor: offset >= maxOffset ? 'default' : 'pointer',
            opacity: offset >= maxOffset ? 0.3 : 1,
            touchAction: 'manipulation',
          }}
          aria-label="Newer"
        >
          <ChevronRight size={18} strokeWidth={2.1} color="var(--text3)" />
        </button>
      </div>
    </div>
  );
}
