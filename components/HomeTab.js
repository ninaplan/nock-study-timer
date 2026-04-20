'use client';
// components/HomeTab.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTimer } from './lib/useTimer';
import { apiFetch } from './lib/apiClient';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';

function formatMin(m) {
  if (!m) return '0분';
  const h = Math.floor(m / 60), min = m % 60;
  if (h > 0 && min > 0) return `${h}시간 ${min}분`;
  if (h > 0) return `${h}시간`;
  return `${min}분`;
}
function formatMinEn(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60), min = m % 60;
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  return `${min}m`;
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(locale) {
  const d = new Date();
  if (locale === 'ko')
    return `${d.getMonth()+1}월 ${d.getDate()}일 ${['일','월','화','수','목','금','토'][d.getDay()]}요일`;
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

const PAUSED_KEY = 'nock_timer_paused';

export default function HomeTab({ t, creds, settings, isDemoMode }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState(null);
  const [pausedState, setPausedState] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const locale = settings?.lang || 'ko';
  const timer = useTimer();
  const fmt = locale === 'ko' ? formatMin : formatMinEn;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PAUSED_KEY);
      if (raw) setPausedState(JSON.parse(raw));
    } catch {}
  }, []);

  const fetchTodos = useCallback(async () => {
    if (isDemoMode || !creds?.token) {
      setTodos([
        { id: '1', name: '운영체제 강의 듣기', date: todayStr(), done: false, accum: 45 },
        { id: '2', name: '알고리즘 문제 풀기', date: todayStr(), done: true, accum: 90 },
        { id: '3', name: '영어 단어 외우기', date: todayStr(), done: false, accum: 0 },
      ]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(`/api/todos?date=${todayStr()}`, { method:'GET' }, creds, settings);
      setTodos(data.todos || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [creds, settings, isDemoMode]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const totalMin = todos.reduce((s, t) => s + (t.accum || 0), 0);
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
  const selected = todos.find((t) => t.id === selectedId);
  const isRunning = timer.isRunning && timer.activeId === selectedId;
  const isPaused = !timer.isRunning && pausedState?.todoId === selectedId;

  const setPaused = (state) => {
    setPausedState(state);
    if (state) localStorage.setItem(PAUSED_KEY, JSON.stringify(state));
    else localStorage.removeItem(PAUSED_KEY);
  };

  const handleSelect = (todo) => {
    setSelectedId((p) => p === todo.id ? null : todo.id);
    setFabOpen(false);
  };

  const handleStart = () => {
    if (!selected) return;
    const baseAccum = isPaused
      ? (pausedState.savedAccum ?? selected.accum ?? 0)
      : (selected.accum ?? 0);
    if (isPaused) setPaused(null);
    if (timer.isRunning && timer.activeId !== selected.id) {
      const r = timer.stop();
      if (r) saveAccumSilent(r.todoId, r.totalMin);
    }
    timer.start(selected.id, baseAccum);
  };

  const handlePause = async () => {
    const r = timer.stop();
    if (!r) return;
    setPaused({ todoId: r.todoId, savedAccum: r.totalMin });
    await saveAccumSilent(r.todoId, r.totalMin);
    setTodos((p) => p.map((t) => t.id === r.todoId ? { ...t, accum: r.totalMin } : t));
  };

  const handleComplete = async () => {
    if (!selected) return;
    let finalAccum = selected.accum || 0;
    if (isRunning) {
      const r = timer.stop();
      if (r) finalAccum = r.totalMin;
    } else if (isPaused) {
      finalAccum = pausedState.savedAccum ?? selected.accum ?? 0;
      setPaused(null);
    }
    if (isDemoMode || !creds?.token) {
      setTodos((p) => p.map((t) => t.id === selected.id ? { ...t, done: true, accum: finalAccum } : t));
      setSelectedId(null);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: true, accum: finalAccum }),
      }, creds, settings);
      setTodos((p) => p.map((t) => t.id === selected.id ? { ...t, done: true, accum: finalAccum } : t));
      setSelectedId(null);
      await updateReportTotal();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleToggleDone = async (todo, e) => {
    e.stopPropagation();
    const newDone = !todo.done;
    if (isDemoMode || !creds?.token) {
      setTodos((p) => p.map((t) => t.id === todo.id ? { ...t, done: newDone } : t));
      return;
    }
    try {
      await apiFetch(`/api/todos/${todo.id}`, { method:'PATCH', body: JSON.stringify({ done: newDone }) }, creds, settings);
      setTodos((p) => p.map((t) => t.id === todo.id ? { ...t, done: newDone } : t));
    } catch {}
  };

  const handleDelete = async (todoId) => {
    setTodos((p) => p.filter((t) => t.id !== todoId));
    if (selectedId === todoId) setSelectedId(null);
    if (isDemoMode || !creds?.token) return;
    try {
      await apiFetch(`/api/todos/${todoId}`, { method: 'DELETE' }, creds, settings);
    } catch {}
  };

  const saveAccumSilent = async (todoId, totalMin) => {
    if (isDemoMode || !creds?.token) return;
    try {
      await apiFetch(`/api/todos/${todoId}`, { method:'PATCH', body: JSON.stringify({ accum: totalMin }) }, creds, settings);
    } catch {}
  };

  const updateReportTotal = async () => {
    if (!creds?.dbReport) return;
    try {
      const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
      const report = rd.report;
      if (report) {
        const ft = await apiFetch(`/api/todos?date=${todayStr()}`, { method:'GET' }, creds, settings);
        const newTotal = (ft.todos || []).reduce((s, t) => s + (t.accum || 0), 0);
        await apiFetch(`/api/reports/${report.id}`, { method:'PATCH', body: JSON.stringify({ totalMin: newTotal }) }, creds, settings);
        setReportId(report.id);
      }
    } catch {}
  };

  const handleAddTodo = async (name, date) => {
    if (isDemoMode || !creds?.token) {
      setTodos((p) => [...p, { id: String(Date.now()), name, date, done: false, accum: 0 }]);
      setSheet(null);
      return;
    }
    try {
      const data = await apiFetch('/api/todos', { method:'POST', body: JSON.stringify({ name, date }) }, creds, settings);
      if (data.todo?.date === todayStr()) setTodos((p) => [...p, data.todo]);
      setSheet(null);
    } catch (e) { console.error(e); }
  };

  const handleSaveFeedback = async (text) => {
    if (isDemoMode || !creds?.token) { setSheet(null); return; }
    try {
      let rid = reportId;
      if (!rid) {
        const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
        rid = rd.report?.id;
      }
      if (rid) await apiFetch(`/api/reports/${rid}`, { method:'PATCH', body: JSON.stringify({ review: text }) }, creds, settings);
      setSheet(null);
    } catch {}
  };

  const liveAccum = isRunning ? timer.baseAccum + timer.sessionMin
    : isPaused ? (pausedState?.savedAccum ?? selected?.accum ?? 0) : null;

  const showBar = !!selected;

  return (
    <div style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="page-header" style={{ background: 'var(--bg)', backdropFilter: 'none', borderBottom: 'none' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>{formatDate(locale)}</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-2px', color: 'var(--text)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(totalMin + (isRunning ? timer.sessionMin : 0))}
        </div>
        {todos.length > 0 && (
          <>
            <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{locale === 'ko' ? `${todos.length}개 중 ${doneCount}개 완료 · ${pct}%` : `${doneCount} of ${todos.length} done · ${pct}%`}</span>
              {isRunning && <span style={{ color: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', fontVariantNumeric: 'tabular-nums' }}>● {timer.formatElapsed()}</span>}
              {isPaused && <span style={{ color: 'var(--orange)' }}>⏸ {locale === 'ko' ? '일시정지' : 'Paused'}</span>}
            </div>
            <div className="progress-track"><div className="progress-fill" style={{ width:`${pct}%` }} /></div>
          </>
        )}
      </div>

      {/* List */}
      <div style={{ padding: '8px 16px', paddingBottom: showBar ? 100 : 24 }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding: 48 }}><div className="spinner" /></div>
        ) : todos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'64px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div style={{ color:'var(--text3)', fontWeight:600, marginBottom:20 }}>{t.noTodos}</div>
            <button className="btn btn-primary" onClick={() => setSheet('add')}>{t.addFirst}</button>
          </div>
        ) : (
          <div className="stack-sm">
            {todos.map((todo, i) => (
              <SwipeCard
                key={todo.id}
                todo={todo}
                locale={locale}
                fmt={fmt}
                selected={selectedId === todo.id}
                isRunning={timer.isRunning && timer.activeId === todo.id}
                isPaused={!timer.isRunning && pausedState?.todoId === todo.id}
                liveAccum={timer.activeId === todo.id ? liveAccum : null}
                liveDisplay={timer.activeId === todo.id && isRunning ? timer.formatElapsed() : null}
                onClick={() => handleSelect(todo)}
                onToggleDone={(e) => handleToggleDone(todo, e)}
                onDelete={() => handleDelete(todo.id)}
                animDelay={i * 40}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action Bar — fixed above tab bar */}
      {showBar && (
        <div style={{
          position:'fixed', bottom:'var(--tab-height)', left:'50%', transform:'translateX(-50%)',
          width:'100%', maxWidth:430,
          background:'var(--surface)', backdropFilter:'blur(20px)',
          borderTop:'1px solid var(--separator)',
          padding:'10px 16px', display:'flex', gap:8, zIndex:30,
          animation:'slideUp 0.25s cubic-bezier(0.32,0.72,0,1)',
        }}>
          {isRunning ? (
            <>
              <button className="btn btn-secondary flex-1" onClick={handlePause} disabled={saving} style={{ fontSize:15 }}>
                ⏸ {locale === 'ko' ? '일시정지' : 'Pause'}
              </button>
              <button className="btn btn-green flex-1" onClick={handleComplete} disabled={saving} style={{ fontSize:15 }}>
                {saving ? <span className="spinner" style={{ borderTopColor:'white' }} /> : `✓ ${t.complete}`}
              </button>
            </>
          ) : isPaused ? (
            <>
              <button className="btn btn-primary flex-1" onClick={handleStart} style={{ fontSize:15 }}>
                ▶ {locale === 'ko' ? '재개' : 'Resume'}
              </button>
              <button className="btn btn-green flex-1" onClick={handleComplete} disabled={saving} style={{ fontSize:15 }}>
                {saving ? <span className="spinner" style={{ borderTopColor:'white' }} /> : `✓ ${t.complete}`}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary flex-1" onClick={handleStart} style={{ fontSize:15 }}>
                ▶ {t.start}
              </button>
              {!selected?.done && (
                <button className="btn btn-secondary flex-1" onClick={handleComplete} disabled={saving} style={{ fontSize:15 }}>
                  {saving ? <span className="spinner" /> : `✓ ${t.complete}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* FAB — dark button, mini menu above */}
      <div style={{
        position:'fixed',
        bottom: `calc(var(--tab-height) + ${showBar ? 72 : 16}px)`,
        right:'calc(50% - 215px + 16px)',
        zIndex:40,
        display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10,
        transition:'bottom 0.25s',
      }}>
        {fabOpen && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end', animation:'slideIn 0.2s ease' }}>
            <MiniMenuItem icon="💬" label={locale === 'ko' ? '피드백' : 'Feedback'} onClick={() => { setSheet('feedback'); setFabOpen(false); }} />
            <MiniMenuItem icon="📝" label={locale === 'ko' ? '할 일 추가' : 'Add task'} onClick={() => { setSheet('add'); setFabOpen(false); }} />
          </div>
        )}
        <button onClick={() => setFabOpen((o) => !o)} style={{
          width:52, height:52, borderRadius:26,
          background:'var(--text)', color:'var(--bg)',
          border:'none', fontSize:24, cursor:'pointer',
          boxShadow:'0 4px 20px rgba(0,0,0,0.25)',
          display:'flex', alignItems:'center', justifyContent:'center',
          transform: fabOpen ? 'rotate(45deg)' : 'none',
          transition:'transform 0.2s',
        }}>+</button>
      </div>

      {fabOpen && <div style={{ position:'fixed', inset:0, zIndex:39 }} onClick={() => setFabOpen(false)} />}

      {sheet === 'add' && <AddTodoSheet t={t} onSave={handleAddTodo} onClose={() => setSheet(null)} />}
      {sheet === 'feedback' && <FeedbackSheet t={t} isDemoMode={isDemoMode} onSave={handleSaveFeedback} onClose={() => setSheet(null)} />}
    </div>
  );
}

function MiniMenuItem({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:8,
      background:'var(--bg2)', border:'none', borderRadius:20,
      padding:'8px 16px 8px 12px', cursor:'pointer',
      fontFamily:'var(--font)', fontSize:14, fontWeight:700, color:'var(--text)',
      boxShadow:'0 2px 12px rgba(0,0,0,0.15)', whiteSpace:'nowrap',
    }}>
      <span style={{ fontSize:18 }}>{icon}</span>{label}
    </button>
  );
}

function SwipeCard({ todo, locale, fmt, selected, isRunning, isPaused, liveAccum, liveDisplay, onClick, onToggleDone, onDelete, animDelay }) {
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(null);
  const displayAccum = liveAccum !== null ? liveAccum : (todo.accum || 0);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; setDragging(false); };
  const onTouchMove = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 6) setDragging(true);
    setSwipeX(Math.min(0, Math.max(-110, dx)));
  };
  const onTouchEnd = () => {
    setSwipeX(swipeX < -55 ? -100 : 0);
    startX.current = null;
    setTimeout(() => setDragging(false), 50);
  };
  const handleClick = () => {
    if (swipeX !== 0) { setSwipeX(0); return; }
    if (!dragging) onClick();
  };

  return (
    <div style={{ position:'relative', borderRadius:16, overflow:'hidden', animationDelay:`${animDelay}ms` }} className="slide-in">
      {/* Delete action */}
      <div style={{ position:'absolute', right:0, top:0, bottom:0, display:'flex' }}>
        <button onClick={onDelete} style={{
          background:'var(--red)', color:'white', border:'none', width:100,
          fontFamily:'var(--font)', fontSize:13, fontWeight:700, cursor:'pointer',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
        }}>
          <span style={{ fontSize:18 }}>🗑️</span>
          {locale === 'ko' ? '삭제' : 'Delete'}
        </button>
      </div>

      {/* Card */}
      <div
        className={`card ${selected ? 'selected' : ''}`}
        style={{
          opacity: todo.done ? 0.55 : 1, cursor:'pointer',
          transform:`translateX(${swipeX}px)`,
          transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          position:'relative', zIndex:1,
        }}
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className={`ios-checkbox ${todo.done ? 'checked' : ''}`} onClick={onToggleDone} style={{ cursor:'pointer' }}>
            {todo.done && <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', textDecoration: todo.done ? 'line-through':'none', marginBottom:3 }} className="truncate">
              {todo.name}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {isRunning && liveDisplay && (
                <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)', fontVariantNumeric:'tabular-nums' }}>● {liveDisplay}</span>
              )}
              {isPaused && <span style={{ fontSize:12, color:'var(--orange)', fontWeight:600 }}>⏸</span>}
              {displayAccum > 0 && <span style={{ fontSize:13, color:'var(--text3)', fontWeight:600 }}>{fmt(displayAccum)}</span>}
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text4)"
            style={{ transform: selected?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
