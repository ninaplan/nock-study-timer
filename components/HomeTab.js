'use client';
import { useState, useEffect, useRef } from 'react';
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
const fmtDate  = (lo) => {
  const d = new Date();
  if (lo === 'ko') return `${d.getMonth()+1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
};
const PAUSED_KEY  = 'nock_timer_paused';
const CACHE_KEY   = 'nock_todos_cache';
const CACHE_TTL   = 5 * 60 * 1000;
function loadCache(d){try{const r=localStorage.getItem(CACHE_KEY);if(!r)return null;const o=JSON.parse(r);if(o.date!==d||Date.now()-o.ts>CACHE_TTL)return null;return o.todos;}catch{return null;}}
function saveCache(d,t){try{localStorage.setItem(CACHE_KEY,JSON.stringify({date:d,todos:t,ts:Date.now()}));}catch{}}
const TAB_H = 84;

export default function HomeTab({ t, creds, settings, isDemoMode }) {
  const [todos,      setTodos]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [sheet,      setSheet]      = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [reportId,   setReportId]   = useState(null);
  const [paused,     setPausedRaw]  = useState(null);
  const [fabOpen,    setFabOpen]    = useState(false);
  const [pulling,    setPulling]    = useState(false);

  const pullStartY = useRef(null);
  const locale = settings?.lang || 'ko';
  const ko     = locale === 'ko';
  const timer  = useTimer();
  const fmt    = (m) => fmtMin(m, ko);

  const setPaused = (v) => {
    setPausedRaw(v);
    if (v) localStorage.setItem(PAUSED_KEY, JSON.stringify(v));
    else   localStorage.removeItem(PAUSED_KEY);
  };

  useEffect(() => {
    try {
      const r = localStorage.getItem(PAUSED_KEY);
      if (r) setPausedRaw(JSON.parse(r));
    } catch {}
  }, []);

  // ── 할일 불러오기 ──────────────────────────────────────────
  const loadTodos = async () => {
    try {
      // 데모 or 크레덴셜 없음 → 샘플 즉시 표시
      const token   = creds ? creds.token   : null;
      const dbTodo  = creds ? creds.dbTodo  : null;

      if (isDemoMode || !token || !dbTodo) {
        setTodos([
          { id:'1', name:'운영체제 강의 듣기', date:todayStr(), done:false, accum:45 },
          { id:'2', name:'알고리즘 문제 풀기',  date:todayStr(), done:true,  accum:90 },
          { id:'3', name:'영어 단어 외우기',    date:todayStr(), done:false, accum:0  },
        ]);
        setLoading(false);
        setPulling(false);
        return;
      }

      const today  = todayStr();
      const cached = loadCache(today);

      if (cached) {
        // 캐시 즉시 표시 후 백그라운드 갱신 (SWR)
        setTodos(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError('');

      const url  = '/api/todos?date=' + today;
      const data = await apiFetch(url, { method: 'GET' }, creds, settings);
      const list = Array.isArray(data.todos) ? data.todos : [];
      saveCache(today, list);
      setTodos(list);
    } catch (e) {
      // Safari compat: e 가 Error 객체가 아닐 수 있음
      const type = (e && e.constructor && e.constructor.name) ? e.constructor.name : 'Error';
      const msg  = (e && e.message) ? e.message : (e ? String(e) : '알 수 없는 오류');
      setError('[' + type + '] ' + msg);
      setTodos([]);
    } finally {
      setLoading(false);
      setPulling(false);
    }
  };

  // 마운트 or creds 변경 시 1번만 실행
  useEffect(() => {
    loadTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.token, creds?.dbTodo, isDemoMode]);

  // Pull-to-refresh
  const onTouchStart = (e) => { pullStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e) => {
    if (pullStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - pullStartY.current;
    pullStartY.current = null;
    if (dy > 60) { setPulling(true); loadTodos(); }
  };

  // ── 파생 상태 ──────────────────────────────────────────────
  const totalMin  = todos.reduce((s,t) => s+(t.accum||0), 0);
  const doneCount = todos.filter(t => t.done).length;
  const pct       = todos.length ? Math.round(doneCount/todos.length*100) : 0;
  const selected  = todos.find(t => t.id === selectedId);
  const isRunning = timer.isRunning && timer.activeId === selectedId;
  const isPaused  = !timer.isRunning && paused?.todoId === selectedId;
  const showBar   = !!selected;

  // ── 타이머 액션 ────────────────────────────────────────────
  const handleStart = () => {
    if (!selected) return;
    const base = isPaused ? (paused.savedAccum ?? selected.accum ?? 0) : (selected.accum ?? 0);
    if (isPaused) setPaused(null);
    if (timer.isRunning && timer.activeId !== selected.id) {
      const r = timer.stop();
      if (r) silentSave(r.todoId, r.totalMin);
    }
    timer.start(selected.id, base);
  };

  const handlePause = async () => {
    const r = timer.stop();
    if (!r) return;
    setPaused({ todoId: r.todoId, savedAccum: r.totalMin });
    await silentSave(r.todoId, r.totalMin);
    setTodos(p => p.map(t => t.id === r.todoId ? { ...t, accum: r.totalMin } : t));
  };

  const handleComplete = async (todoId) => {
    const todo = todoId ? todos.find(t => t.id === todoId) : selected;
    if (!todo) return;
    const isCur = todo.id === selectedId;
    let fin = todo.accum || 0;
    if (isCur && isRunning)  { const r = timer.stop(); if (r) fin = r.totalMin; }
    else if (isCur && isPaused) { fin = paused.savedAccum ?? todo.accum ?? 0; setPaused(null); }

    setTodos(p => p.map(t => t.id === todo.id ? { ...t, done: true, accum: fin } : t));
    if (isCur) setSelectedId(null);

    if (isDemoMode || !creds?.token) return;
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${todo.id}`, {
        method: 'PATCH', body: JSON.stringify({ done: true, accum: fin }),
      }, creds, settings);
      await syncReport();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (todoId) => {
    setTodos(p => p.filter(t => t.id !== todoId));
    if (selectedId === todoId) setSelectedId(null);
    if (timer.activeId === todoId) timer.stop();
    if (isDemoMode || !creds?.token) return;
    try { await apiFetch(`/api/todos/${todoId}`, { method: 'DELETE' }, creds, settings); } catch {}
  };

  const silentSave = async (id, min) => {
    if (isDemoMode || !creds?.token) return;
    try { await apiFetch(`/api/todos/${id}`, { method:'PATCH', body: JSON.stringify({ accum: min }) }, creds, settings); } catch {}
  };

  const syncReport = async () => {
    if (!creds?.dbReport) return;
    try {
      const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
      if (rd.report) {
        const ft  = await apiFetch(`/api/todos?date=${todayStr()}`, { method:'GET' }, creds, settings);
        const tot = (ft.todos || []).reduce((s,t) => s+(t.accum||0), 0);
        await apiFetch(`/api/reports/${rd.report.id}`, { method:'PATCH', body: JSON.stringify({ totalMin: tot }) }, creds, settings);
        setReportId(rd.report.id);
      }
    } catch {}
  };

  const handleAddTodo = async (name, date) => {
    if (isDemoMode || !creds?.token) {
      setTodos(p => [...p, { id: String(Date.now()), name, date, done: false, accum: 0 }]);
      setSheet(null); return;
    }
    try {
      const data = await apiFetch('/api/todos', { method:'POST', body: JSON.stringify({ name, date }) }, creds, settings);
      if (data.todo?.date === todayStr()) setTodos(p => [...p, data.todo]);
      setSheet(null);
    } catch (e) { alert('저장 실패: ' + e.message); }
  };

  const handleSaveFeedback = async (text) => {
    if (isDemoMode || !creds?.token) { setSheet(null); return; }
    try {
      let rid = reportId;
      if (!rid) {
        const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
        rid = rd.report?.id;
      }
      if (!rid) {
        const cr = await apiFetch('/api/reports', { method:'POST', body: JSON.stringify({ date: todayStr() }) }, creds, settings);
        rid = cr.report?.id;
      }
      if (rid) {
        await apiFetch(`/api/reports/${rid}`, { method:'PATCH', body: JSON.stringify({ review: text }) }, creds, settings);
        setReportId(rid);
      }
      setSheet(null);
    } catch (e) { alert('저장 실패: ' + e.message); }
  };

  const liveAccum = isRunning
    ? timer.baseAccum + timer.sessionMin
    : isPaused ? (paused?.savedAccum ?? selected?.accum ?? 0) : null;
  const fabBottom = showBar ? TAB_H + 74 : TAB_H + 16;

  return (
    <div
      style={{ minHeight: '100%', paddingBottom: showBar ? 80 : 24 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      {pulling && (
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
          <div className="spin spin-dark" />
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ textAlign:'center', padding:'52px 24px 16px' }}>
        <div style={{ fontSize:13, color:'var(--text3)', fontWeight:700, marginBottom:8 }}>
          {fmtDate(locale)}
        </div>
        <div style={{ fontSize:60, fontWeight:800, letterSpacing:'-2px', color:'var(--text)', lineHeight:1, fontVariantNumeric:'tabular-nums', marginBottom:8 }}>
          {fmt(totalMin + (isRunning ? timer.sessionMin : 0))}
        </div>
        {isRunning && (
          <div style={{ fontSize:15, color:'var(--text)', fontWeight:700, fontVariantNumeric:'tabular-nums', marginBottom:4, opacity:.55, animation:'pulse 2s ease-in-out infinite' }}>
            ● {timer.formatElapsed()}
          </div>
        )}
        {isPaused && (
          <div style={{ fontSize:13, color:'var(--orange)', fontWeight:700, marginBottom:4 }}>
            ⏸ {ko ? '일시정지' : 'Paused'}
          </div>
        )}
        {todos.length > 0 && (
          <>
            <div style={{ fontSize:14, color:'var(--text3)', fontWeight:600, marginBottom:10 }}>
              {ko ? `${todos.length}개 중 ${doneCount}개 완료 · ${pct}%` : `${doneCount} of ${todos.length} done · ${pct}%`}
            </div>
            <div className="prog" style={{ maxWidth:160, margin:'0 auto' }}>
              <div className="prog-fill" style={{ width:`${pct}%` }} />
            </div>
          </>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding:'4px 14px' }}>
        {loading ? (
          /* 로딩 */
          <div style={{ textAlign:'center', padding:'60px 24px' }}>
            <div className="spin spin-dark" style={{ width:28, height:28, margin:'0 auto 16px' }} />
            <div style={{ fontSize:14, color:'var(--text3)', fontWeight:600 }}>
              {ko ? '할 일 불러오는 중...' : 'Loading...'}
            </div>
          </div>
        ) : error ? (
          /* 에러 */
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--red)', marginBottom:8 }}>
              {ko ? '불러오기 실패' : 'Failed to load'}
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, wordBreak:'break-all', lineHeight:1.6 }}>
              {error}
            </div>
            <button className="btn btn-dark btn-sm" onClick={loadTodos}>
              {ko ? '다시 시도' : 'Retry'}
            </button>
          </div>
        ) : todos.length === 0 ? (
          /* 빈 상태 */
          <div style={{ textAlign:'center', padding:'56px 24px' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>📋</div>
            <div style={{ color:'var(--text3)', fontWeight:700, marginBottom:20 }}>{t.noTodos}</div>
            <button className="btn btn-dark btn-md" onClick={() => setSheet('add')}>{t.addFirst}</button>
          </div>
        ) : (
          /* 할일 목록 */
          <div className="stack-sm">
            {todos.map((todo, i) => (
              <SwipeCard
                key={todo.id}
                todo={todo} ko={ko} fmt={fmt}
                selected={selectedId === todo.id}
                isRunning={timer.isRunning && timer.activeId === todo.id}
                isPaused={!timer.isRunning && paused?.todoId === todo.id}
                liveAccum={timer.activeId === todo.id ? liveAccum : null}
                liveDisplay={timer.activeId === todo.id && isRunning ? timer.formatElapsed() : null}
                onClick={() => setSelectedId(p => p === todo.id ? null : todo.id)}
                onComplete={() => handleComplete(todo.id)}
                onDelete={() => handleDelete(todo.id)}
                delay={i * 35}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Action bar ── */}
      {showBar && (
        <div className="action-bar" style={{ bottom: TAB_H }}>
          {isRunning ? (
            <>
              <button className="btn btn-muted btn-md flex-1" onClick={handlePause} disabled={saving}>⏸ {ko?'일시정지':'Pause'}</button>
              <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving}>
                {saving ? <span className="spin" /> : `✓ ${t.complete}`}
              </button>
            </>
          ) : isPaused ? (
            <>
              <button className="btn btn-dark btn-md flex-1" onClick={handleStart}>▶ {ko?'재개':'Resume'}</button>
              <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving}>
                {saving ? <span className="spin" /> : `✓ ${t.complete}`}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-dark btn-md flex-1" onClick={handleStart}>▶ {t.start}</button>
              {!selected?.done && (
                <button className="btn btn-muted btn-md flex-1" onClick={() => handleComplete()} disabled={saving}>
                  {saving ? <span className="spin spin-dark" /> : `✓ ${t.complete}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── FAB ── */}
      <div className="fab-wrap" style={{ bottom: fabBottom }}>
        {fabOpen && (
          <div className="fab-menu pop-in">
            <button className="fab-item" onClick={() => { setSheet('feedback'); setFabOpen(false); }}>
              {ko ? '피드백 기록' : 'Feedback'}
            </button>
            <button className="fab-item" onClick={() => { setSheet('add'); setFabOpen(false); }}>
              {ko ? '할 일 추가' : 'Add task'}
            </button>
          </div>
        )}
        <button className={`fab ${fabOpen ? 'open' : ''}`} onClick={() => setFabOpen(o => !o)}>+</button>
      </div>
      {fabOpen && <div style={{ position:'fixed', inset:0, zIndex:85 }} onClick={() => setFabOpen(false)} />}

      {/* ── Sheets ── */}
      {sheet === 'add'      && <AddTodoSheet  t={t} onSave={handleAddTodo}     onClose={() => setSheet(null)} />}
      {sheet === 'feedback' && <FeedbackSheet t={t} isDemoMode={isDemoMode}    onSave={handleSaveFeedback}   onClose={() => setSheet(null)} />}
    </div>
  );
}

// ── SwipeCard ────────────────────────────────────────────────
function SwipeCard({ todo, ko, fmt, selected, isRunning, isPaused, liveAccum, liveDisplay, onClick, onComplete, onDelete, delay }) {
  const [sx, setSx]   = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(null);
  const displayAccum = liveAccum !== null ? liveAccum : (todo.accum || 0);
  const SNAP = 70;

  const tStart = (e) => { startX.current = e.touches[0].clientX; setDrag(false); };
  const tMove  = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 6) setDrag(true);
    setSx(Math.min(72, Math.max(-112, dx)));
  };
  const tEnd = () => {
    if (sx < -SNAP) setSx(-112);
    else if (sx > SNAP * 0.6) setSx(72);
    else setSx(0);
    startX.current = null;
    setTimeout(() => setDrag(false), 60);
  };
  const click = () => {
    if (sx !== 0) { setSx(0); return; }
    if (!drag) onClick();
  };

  return (
    <div style={{ position:'relative', borderRadius:18, overflow:'hidden', animationDelay:`${delay}ms` }} className="slide-in">
      {/* Left: complete */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:72, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <button onClick={() => { setSx(0); onComplete(); }} style={{ width:48, height:48, borderRadius:24, border:'none', background:'var(--green)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
      </div>
      {/* Right: delete */}
      <div style={{ position:'absolute', right:0, top:0, bottom:0, width:112, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:12 }}>
        <button onClick={() => { setSx(0); onDelete(); }} style={{ width:48, height:48, borderRadius:24, border:'none', background:'var(--red)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      {/* Card */}
      <div
        className="card card-p"
        style={{ opacity: todo.done ? .5 : 1, cursor:'pointer', transform:`translateX(${sx}px)`, transition: drag ? 'none' : 'transform .28s cubic-bezier(.32,.72,0,1)', position:'relative', zIndex:1, border: selected ? '2px solid var(--text)' : '2px solid transparent' }}
        onClick={click}
        onTouchStart={tStart}
        onTouchMove={tMove}
        onTouchEnd={tEnd}
      >
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div className={`chk ${todo.done ? 'done' : ''}`} onClick={e => { e.stopPropagation(); onComplete(); }}>
            {todo.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', textDecoration: todo.done ? 'line-through' : 'none', marginBottom:2, opacity: todo.done ? .5 : 1 }} className="truncate">
              {todo.name}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {isRunning && liveDisplay && <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', opacity:.55, animation:'pulse 1.8s ease-in-out infinite' }}>● {liveDisplay}</span>}
              {isPaused  && <span style={{ fontSize:12, color:'var(--orange)', fontWeight:700 }}>⏸</span>}
              {displayAccum > 0 && <span style={{ fontSize:13, color:'var(--text3)', fontWeight:700 }}>{fmt(displayAccum)}</span>}
            </div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text4)" style={{ transform: selected ? 'rotate(90deg)' : 'none', transition:'transform .2s', flexShrink:0 }}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
