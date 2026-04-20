'use client';
import { useState, useEffect, useRef } from 'react';
import { useTimer } from './lib/useTimer';
import { apiFetch } from './lib/apiClient';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';

// ── Utils ─────────────────────────────────────────────────────
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

const PAUSED_KEY = 'nock_timer_paused';
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
  // Confirm dialog when switching task while timer is running
  const [confirmSwitch, setConfirmSwitch] = useState(null); // { newTodoId }

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
    try { const r = localStorage.getItem(PAUSED_KEY); if(r) setPausedRaw(JSON.parse(r)); } catch {}
  }, []);

  // ── Load todos ─────────────────────────────────────────────
  const loadTodos = async () => {
    try {
      const token  = creds ? creds.token  : null;
      const dbTodo = creds ? creds.dbTodo : null;

      if (isDemoMode || !token || !dbTodo) {
        setTodos([
          { id:'1', name:'운영체제 강의 듣기', date:todayStr(), done:false, accum:45 },
          { id:'2', name:'알고리즘 문제 풀기',  date:todayStr(), done:true,  accum:90 },
          { id:'3', name:'영어 단어 외우기',    date:todayStr(), done:false, accum:0  },
        ]);
        setLoading(false); setPulling(false); return;
      }

      const today  = todayStr();
      const cached = loadCache(today);
      if (cached) { setTodos(cached); setLoading(false); }
      else        { setLoading(true); }
      setError('');

      const data = await apiFetch('/api/todos?date=' + today, { method:'GET' }, creds, settings);
      const list = Array.isArray(data.todos) ? data.todos : [];
      saveCache(today, list);
      setTodos(list);
    } catch (e) {
      const type = e?.constructor?.name || 'Error';
      const msg  = e?.message || String(e) || '알 수 없는 오류';
      setError('[' + type + '] ' + msg);
    } finally {
      setLoading(false); setPulling(false);
    }
  };

  useEffect(() => { loadTodos(); }, [creds?.token, creds?.dbTodo, isDemoMode]); // eslint-disable-line

  // Pull-to-refresh
  const onTouchStart = (e) => { pullStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e) => {
    if (pullStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - pullStartY.current;
    pullStartY.current = null;
    if (dy > 60) { setPulling(true); loadTodos(); }
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
  const selected  = todos.find(t => t.id === selectedId);
  const isRunning = timer.isRunning && timer.activeId === selectedId;
  const isPaused  = !timer.isRunning && paused?.todoId === selectedId;

  // ── Card selection — ask before switching while timer runs ─
  const handleSelect = (todo) => {
    if (selectedId === todo.id) { setSelectedId(null); return; }
    // Timer is running on a DIFFERENT todo → confirm
    if (timer.isRunning && timer.activeId !== todo.id) {
      setConfirmSwitch({ newTodoId: todo.id });
      return;
    }
    setSelectedId(todo.id);
    setFabOpen(false);
  };

  const confirmSwitchTask = async () => {
    if (!confirmSwitch) return;
    // Stop current timer and save
    const r = timer.stop();
    if (r) await silentSave(r.todoId, r.totalMin);
    setSelectedId(confirmSwitch.newTodoId);
    setConfirmSwitch(null);
    setFabOpen(false);
  };

  // ── Timer actions ──────────────────────────────────────────
  const handleStart = () => {
    if (!selected) return;
    const base = isPaused ? (paused.savedAccum ?? selected.accum ?? 0) : (selected.accum ?? 0);
    if (isPaused) setPaused(null);
    // Uncheck if done
    if (selected.done) {
      setTodos(p => p.map(t => t.id === selected.id ? { ...t, done: false } : t));
      if (!isDemoMode && creds?.token) {
        apiFetch(`/api/todos/${selected.id}`, { method:'PATCH', body:JSON.stringify({ done:false }) }, creds, settings).catch(() => {});
      }
    }
    timer.start(selected.id, base);
  };

  const handlePause = async () => {
    const r = timer.stop(); if (!r) return;
    setPaused({ todoId:r.todoId, savedAccum:r.totalMin });
    await silentSave(r.todoId, r.totalMin);
    setTodos(p => p.map(t => t.id === r.todoId ? { ...t, accum:r.totalMin } : t));
  };

  const handleComplete = async (todoId) => {
    const todo = todoId ? todos.find(t => t.id === todoId) : selected;
    if (!todo) return;
    const isCur = todo.id === selectedId;
    let fin = todo.accum || 0;
    if (isCur && isRunning)       { const r = timer.stop(); if (r) fin = r.totalMin; }
    else if (isCur && isPaused)   { fin = paused.savedAccum ?? todo.accum ?? 0; setPaused(null); }

    setTodos(p => p.map(t => t.id === todo.id ? { ...t, done:true, accum:fin } : t));
    if (isCur) setSelectedId(null);

    if (isDemoMode || !creds?.token) return;
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${todo.id}`, { method:'PATCH', body:JSON.stringify({ done:true, accum:fin }) }, creds, settings);
      await syncReport();
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async (todoId) => {
    setTodos(p => p.filter(t => t.id !== todoId));
    if (selectedId === todoId) setSelectedId(null);
    if (timer.activeId === todoId) timer.stop();
    if (isDemoMode || !creds?.token) return;
    apiFetch(`/api/todos/${todoId}`, { method:'DELETE' }, creds, settings).catch(() => {});
  };

  const silentSave = async (id, min) => {
    if (isDemoMode || !creds?.token) return;
    try { await apiFetch(`/api/todos/${id}`, { method:'PATCH', body:JSON.stringify({ accum:min }) }, creds, settings); } catch {}
  };

  const syncReport = async () => {
    if (!creds?.dbReport) return;
    try {
      const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
      if (rd.report) {
        const ft  = await apiFetch(`/api/todos?date=${todayStr()}`, { method:'GET' }, creds, settings);
        const tot = (ft.todos||[]).reduce((s,t) => s+(t.accum||0), 0);
        await apiFetch(`/api/reports/${rd.report.id}`, { method:'PATCH', body:JSON.stringify({ totalMin:tot }) }, creds, settings);
        setReportId(rd.report.id);
      }
    } catch {}
  };

  const handleAddTodo = async (name, date) => {
    if (isDemoMode || !creds?.token) {
      setTodos(p => [...p, { id:String(Date.now()), name, date, done:false, accum:0 }]);
      setSheet(null); return;
    }
    try {
      const data = await apiFetch('/api/todos', { method:'POST', body:JSON.stringify({ name, date }) }, creds, settings);
      if (data.todo?.date === todayStr()) setTodos(p => [...p, data.todo]);
      setSheet(null);
    } catch (e) { alert('저장 실패: ' + e.message); }
  };

  const handleSaveFeedback = async (text) => {
    if (isDemoMode || !creds?.token) { setSheet(null); return; }
    try {
      let rid = reportId;
      if (!rid) { const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings); rid = rd.report?.id; }
      if (!rid) { const cr = await apiFetch('/api/reports', { method:'POST', body:JSON.stringify({ date:todayStr() }) }, creds, settings); rid = cr.report?.id; }
      if (rid) { await apiFetch(`/api/reports/${rid}`, { method:'PATCH', body:JSON.stringify({ review:text }) }, creds, settings); setReportId(rid); }
      setSheet(null);
    } catch (e) { alert('저장 실패: ' + e.message); }
  };

  const liveAccum = isRunning
    ? timer.baseAccum + timer.sessionMin
    : isPaused ? (paused?.savedAccum ?? selected?.accum ?? 0) : null;

  return (
    <div
      style={{ minHeight:'100%', paddingBottom:100 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {pulling && (
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
          <div className="spin spin-dark" />
        </div>
      )}

      {/* ── Header card ── */}
      <div style={{ padding:'52px 14px 8px' }}>
        <div style={{
          background:'var(--bg2)',
          borderRadius:28,
          boxShadow:'var(--shadow)',
          padding:'20px 22px',
        }}>
          <div style={{ fontSize:13, color:'var(--text3)', fontWeight:700, marginBottom:6 }}>
            {fmtDate(locale)}
          </div>
          <div style={{ fontSize:56, fontWeight:900, letterSpacing:'-2px', color:'var(--text)', lineHeight:1, fontVariantNumeric:'tabular-nums', marginBottom:8 }}>
            {fmt(totalMin + (isRunning ? timer.sessionMin : 0))}
          </div>
          {isRunning && (
            <div style={{ fontSize:14, color:'var(--text)', fontWeight:700, fontVariantNumeric:'tabular-nums', opacity:.55, animation:'pulse 2s ease-in-out infinite', marginBottom:4 }}>
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
              <div className="prog">
                <div className="prog-fill" style={{ width:`${pct}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Todo list ── */}
      <div style={{ padding:'4px 14px' }}>
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 24px', gap:16 }}>
            <div className="spin spin-dark" style={{ width:28, height:28 }} />
            <div style={{ fontSize:14, color:'var(--text3)', fontWeight:600 }}>
              {ko ? '할 일 불러오는 중...' : 'Loading...'}
            </div>
          </div>
        ) : error ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--red)', marginBottom:8 }}>{ko ? '불러오기 실패' : 'Failed to load'}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, wordBreak:'break-all', lineHeight:1.6 }}>{error}</div>
            <button className="btn btn-dark btn-sm" onClick={loadTodos}>{ko ? '다시 시도' : 'Retry'}</button>
          </div>
        ) : sortedTodos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>📋</div>
            <div style={{ color:'var(--text3)', fontWeight:700, marginBottom:20 }}>{t.noTodos}</div>
            <button className="btn btn-dark btn-md" onClick={() => setSheet('add')}>{t.addFirst}</button>
          </div>
        ) : (
          <div className="stack-sm">
            {sortedTodos.map((todo, i) => {
              const sel = selectedId === todo.id;
              const run = timer.isRunning && timer.activeId === todo.id;
              const pau = !timer.isRunning && paused?.todoId === todo.id;
              const la  = timer.activeId === todo.id ? liveAccum : null;
              const ld  = run ? timer.formatElapsed() : null;

              return (
                <div key={todo.id}>
                  <SwipeCard
                    todo={todo} ko={ko} fmt={fmt}
                    selected={sel}
                    isRunning={run}
                    isPaused={pau}
                    liveAccum={la}
                    liveDisplay={ld}
                    onClick={() => handleSelect(todo)}
                    onComplete={() => handleComplete(todo.id)}
                    onDelete={() => handleDelete(todo.id)}
                    delay={i * 30}
                  />
                  {/* Action buttons right below selected card */}
                  {sel && (
                    <div style={{
                      display:'flex', gap:8, marginTop:6,
                      animation:'slideIn .2s cubic-bezier(.32,.72,0,1)',
                    }}>
                      {run ? (
                        <>
                          <button className="btn btn-muted btn-md flex-1" onClick={handlePause} disabled={saving} style={{borderRadius:16}}>
                            ⏸ {ko?'일시정지':'Pause'}
                          </button>
                          <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:16}}>
                            {saving ? <span className="spin"/> : `✓ ${t.complete}`}
                          </button>
                        </>
                      ) : pau ? (
                        <>
                          <button className="btn btn-dark btn-md flex-1" onClick={handleStart} style={{borderRadius:16}}>
                            ▶ {ko?'재개':'Resume'}
                          </button>
                          <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:16}}>
                            {saving ? <span className="spin"/> : `✓ ${t.complete}`}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-dark btn-md flex-1" onClick={handleStart} style={{borderRadius:16}}>
                            ▶ {t.start}
                          </button>
                          {!todo.done && (
                            <button className="btn btn-muted btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:16}}>
                              {saving ? <span className="spin spin-dark"/> : `✓ ${t.complete}`}
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
        )}
      </div>

      {/* ── FAB ── */}
      <div className="fab-wrap" style={{ bottom: TAB_H + 16 }}>
        {fabOpen && (
          <div className="fab-menu pop-in">
            <button className="fab-item" onClick={() => { setSheet('feedback'); setFabOpen(false); }}>{ko?'피드백 기록':'Feedback'}</button>
            <button className="fab-item" onClick={() => { setSheet('add'); setFabOpen(false); }}>{ko?'할 일 추가':'Add task'}</button>
          </div>
        )}
        <button className={`fab ${fabOpen?'open':''}`} onClick={() => setFabOpen(o => !o)}>+</button>
      </div>
      {fabOpen && <div style={{ position:'fixed', inset:0, zIndex:85 }} onClick={() => setFabOpen(false)} />}

      {/* ── Confirm switch dialog ── */}
      {confirmSwitch && (
        <>
          <div className="backdrop" onClick={() => setConfirmSwitch(null)} />
          <div className="sheet">
            <div className="sheet-body" style={{ padding:'24px 20px 8px' }}>
              <div style={{ fontSize:20, fontWeight:900, marginBottom:10 }}>
                {ko ? '측정 중인 할일이 있어요' : 'Timer is running'}
              </div>
              <div style={{ fontSize:15, color:'var(--text3)', lineHeight:1.6 }}>
                {ko
                  ? '현재 측정을 멈추고 다른 할 일로 전환할까요?'
                  : 'Stop the current timer and switch to another task?'}
              </div>
            </div>
            <div className="sheet-footer">
              <button className="btn btn-muted btn-md flex-1" onClick={() => setConfirmSwitch(null)}>
                {t.cancel}
              </button>
              <button className="btn btn-dark btn-md flex-1" onClick={confirmSwitchTask}>
                {ko ? '전환하기' : 'Switch'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Sheets ── */}
      {sheet === 'add'      && <AddTodoSheet  t={t} onSave={handleAddTodo}    onClose={() => setSheet(null)} />}
      {sheet === 'feedback' && <FeedbackSheet t={t} isDemoMode={isDemoMode}   onSave={handleSaveFeedback}   onClose={() => setSheet(null)} />}
    </div>
  );
}

// ── SwipeCard with spring-snap swipe ──────────────────────────
// 계속 밀면 늘어났다가 자동 실행
function SwipeCard({ todo, ko, fmt, selected, isRunning, isPaused, liveAccum, liveDisplay, onClick, onComplete, onDelete, delay }) {
  const [sx, setSx]     = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(null);
  const fired  = useRef(false);
  const displayAccum = liveAccum !== null ? liveAccum : (todo.accum || 0);

  const MAX_L  = 100; // max px for left action (complete)
  const MAX_R  = 130; // max px for right action (delete)
  const FIRE_L = 90;  // auto-fire threshold left
  const FIRE_R = 110; // auto-fire threshold right

  const tStart = (e) => {
    startX.current = e.touches[0].clientX;
    fired.current  = false;
    setDrag(false);
  };
  const tMove = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
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
    // Auto-fire if past threshold
    if (cur >= FIRE_L && !fired.current) {
      fired.current = true;
      setSx(0);
      setTimeout(() => onComplete(), 50);
    } else if (cur <= -FIRE_R && !fired.current) {
      fired.current = true;
      setSx(0);
      setTimeout(() => onDelete(), 50);
    } else if (cur > 50) {
      setSx(70); // snap to reveal
    } else if (cur < -60) {
      setSx(-90); // snap to reveal
    } else {
      setSx(0);
    }
    setTimeout(() => setDrag(false), 60);
  };

  const click = () => {
    if (sx !== 0) { setSx(0); return; }
    if (!drag) onClick();
  };

  // Action reveal visibility
  const showLeft  = sx > 10;
  const showRight = sx < -10;
  const leftProgress  = Math.min(sx / FIRE_L, 1);
  const rightProgress = Math.min(-sx / FIRE_R, 1);

  return (
    <div style={{ position:'relative', borderRadius:24, overflow:'hidden', animationDelay:`${delay}ms` }} className="slide-in">
      {/* Left action: complete */}
      <div style={{
        position:'absolute', left:0, top:0, bottom:0,
        width: Math.max(0, sx),
        background: `rgba(52, 199, 89, ${0.15 + leftProgress * 0.85})`,
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden',
        transition: drag ? 'none' : 'width .28s cubic-bezier(.32,.72,0,1)',
      }}>
        <div style={{ transform:`scale(${0.7 + leftProgress * 0.4})`, transition: drag ? 'none' : 'transform .2s' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </div>
      </div>

      {/* Right action: delete */}
      <div style={{
        position:'absolute', right:0, top:0, bottom:0,
        width: Math.max(0, -sx),
        background: `rgba(255, 59, 48, ${0.15 + rightProgress * 0.85})`,
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden',
        transition: drag ? 'none' : 'width .28s cubic-bezier(.32,.72,0,1)',
      }}>
        <div style={{ transform:`scale(${0.7 + rightProgress * 0.4})`, transition: drag ? 'none' : 'transform .2s' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
      </div>

      {/* Card */}
      <div
        className="card card-p"
        style={{
          cursor:'pointer',
          transform:`translateX(${sx}px)`,
          transition: drag ? 'none' : 'transform .28s cubic-bezier(.32,.72,0,1)',
          position:'relative', zIndex:1,
          border: selected ? '2px solid var(--text)' : '2px solid transparent',
        }}
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
            <div style={{
              fontWeight:700, fontSize:15, color:'var(--text)',
              textDecoration: todo.done ? 'line-through' : 'none',
              marginBottom:2,
            }} className="truncate">
              {todo.name}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {isRunning && liveDisplay && (
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', opacity:.55, animation:'pulse 1.8s ease-in-out infinite' }}>
                  ● {liveDisplay}
                </span>
              )}
              {isPaused && <span style={{ fontSize:12, color:'var(--orange)', fontWeight:700 }}>⏸</span>}
              {displayAccum > 0 && (
                <span style={{ fontSize:13, color:'var(--text3)', fontWeight:700 }}>{fmt(displayAccum)}</span>
              )}
            </div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text4)"
            style={{ transform:selected?'rotate(90deg)':'none', transition:'transform .2s', flexShrink:0 }}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
