'use client';
import { useState, useEffect, useCallback } from 'react';
import { FunnelSimple, CaretLeft, CaretRight, Check, ChartLineDown } from 'phosphor-react';
import { apiFetch } from './lib/apiClient';
import PopupDialog from './PopupDialog';

const FILTERS = ['daily','weekly','monthly','yearly'];

function getRange(f, customStart, customEnd) {
  const now=new Date(), today=now.toISOString().split('T')[0];
  if (customStart && customEnd) return { start: customStart, end: customEnd, by: 'day' };
  if(f==='daily')   { const s=new Date(now); s.setDate(s.getDate()-13);     return {start:s.toISOString().split('T')[0],end:today,by:'day'}; }
  if(f==='weekly')  { const s=new Date(now); s.setDate(s.getDate()-83);     return {start:s.toISOString().split('T')[0],end:today,by:'week'}; }
  if(f==='monthly') { const s=new Date(now); s.setMonth(s.getMonth()-11); s.setDate(1); return {start:s.toISOString().split('T')[0],end:today,by:'month'}; }
  const s=new Date(now); s.setFullYear(s.getFullYear()-4); s.setMonth(0); s.setDate(1);
  return {start:s.toISOString().split('T')[0],end:today,by:'year'};
}

function groupData(todos, by) {
  const map={};
  todos.forEach(t => {
    if(!t.date||!t.accum) return;
    const d=new Date(t.date); let k;
    if(by==='day')   k=t.date;
    else if(by==='week') { const mo=new Date(d); mo.setDate(d.getDate()-d.getDay()+1); k=mo.toISOString().split('T')[0]; }
    else if(by==='month') k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    else k=String(d.getFullYear());
    if(!map[k]) map[k]={k,min:0,todos:[]};
    map[k].min+=t.accum; map[k].todos.push(t);
  });
  return Object.values(map).sort((a,b)=>a.k.localeCompare(b.k));
}

