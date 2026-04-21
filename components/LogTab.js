'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, BarChart3, CheckCircle2, Circle } from 'lucide-react';
import { apiFetch } from './lib/apiClient';
const FILTERS = ['daily','weekly','monthly','yearly'];
const STATS_PERIODS = ['thisWeek', 'thisMonth', 'thisYear'];
const WEEK_DAYS = 7;
const WINDOW_SIZE = 7;

function dayCountInclusive(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return 1;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function toDateKey(d) {
  return d.toISOString().split('T')[0];
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
  const start = startOfWeek(now, weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
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
      out.push(cur.toISOString().split('T')[0]);
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

function barLabel(k,by,lo,compact = false) {
  if (by === 'day' || by === 'week') {
    const d = new Date(k);
    if (lo === 'ko') return compact ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if(by==='month') { const[y,m]=k.split('-'); return lo==='ko'?`${+m}월`:new Date(+y,+m-1).toLocaleDateString('en',{month:'short'}); }
  return k;
}
const fmtM = m => { if(!m) return '0m'; const h=Math.floor(m/60),r=m%60; if(h&&r)return`${h}h ${r}m`; if(h)return`${h}h`; return`${r}m`; };

function demoData() {
  const out=[]; const now=new Date();
  for(let i=13;i>=0;i--) {
    const d=new Date(now); d.setDate(d.getDate()-i);
    const date=d.toISOString().split('T')[0];
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
  const fetchRangeTodos = useCallback(async (start, end) => {
    const key = getRangeCacheKey(start, end);
    if (rangeCacheRef.current.has(key)) return rangeCacheRef.current.get(key);
    if (inflightRef.current.has(key)) return inflightRef.current.get(key);

    const req = (async () => {
      const data = await apiFetch(
        '/api/log',
        { method:'POST', body:JSON.stringify({ startDate: start, endDate: end }) },
        creds,
        settings
      );
      const todosInRange = data.todos || [];
      rangeCacheRef.current.set(key, todosInRange);
      return todosInRange;
    })();

    inflightRef.current.set(key, req);
    try {
      return await req;
    } finally {
      inflightRef.current.delete(key);
    }
  }, [creds, settings]);

  const loadData = useCallback(async () => {
    if(isDemoMode||!creds?.token) { setTodos(demoData()); setLoading(false); return; }
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
    if (isDemoMode || !creds?.token) {
      const demo = demoData().filter((x) => x.date >= statsRange.start && x.date <= statsRange.end);
      setStatsTodos(demo);
      setStatsLoading(false);
      return;
    }
    setStatsLoading(!hasRangeCache(statsRange.start, statsRange.end));
    try {
      const list = await fetchRangeTodos(statsRange.start, statsRange.end);
      setStatsTodos(list);
    } catch {
      setStatsTodos([]);
    } finally {
      setStatsLoading(false);
    }
  }, [statsPeriod, weekStart, creds, isDemoMode, hasRangeCache, fetchRangeTodos]);

  useEffect(() => { loadData(); setSelBar(null); }, [loadData]);
  useEffect(() => { setHistoryPages(1); }, [filter, weekStart]);
  useEffect(() => { loadStatsData(); }, [loadStatsData]);
  useEffect(() => {
    rangeCacheRef.current.clear();
    inflightRef.current.clear();
  }, [creds?.token, creds?.dbTodo, JSON.stringify(settings?.todoFields || {})]);

  const range   = getRange(filter, historyPages, weekStart);
  const statsRange = getStatsRange(statsPeriod, weekStart);
  const groupedRaw = groupData(todos, range.by, weekStart);
  const groupedMap = new Map(groupedRaw.map((g) => [g.k, g]));
  const grouped = buildRangeKeys(range.start, range.end, range.by, weekStart).map((k) => groupedMap.get(k) || { k, min: 0, todos: [] });
  const maxMin  = Math.max(...grouped.map(g=>g.min),1);
  const statsTotal = statsTodos.reduce((s,t)=>s+(t.accum||0),0);
  const statsAvg = Math.round(statsTotal / dayCountInclusive(statsRange.start, statsRange.end));

  return (
    <div style={{minHeight:'100%'}}>
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

        <div style={{ display:'flex', alignItems:'center', gap:18, marginBottom:14, padding:'0 2px 2px', borderBottom:'1px solid var(--sep)' }}>
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

        {/* Chart */}
        <div className="card card-p mb-14">
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:40}}>
              <div className="spin spin-dark"/>
            </div>
          ) : grouped.length===0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
              <div style={{marginBottom:8, display:'flex', justifyContent:'center'}}>
                <BarChart3 size={36} strokeWidth={1.9} color="var(--text3)" />
              </div>
              <div style={{fontWeight:700}}>{t.noData}</div>
            </div>
          ) : (
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
          )}
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
      <div style={{ position:'relative' }}>
        <button
          type="button"
          onClick={() => {
            if (offset === 0) {
              onNeedOlder?.();
              return;
            }
            setOffset((v) => Math.max(0, v - WINDOW_SIZE));
          }}
          disabled={false}
          style={{
            position:'absolute',
            left:-4,
            top:'50%',
            transform:'translateY(-50%)',
            border:'none',
            background:'transparent',
            padding:4,
            cursor: 'pointer',
            opacity: 1,
            zIndex: 2,
          }}
          aria-label="Older"
        >
          <ChevronLeft size={18} strokeWidth={2.1} color="var(--text3)" />
        </button>
        <button
          type="button"
          onClick={() => setOffset(v => Math.min(maxOffset, v + WINDOW_SIZE))}
          disabled={offset >= maxOffset}
          style={{
            position:'absolute',
            right:-4,
            top:'50%',
            transform:'translateY(-50%)',
            border:'none',
            background:'transparent',
            padding:4,
            cursor: offset >= maxOffset ? 'default' : 'pointer',
            opacity: offset >= maxOffset ? .3 : 1,
            zIndex: 2,
          }}
          aria-label="Newer"
        >
          <ChevronRight size={18} strokeWidth={2.1} color="var(--text3)" />
        </button>
        <div style={{display:'flex',alignItems:'flex-end',gap:GAP,height:H+28,padding:'0 18px 4px',width:'100%'}}>
        {sliced.map(item => {
          const pct=maxMin>0?item.min/maxMin:0;
          const barH=Math.max(4,Math.round(pct*H));
          const isSel=sel?.k===item.k;
          return (
            <div
              key={item.k}
              style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',flex:'1 1 0',minWidth:0}}
              onClick={()=>onSel(isSel?null:item)}
            >
              <div style={{fontSize:10,fontWeight:800,color:isSel?'var(--text)':'transparent',marginBottom:2,whiteSpace:'nowrap'}}>
                {isSel?fmtM(item.min):''}
              </div>
              <div style={{width:'100%',maxWidth:42,height:barH,borderRadius:'6px 6px 0 0',background:isSel?'var(--text)':'var(--bg3)',transition:'height .3s ease,background .2s',opacity:item.min===0?.2:1}}/>
              <div style={{fontSize:10,color:isSel?'var(--text)':'var(--text4)',fontWeight:700,whiteSpace:'nowrap',transform:sliced.length>10?'rotate(-40deg)':'none',transformOrigin:'top center'}}>
                {barLabel(item.k,by,locale,true)}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
