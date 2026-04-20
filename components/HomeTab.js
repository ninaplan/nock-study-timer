'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTimer } from './lib/useTimer';
import { apiFetch } from './lib/apiClient';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';

const fmtMin = (m, ko) => {
  if (!m) return ko ? '0분' : '0m';
  const h = Math.floor(m/60), r = m%60;
  if (ko) { if(h&&r) return `${h}시간 ${r}분`; if(h) return `${h}시간`; return `${r}분`; }
  if(h&&r) return `${h}h ${r}m`; if(h) return `${h}h`; return `${r}m`;
};
const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate = (lo) => {
  const d = new Date();
  if (lo==='ko') return `${d.getMonth()+1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  return d.toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric'});
};
const PAUSED_KEY = 'nock_timer_paused';
const TAB_H = 84;

export default function HomeTab({ t, creds, settings, isDemoMode }) {
  const [todos, setTodos]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [sheet, setSheet]           = useState(null);
  const [saving, setSaving]         = useState(false);
  const [reportId, setReportId]     = useState(null);
  const [paused, setPausedRaw]      = useState(null);
  const [fabOpen, setFabOpen]       = useState(false);
  // Pull-to-refresh
  const [ptrState, setPtrState]     = useState('idle'); // idle | pulling | refreshing
  const [ptrY, setPtrY]             = useState(0);
  const scrollRef   = useRef(null);
  const touchStartY = useRef(null);
  const PTR_THRESHOLD = 64;

  const locale = settings?.lang || 'ko';
  const ko     = locale === 'ko';
  const timer  = useTimer();
  const fmt    = (m) => fmtMin(m, ko);

  const setPaused = (v) => {
    setPausedRaw(v);
    if (v) localStorage.setItem(PAUSED_KEY, JSON.stringify(v));
    else localStorage.removeItem(PAUSED_KEY);
  };

  useEffect(() => {
    try { const r = localStorage.getItem(PAUSED_KEY); if(r) setPausedRaw(JSON.parse(r)); } catch {}
  }, []);

  const fetchTodos = useCallback(async (isRefresh=false) => {
    if (isDemoMode || !creds?.token) {
      setTodos([
        {id:'1',name:'운영체제 강의 듣기',date:todayStr(),done:false,accum:45},
        {id:'2',name:'알고리즘 문제 풀기', date:todayStr(),done:true, accum:90},
        {id:'3',name:'영어 단어 외우기',   date:todayStr(),done:false,accum:0 },
      ]);
      setLoading(false); return;
    }
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch(`/api/todos?date=${todayStr()}`, {method:'GET'}, creds, settings);
      setTodos(data.todos || []);
    } catch (e) { console.error('fetchTodos:', e.message); }
    finally { setLoading(false); setPtrState('idle'); setPtrY(0); }
  }, [creds, settings, isDemoMode]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // Pull-to-refresh handlers
  const onTouchStart = (e) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 2) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy <= 0) { touchStartY.current = null; return; }
    e.preventDefault?.();
    const clamped = Math.min(dy, PTR_THRESHOLD * 1.5);
    setPtrY(clamped);
    setPtrState(clamped >= PTR_THRESHOLD ? 'pulling' : 'idle');
  };
  const onTouchEnd = () => {
    if (ptrY >= PTR_THRESHOLD) {
      setPtrState('refreshing');
      fetchTodos(true);
    } else {
      setPtrState('idle');
      setPtrY(0);
    }
    touchStartY.current = null;
  };

  const totalMin  = todos.reduce((s,t) => s+(t.accum||0), 0);
  const doneCount = todos.filter(t => t.done).length;
  const pct       = todos.length ? Math.round(doneCount/todos.length*100) : 0;
  const selected  = todos.find(t => t.id===selectedId);
  const isRunning = timer.isRunning && timer.activeId===selectedId;
  const isPaused  = !timer.isRunning && paused?.todoId===selectedId;
  const showBar   = !!selected;

  const handleSelect = (todo) => { setSelectedId(p=>p===todo.id?null:todo.id); setFabOpen(false); };

  const handleStart = () => {
    if (!selected) return;
    const base = isPaused ? (paused.savedAccum??selected.accum??0) : (selected.accum??0);
    if (isPaused) setPaused(null);
    if (timer.isRunning && timer.activeId!==selected.id) { const r=timer.stop(); if(r) silentSave(r.todoId,r.totalMin); }
    timer.start(selected.id, base);
  };

  const handlePause = async () => {
    const r = timer.stop(); if (!r) return;
    setPaused({todoId:r.todoId, savedAccum:r.totalMin});
    await silentSave(r.todoId, r.totalMin);
    setTodos(p=>p.map(t=>t.id===r.todoId?{...t,accum:r.totalMin}:t));
  };

  const handleComplete = async (todoId) => {
    const todo = todoId ? todos.find(t=>t.id===todoId) : selected;
    if (!todo) return;
    const isCur = todo.id===selectedId;
    let fin = todo.accum||0;
    if (isCur && isRunning)  { const r=timer.stop(); if(r) fin=r.totalMin; }
    else if (isCur && isPaused) { fin=paused.savedAccum??todo.accum??0; setPaused(null); }
    setTodos(p=>p.map(t=>t.id===todo.id?{...t,done:true,accum:fin}:t));
    if (isCur) setSelectedId(null);
    if (isDemoMode||!creds?.token) return;
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${todo.id}`,{method:'PATCH',body:JSON.stringify({done:true,accum:fin})},creds,settings);
      await syncReport();
    } catch {}
    finally { setSaving(false); }
  };

  const handleToggleDone = async (todo, e) => {
    e?.stopPropagation();
    const nd = !todo.done;
    setTodos(p=>p.map(t=>t.id===todo.id?{...t,done:nd}:t));
    if (isDemoMode||!creds?.token) return;
    try { await apiFetch(`/api/todos/${todo.id}`,{method:'PATCH',body:JSON.stringify({done:nd})},creds,settings); } catch {}
  };

  const handleDelete = async (todoId) => {
    setTodos(p=>p.filter(t=>t.id!==todoId));
    if (selectedId===todoId) setSelectedId(null);
    if (timer.activeId===todoId) timer.stop();
    if (isDemoMode||!creds?.token) return;
    try { await apiFetch(`/api/todos/${todoId}`,{method:'DELETE'},creds,settings); } catch {}
  };

  const silentSave = async (id, min) => {
    if (isDemoMode||!creds?.token) return;
    try { await apiFetch(`/api/todos/${id}`,{method:'PATCH',body:JSON.stringify({accum:min})},creds,settings); } catch {}
  };

  const syncReport = async () => {
    if (!creds?.dbReport) return;
    try {
      const rd = await apiFetch(`/api/reports?date=${todayStr()}`,{method:'GET'},creds,settings);
      if (rd.report) {
        const ft = await apiFetch(`/api/todos?date=${todayStr()}`,{method:'GET'},creds,settings);
        const tot = (ft.todos||[]).reduce((s,t)=>s+(t.accum||0),0);
        await apiFetch(`/api/reports/${rd.report.id}`,{method:'PATCH',body:JSON.stringify({totalMin:tot})},creds,settings);
        setReportId(rd.report.id);
      }
    } catch {}
  };

  const handleAddTodo = async (name, date) => {
    if (isDemoMode||!creds?.token) {
      setTodos(p=>[...p,{id:String(Date.now()),name,date,done:false,accum:0}]);
      setSheet(null); return;
    }
    try {
      const data = await apiFetch('/api/todos',{method:'POST',body:JSON.stringify({name,date})},creds,settings);
      if (data.todo?.date===todayStr()) setTodos(p=>[...p,data.todo]);
      setSheet(null);
    } catch (e) { alert('저장 실패: '+e.message); }
  };

  const handleSaveFeedback = async (text) => {
    if (isDemoMode||!creds?.token) { setSheet(null); return; }
    try {
      let rid = reportId;
      if (!rid) { const rd=await apiFetch(`/api/reports?date=${todayStr()}`,{method:'GET'},creds,settings); rid=rd.report?.id; }
      if (!rid) { const cr=await apiFetch('/api/reports',{method:'POST',body:JSON.stringify({date:todayStr()})},creds,settings); rid=cr.report?.id; }
      if (rid) { await apiFetch(`/api/reports/${rid}`,{method:'PATCH',body:JSON.stringify({review:text})},creds,settings); setReportId(rid); }
      setSheet(null);
    } catch (e) { alert('저장 실패: '+e.message); }
  };

  const liveAccum = isRunning ? timer.baseAccum+timer.sessionMin : isPaused ? (paused?.savedAccum??selected?.accum??0) : null;
  const fabBottom = showBar ? TAB_H+74 : TAB_H+16;

  // PTR visual transform
  const ptrProgress = Math.min(ptrY/PTR_THRESHOLD, 1);

  return (
    <div
      ref={scrollRef}
      style={{ minHeight:'100%', paddingBottom: showBar ? 80 : 24, transform: ptrState!=='idle' ? `translateY(${Math.min(ptrY*0.4, 28)}px)` : 'none', transition: ptrState==='idle' ? 'transform .3s' : 'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(ptrState==='pulling'||ptrState==='refreshing') && (
        <div className="ptr-wrap">
          {ptrState==='refreshing' ? (
            <div className="spin spin-dark" style={{width:20,height:20}} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5"
              style={{transform:`rotate(${ptrProgress*180}deg)`,transition:'transform .1s'}}>
              <path d="M12 5v14M5 12l7-7 7 7"/>
            </svg>
          )}
          <span className="ptr-text">
            {ptrState==='refreshing' ? (ko?'새로고침 중...':'Refreshing...') : (ko?'당겨서 새로고침':'Pull to refresh')}
          </span>
        </div>
      )}

      {/* ── Header centered ── */}
      <div style={{textAlign:'center', padding:'52px 24px 16px'}}>
        <div style={{fontSize:13, color:'var(--text3)', fontWeight:700, marginBottom:8}}>
          {fmtDate(locale)}
        </div>
        <div style={{fontSize:60, fontWeight:900, letterSpacing:'-2px', color:'var(--text)', lineHeight:1, fontVariantNumeric:'tabular-nums', marginBottom:8}}>
          {fmt(totalMin+(isRunning?timer.sessionMin:0))}
        </div>
        {isRunning && (
          <div style={{fontSize:15, color:'var(--text)', fontWeight:800, fontVariantNumeric:'tabular-nums', marginBottom:4, opacity:.55, animation:'pulse 2s ease-in-out infinite'}}>
            ● {timer.formatElapsed()}
          </div>
        )}
        {isPaused && (
          <div style={{fontSize:13, color:'var(--orange)', fontWeight:700, marginBottom:4}}>
            ⏸ {ko?'일시정지':'Paused'}
          </div>
        )}
        {todos.length>0 && (
          <>
            <div style={{fontSize:14, color:'var(--text3)', fontWeight:600, marginBottom:10}}>
              {ko?`${todos.length}개 중 ${doneCount}개 완료 · ${pct}%`:`${doneCount} of ${todos.length} done · ${pct}%`}
            </div>
            <div className="prog" style={{maxWidth:160,margin:'0 auto'}}>
              <div className="prog-fill" style={{width:`${pct}%`}} />
            </div>
          </>
        )}
      </div>

      {/* ── Todo list ── */}
      <div style={{padding:'4px 14px'}}>
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:56}}>
            <div className="spin spin-dark" style={{width:24,height:24}} />
          </div>
        ) : todos.length===0 ? (
          <div style={{textAlign:'center',padding:'56px 24px'}}>
            <div style={{fontSize:52,marginBottom:12}}>📋</div>
            <div style={{color:'var(--text3)',fontWeight:700,marginBottom:20}}>{t.noTodos}</div>
            <button className="btn btn-dark btn-md" onClick={()=>setSheet('add')}>{t.addFirst}</button>
          </div>
        ) : (
          <div className="stack-sm">
            {todos.map((todo,i) => (
              <SwipeCard
                key={todo.id}
                todo={todo} ko={ko} fmt={fmt}
                selected={selectedId===todo.id}
                isRunning={timer.isRunning&&timer.activeId===todo.id}
                isPaused={!timer.isRunning&&paused?.todoId===todo.id}
                liveAccum={timer.activeId===todo.id?liveAccum:null}
                liveDisplay={timer.activeId===todo.id&&isRunning?timer.formatElapsed():null}
                onClick={()=>handleSelect(todo)}
                onComplete={()=>handleComplete(todo.id)}
                onDelete={()=>handleDelete(todo.id)}
                delay={i*35}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Action bar ── */}
      {showBar && (
        <div className="action-bar" style={{bottom:TAB_H}}>
          {isRunning ? (
            <>
              <button className="btn btn-muted btn-md flex-1" onClick={handlePause} disabled={saving}>⏸ {ko?'일시정지':'Pause'}</button>
              <button className="btn btn-green btn-md flex-1" onClick={()=>handleComplete()} disabled={saving}>{saving?<span className="spin"/>:`✓ ${t.complete}`}</button>
            </>
          ) : isPaused ? (
            <>
              <button className="btn btn-dark btn-md flex-1" onClick={handleStart}>▶ {ko?'재개':'Resume'}</button>
              <button className="btn btn-green btn-md flex-1" onClick={()=>handleComplete()} disabled={saving}>{saving?<span className="spin"/>:`✓ ${t.complete}`}</button>
            </>
          ) : (
            <>
              <button className="btn btn-dark btn-md flex-1" onClick={handleStart}>▶ {t.start}</button>
              {!selected?.done && <button className="btn btn-muted btn-md flex-1" onClick={()=>handleComplete()} disabled={saving}>{saving?<span className="spin spin-dark"/>:`✓ ${t.complete}`}</button>}
            </>
          )}
        </div>
      )}

      {/* ── FAB ── */}
      <div className="fab-wrap" style={{bottom:fabBottom}}>
        {fabOpen && (
          <div className="fab-menu pop-in">
            <button className="fab-item" onClick={()=>{setSheet('feedback');setFabOpen(false);}}>{ko?'피드백 기록':'Feedback'}</button>
            <button className="fab-item" onClick={()=>{setSheet('add');setFabOpen(false);}}>{ko?'할 일 추가':'Add task'}</button>
          </div>
        )}
        <button className={`fab ${fabOpen?'open':''}`} onClick={()=>setFabOpen(o=>!o)}>+</button>
      </div>
      {fabOpen && <div style={{position:'fixed',inset:0,zIndex:85}} onClick={()=>setFabOpen(false)}/>}

      {sheet==='add'      && <AddTodoSheet  t={t} onSave={handleAddTodo}     onClose={()=>setSheet(null)}/>}
      {sheet==='feedback' && <FeedbackSheet t={t} isDemoMode={isDemoMode}    onSave={handleSaveFeedback} onClose={()=>setSheet(null)}/>}
    </div>
  );
}

function SwipeCard({todo, ko, fmt, selected, isRunning, isPaused, liveAccum, liveDisplay, onClick, onComplete, onDelete, delay}) {
  const [sx, setSx]   = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(null);
  const displayAccum = liveAccum!==null ? liveAccum : (todo.accum||0);
  const SNAP = 72;

  const tStart = (e) => { startX.current=e.touches[0].clientX; setDrag(false); };
  const tMove  = (e) => {
    if (startX.current===null) return;
    const dx=e.touches[0].clientX-startX.current;
    if (Math.abs(dx)>6) setDrag(true);
    setSx(Math.min(72, Math.max(-112, dx)));
  };
  const tEnd = () => {
    if (sx<-SNAP) setSx(-112); else if (sx>SNAP*.65) setSx(72); else setSx(0);
    startX.current=null; setTimeout(()=>setDrag(false),60);
  };
  const click = () => { if(sx!==0){setSx(0);return;} if(!drag) onClick(); };

  return (
    <div style={{position:'relative',borderRadius:18,overflow:'hidden',animationDelay:`${delay}ms`}} className="slide-in">
      {/* Left: complete */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:72,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <button onClick={()=>{setSx(0);onComplete();}} style={{width:48,height:48,borderRadius:24,border:'none',background:'var(--green)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
      </div>
      {/* Right: delete */}
      <div style={{position:'absolute',right:0,top:0,bottom:0,width:112,display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:12}}>
        <button onClick={()=>{setSx(0);onDelete();}} style={{width:48,height:48,borderRadius:24,border:'none',background:'var(--red)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      {/* Card */}
      <div
        className="card card-p"
        style={{opacity:todo.done?.5:1, cursor:'pointer', transform:`translateX(${sx}px)`, transition:drag?'none':'transform .28s cubic-bezier(.32,.72,0,1)', position:'relative', zIndex:1, border:selected?'2px solid var(--text)':'2px solid transparent'}}
        onClick={click} onTouchStart={tStart} onTouchMove={tMove} onTouchEnd={tEnd}
      >
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div className={`chk ${todo.done?'done':''}`} onClick={e=>{e.stopPropagation();onComplete();}}>
            {todo.done&&<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:15,color:'var(--text)',textDecoration:todo.done?'line-through':'none',marginBottom:2,opacity:todo.done?.5:1}} className="truncate">{todo.name}</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {isRunning&&liveDisplay&&<span style={{fontSize:13,fontWeight:800,color:'var(--text)',fontVariantNumeric:'tabular-nums',opacity:.55,animation:'pulse 1.8s ease-in-out infinite'}}>● {liveDisplay}</span>}
              {isPaused&&<span style={{fontSize:12,color:'var(--orange)',fontWeight:700}}>⏸</span>}
              {displayAccum>0&&<span style={{fontSize:13,color:'var(--text3)',fontWeight:700}}>{fmt(displayAccum)}</span>}
            </div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text4)" style={{transform:selected?'rotate(90deg)':'none',transition:'transform .2s',flexShrink:0}}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