function barLabel(k,by,lo) {
  if(by==='day'||by==='week') { const d=new Date(k); return `${d.getMonth()+1}/${d.getDate()}`; }
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
  const [todos,       setTodos]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selBar,      setSelBar]      = useState(null);
  const [showFilter,  setShowFilter]  = useState(false);
  const locale = settings?.lang||'ko';
  const ko     = locale==='ko';
  const fLabels = {daily:t.daily,weekly:t.weekly,monthly:t.monthly,yearly:t.yearly};

  const loadData = useCallback(async () => {
    if(isDemoMode||!creds?.token) { setTodos(demoData()); setLoading(false); return; }
    setLoading(true);
    try {
      const range = getRange(filter, null, null);
      const data  = await apiFetch('/api/log',{method:'POST',body:JSON.stringify({startDate:range.start,endDate:range.end})},creds,settings);
      setTodos(data.todos||[]);
    } catch {}
    finally { setLoading(false); }
  }, [filter,creds,settings,isDemoMode]);

  useEffect(() => { loadData(); setSelBar(null); }, [loadData]);

  const range   = getRange(filter, null, null);
  const grouped = groupData(todos, range.by);
  const maxMin  = Math.max(...grouped.map(g=>g.min),1);
  const total   = todos.reduce((s,t)=>s+(t.accum||0),0);
  const avg     = grouped.length ? Math.round(total/grouped.length) : 0;

  return (
    <div style={{minHeight:'100%'}}>
      {/* Header with filter icon */}
      <div className="page-header" style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}>
        <div className="page-title">{t.log}</div>
        <button
          onClick={() => setShowFilter(true)}
          style={{
            width:38, height:38, borderRadius:'var(--r)',
            background:'var(--bg3)',
            border:'none', cursor:'pointer', marginBottom:4,
            display:'flex', alignItems:'center', justifyContent:'center',
            flexShrink: 0,
          }}
        >
          <FunnelSimple size={18} weight="bold" color="var(--text3)" />
        </button>
      </div>

      <div style={{padding:'0 16px 32px'}}>
        <div className="seg mb-16">
          <button className={`seg-btn ${viewMode==='stats'?'on':''}`} onClick={() => setViewMode('stats')}>통계</button>
          <button className={`seg-btn ${viewMode==='timetable'?'on':''}`} onClick={() => setViewMode('timetable')}>시간표</button>
        </div>

        {viewMode === 'timetable' ? (
          <div className="card card-p" style={{ textAlign:'center', padding:'40px 20px', fontSize:17, fontWeight:700, color:'var(--text3)' }}>
            시간표 기능은 준비중이에요.
          </div>
        ) : (
          <>

        {/* Stats */}
        {!loading && grouped.length>0 && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
            <StatCard label={ko?'총 집중시간':'Total'} value={fmtM(total)}/>
            <StatCard label={ko?'일평균':'Avg/day'}    value={fmtM(avg)}/>
          </div>
        )}

        {/* Chart */}
        <div className="card card-p mb-14">
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:40}}>
              <div className="spin spin-dark"/>
            </div>
          ) : grouped.length===0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
              <div style={{marginBottom:8, display:'flex', justifyContent:'center'}}>
                <ChartLineDown size={36} weight="duotone" color="var(--text3)" />
              </div>
              <div style={{fontWeight:700}}>{t.noData}</div>
            </div>
          ) : (
            <BarChart data={grouped} by={range.by} maxMin={maxMin} locale={locale} sel={selBar} onSel={setSelBar}/>
          )}
        </div>

        {/* Bar detail */}
        {selBar && (
          <div className="card card-p slide-in">
            <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:'var(--text)'}}>
              {barLabel(selBar.k,range.by,locale)} · {fmtM(selBar.min)}
            </div>
            {selBar.todos.map(todo=>(
              <div key={todo.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'.5px solid var(--sep)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
                  <div style={{width:7,height:7,borderRadius:4,background:todo.done?'var(--green)':'var(--text4)',flexShrink:0}}/>
                  <span style={{fontSize:17,fontWeight:700,color:'var(--text)'}} className="truncate">{todo.name}</span>
                </div>
                <span style={{fontSize:16,color:'var(--text3)',fontWeight:700,flexShrink:0,marginLeft:8}}>{fmtM(todo.accum)}</span>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>

      {/* ── Filter sheet ── */}
      {showFilter && (
        <PopupDialog
          title={ko ? '기간 선택' : 'Select period'}
          message={
            <div className="stack-sm">
              {FILTERS.map((f) => (
                <button key={f} className="btn btn-muted btn-md w-full" style={{justifyContent:'space-between'}} onClick={() => { setFilter(f); setShowFilter(false); }}>
                  <span>{fLabels[f]}</span>
                  {filter === f ? <Check size={16} weight="bold" /> : null}
                </button>
              ))}
            </div>
          }
          cancelText={t.cancel}
          confirmText={ko ? '닫기' : 'Close'}
          onCancel={() => setShowFilter(false)}
          onConfirm={() => setShowFilter(false)}
        />
      )}
    </div>
  );
}

const StatCard = ({label,value}) => (
  <div className="card card-p" style={{textAlign:'center',padding:'16px 12px'}}>
    <div style={{fontSize:24,fontWeight:800,color:'var(--text)',letterSpacing:'-.5px'}}>{value}</div>
    <div style={{fontSize:12,color:'var(--text3)',fontWeight:700,marginTop:3}}>{label}</div>
  </div>
);

function BarChart({data,by,maxMin,locale,sel,onSel}) {
  const [offset, setOffset] = useState(0);
  const W   = Math.max(10,Math.min(36,Math.floor(280/data.length)));
  const GAP = Math.max(3,Math.min(10,Math.floor(160/data.length)));
  const H   = 140;
  const windowSize = by === 'day' ? 12 : data.length;
  const maxOffset = Math.max(0, data.length - windowSize);
  const sliced = data.slice(offset, offset + windowSize);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:11,color:'var(--text4)',fontWeight:700}}>{fmtM(maxMin)}</div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn btn-muted btn-sm" onClick={() => setOffset(v => Math.max(0, v - 1))} disabled={offset === 0}>
            <CaretLeft size={14} weight="bold" />
          </button>
          <button className="btn btn-muted btn-sm" onClick={() => setOffset(v => Math.min(maxOffset, v + 1))} disabled={offset >= maxOffset}>
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'flex-end',gap:GAP,height:H+28,overflowX:'auto',paddingBottom:4}}>
        {sliced.map(item => {
          const pct=maxMin>0?item.min/maxMin:0;
          const barH=Math.max(4,Math.round(pct*H));
          const isSel=sel?.k===item.k;
          return (
            <div key={item.k} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',flexShrink:0}} onClick={()=>onSel(isSel?null:item)}>
              <div style={{fontSize:10,fontWeight:800,color:isSel?'var(--text)':'transparent',marginBottom:2,whiteSpace:'nowrap'}}>
                {isSel?fmtM(item.min):''}
              </div>
              <div style={{width:W,height:barH,borderRadius:'6px 6px 0 0',background:isSel?'var(--text)':'var(--bg3)',transition:'height .3s ease,background .2s',opacity:item.min===0?.2:1}}/>
              <div style={{fontSize:10,color:isSel?'var(--text)':'var(--text4)',fontWeight:700,whiteSpace:'nowrap',transform:sliced.length>10?'rotate(-40deg)':'none',transformOrigin:'top center'}}>
                {barLabel(item.k,by,locale)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
