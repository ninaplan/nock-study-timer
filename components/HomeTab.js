'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, Check, Trash2, Pause, Play, TriangleAlert, ClipboardList, Pencil, ChevronRight } from 'lucide-react';
import { useTimer } from './lib/useTimer';
import { apiFetch } from './lib/apiClient';
import { localDateKey } from '@/app/lib/dateUtils';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';
import PopupDialog from './PopupDialog';

// ── Utils ─────────────────────────────────────────────────────
const fmtMin = (m, ko) => {
  if (!m) return ko ? '0분' : '0m';
  const h = Math.floor(m/60), r = m%60;
  if (ko) { if(h&&r) return `${h}시간 ${r}분`; if(h) return `${h}시간`; return `${r}분`; }
  if(h&&r) return `${h}h ${r}m`; if(h) return `${h}h`; return `${r}m`;
};
const todayStr = () => localDateKey();
const fmtDate  = (lo) => {
  const d = new Date();
  if (lo === 'ko') return `${d.getMonth()+1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
};
const fmtHM = (sec) => {
  const totalSec = Math.max(0, Number(sec) || 0);
  const min = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([20]);
    }
  } catch {}
}

export default function HomeTab({ t, creds, settings, isDemoMode, onSheetOpenChange }) {
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
  const [confirmDelete, setConfirmDelete] = useState(null); // { todoId, todoName }
  const [popupError, setPopupError] = useState('');
  const [feedbackInitialText, setFeedbackInitialText] = useState('');
  const [feedbackMemoText, setFeedbackMemoText] = useState('');
  const [editingTodo, setEditingTodo] = useState(null); // { id, name, date } | null

  const pullStartY = useRef(null);
  const locale = settings?.lang || 'ko';
  const ko     = locale === 'ko';
  const timer  = useTimer();
  const fmt    = (m) => fmtMin(m, ko);
  const updateTodos = (updater) => {
    setTodos((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveCache(todayStr(), next);
      return next;
    });
  };

  const setPaused = (v) => {
    setPausedRaw(v);
    if (v) localStorage.setItem(PAUSED_KEY, JSON.stringify(v));
    else   localStorage.removeItem(PAUSED_KEY);
  };

  useEffect(() => {
    try { const r = localStorage.getItem(PAUSED_KEY); if(r) setPausedRaw(JSON.parse(r)); } catch {}
  }, []);

  useEffect(() => {
    onSheetOpenChange?.(sheet === 'add' || sheet === 'feedback');
    return () => onSheetOpenChange?.(false);
  }, [sheet, onSheetOpenChange]);

  const openEditTodo = (todo) => {
    setFabOpen(false);
    setSelectedId(null);
    setEditingTodo({ id: todo.id, name: todo.name, date: todo.date });
    setSheet('add');
  };

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

  const confirmSwitchTask = () => {
    if (!confirmSwitch) return;
    const nextId = confirmSwitch.newTodoId;
    const r = timer.stop();
    setConfirmSwitch(null);
    setSelectedId(nextId);
    setFabOpen(false);
    if (r) {
      updateTodos((p) => p.map((t) => (t.id === r.todoId ? { ...t, accum: r.totalMin, accumSec: r.totalSec } : t)));
      silentSave(r.todoId, r.totalMin).catch(() => {});
    }
  };

  // ── Timer actions ──────────────────────────────────────────
  const handleStart = () => {
    if (!selected) return;
    const base = isPaused ? (paused.savedAccum ?? selected.accum ?? 0) : (selected.accum ?? 0);
    const baseSec = isPaused ? paused?.savedSec : (Number.isFinite(selected?.accumSec) ? selected.accumSec : null);
    if (isPaused) setPaused(null);
    // Uncheck if done
    if (selected.done) {
      updateTodos(p => p.map(t => t.id === selected.id ? { ...t, done: false } : t));
      if (!isDemoMode && creds?.token) {
        apiFetch(`/api/todos/${selected.id}`, { method:'PATCH', body:JSON.stringify({ done:false }) }, creds, settings).catch(() => {});
      }
    }
    timer.start(selected.id, base, baseSec);
  };

  const handlePause = async () => {
    const r = timer.stop(); if (!r) return;
    setPaused({ todoId:r.todoId, savedAccum:r.totalMin, savedSec:r.totalSec, display: timer.formatElapsedTotal() });
    await silentSave(r.todoId, r.totalMin);
    updateTodos(p => p.map(t => t.id === r.todoId ? { ...t, accum:r.totalMin, accumSec:r.totalSec } : t));
  };

  const handleComplete = async (todoId) => {
    const todo = todoId ? todos.find(t => t.id === todoId) : selected;
    if (!todo) return;
    triggerHaptic();
    const isCur = todo.id === selectedId;
    let fin = todo.accum || 0;
    let finSec = Number.isFinite(todo?.accumSec) ? todo.accumSec : Math.max(0, (todo.accum || 0) * 60);
    if (isCur && isRunning) {
      const r = timer.stop();
      if (r) {
        fin = r.totalMin;
        finSec = r.totalSec;
      }
    } else if (isCur && isPaused) {
      fin = paused.savedAccum ?? todo.accum ?? 0;
      finSec = paused.savedSec ?? Math.max(0, fin * 60);
      setPaused(null);
    }

    const nextDone = !todo.done;
    updateTodos(p => p.map(t => t.id === todo.id ? { ...t, done: nextDone, accum:fin, accumSec:finSec } : t));
    if (isCur) setSelectedId(null);

    if (isDemoMode || !creds?.token) return;
    setSaving(true);
    try {
      await apiFetch(`/api/todos/${todo.id}`, { method:'PATCH', body:JSON.stringify({ done: nextDone, accum:fin }) }, creds, settings);
      await syncReport();
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async (todoId) => {
    triggerHaptic();
    updateTodos(p => p.filter(t => t.id !== todoId));
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

  const handleSaveTodo = async (name, dateInput) => {
    const dateStr = dateInput || todayStr();
    const trimmed = (name || '').trim();

    if (editingTodo) {
      const id = editingTodo.id;
      if (isDemoMode || !creds?.token) {
        updateTodos((p) => {
          if (dateStr !== todayStr()) return p.filter((t) => t.id !== id);
          return p.map((t) => (t.id === id ? { ...t, name: trimmed, date: dateStr } : t));
        });
        setEditingTodo(null);
        setSheet(null);
        return;
      }
      try {
        await apiFetch(
          `/api/todos/${id}`,
          { method: 'PATCH', body: JSON.stringify({ name: trimmed, date: dateStr }) },
          creds,
          settings
        );
        updateTodos((p) => {
          if (dateStr !== todayStr()) return p.filter((t) => t.id !== id);
          return p.map((t) => (t.id === id ? { ...t, name: trimmed, date: dateStr } : t));
        });
        setEditingTodo(null);
        setSheet(null);
      } catch (e) {
        setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message);
      }
      return;
    }

    if (isDemoMode || !creds?.token) {
      updateTodos((p) => [...p, { id: String(Date.now()), name: trimmed, date: dateStr, done: false, accum: 0 }]);
      setSheet(null);
      return;
    }
    const tempId = `tmp-${Date.now()}`;
    const optimisticTodo = {
      id: tempId,
      clientKey: tempId,
      name: trimmed,
      date: dateStr,
      done: false,
      accum: 0,
      isPending: true,
    };
    if (dateStr === todayStr()) updateTodos((p) => [...p, optimisticTodo]);
    setSheet(null);
    try {
      const data = await apiFetch('/api/todos', { method: 'POST', body: JSON.stringify({ name: trimmed, date: dateStr }) }, creds, settings);
      updateTodos((prev) =>
        prev
          .map((t) =>
            t.id === tempId
              ? (data.todo?.date === todayStr()
                ? { ...data.todo, clientKey: t.clientKey }
                : null)
              : t
          )
          .filter(Boolean)
      );
    } catch (e) {
      setPopupError((ko ? '저장 실패: ' : 'Save failed: ') + e.message);
    }
  };

  const handleSaveFeedback = async (text) => {
    if (isDemoMode || !creds?.token) { setSheet(null); return; }
    try {
      let rid = reportId;
      let existingReview = '';
      if (!rid) {
        const rd = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
        rid = rd.report?.id;
        existingReview = rd.report?.review || '';
      }
      if (!rid) { const cr = await apiFetch('/api/reports', { method:'POST', body:JSON.stringify({ date:todayStr() }) }, creds, settings); rid = cr.report?.id; }
      if (rid) {
        if (!existingReview) {
          try {
            const rd2 = await apiFetch(`/api/reports?date=${todayStr()}`, { method:'GET' }, creds, settings);
            existingReview = rd2.report?.review || '';
          } catch {}
        }
        const inputTrim = (text || '').trim();
        // Treat the editor value as source of truth: allow overwrite and full clear.
        const nextReview = inputTrim;
        await apiFetch(`/api/reports/${rid}`, { method:'PATCH', body:JSON.stringify({ review:nextReview }) }, creds, settings);
        setReportId(rid);
        setFeedbackInitialText(nextReview);
        setFeedbackMemoText(nextReview);
      }
      setSheet(null);
    } catch (e) { setPopupError('저장 실패: ' + e.message); }
  };

  const openFeedbackSheet = async () => {
    setFabOpen(false);
    // Open immediately for snappy UX, then hydrate with latest review text.
    setFeedbackInitialText(feedbackMemoText || '');
    setSheet('feedback');
    if (isDemoMode || !creds?.token) {
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

  const liveAccum = isRunning
    ? timer.baseAccum + timer.sessionMin
    : isPaused ? (paused?.savedAccum ?? selected?.accum ?? 0) : null;

  return (
    <div
      style={{ minHeight:'100%', paddingBottom:112 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {pulling && (
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
          <div className="spin spin-dark" />
        </div>
      )}

      {/* ── Header card ── */}
      <div style={{ padding:'40px 14px 8px' }}>
        <div style={{
          background:'var(--bg2)',
          borderRadius:'var(--r)',
          boxShadow:'var(--shadow)',
          padding:'20px 22px',
          textAlign:'center',
        }}>
          <div style={{ fontSize:13, color:'var(--text3)', fontWeight:700, marginBottom:6 }}>
            {fmtDate(locale)}
          </div>
          <div style={{ fontSize:56, fontWeight:900, letterSpacing:'-2px', color:'var(--text)', lineHeight:1, fontVariantNumeric:'tabular-nums', marginBottom:8 }}>
            {fmt(totalMin + (isRunning ? timer.sessionMin : 0))}
          </div>
          {isRunning && (
            <div style={{ fontSize:12, color:'var(--text3)', fontWeight:500, fontVariantNumeric:'tabular-nums', animation:'pulse 2s ease-in-out infinite', marginBottom:4, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span style={{ color:'var(--orange)', fontSize:13 }}>●</span>
              {timer.formatElapsed()}
            </div>
          )}
          {isPaused && (
            <div style={{ fontSize:13, color:'var(--orange)', fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              <Pause size={12} strokeWidth={2.1} /> {ko ? '일시정지' : 'Paused'}
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
        <div style={{ fontSize:15, fontWeight:600, color:'var(--text3)', margin:'6px 4px 10px' }}>
          {ko ? '오늘 집중 할일' : "Today's Focus Tasks"}
        </div>
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 24px', gap:16 }}>
            <div className="spin spin-dark" style={{ width:28, height:28 }} />
            <div style={{ fontSize:14, color:'var(--text3)', fontWeight:600 }}>
              {ko ? '할 일 불러오는 중...' : 'Loading...'}
            </div>
          </div>
        ) : error ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><TriangleAlert size={36} strokeWidth={2.1} color="var(--red)" /></div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--red)', marginBottom:8 }}>{ko ? '불러오기 실패' : 'Failed to load'}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, wordBreak:'break-all', lineHeight:1.6 }}>{error}</div>
            <button className="btn btn-dark btn-sm" onClick={loadTodos}>{ko ? '다시 시도' : 'Retry'}</button>
          </div>
        ) : sortedTodos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 24px' }}>
            <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}><ClipboardList size={48} strokeWidth={2.0} color="var(--text3)" /></div>
            <div style={{ color:'var(--text3)', fontWeight:700, marginBottom:20 }}>{t.noTodos}</div>
            <button className="btn btn-dark btn-md" onClick={() => { setEditingTodo(null); setSheet('add'); }}>{t.addFirst}</button>
          </div>
        ) : (
          <div className="stack-sm">
            {sortedTodos.map((todo, i) => {
              const sel = selectedId === todo.id;
              const run = timer.isRunning && timer.activeId === todo.id;
              const pau = !timer.isRunning && paused?.todoId === todo.id;
              const la  = timer.activeId === todo.id ? liveAccum : null;
              const ld  = run ? timer.formatElapsedTotal() : (pau ? (paused?.display || fmtHM(paused?.savedSec ?? (paused?.savedAccum ?? todo.accum ?? 0) * 60)) : null);

              return (
                <div key={todo.clientKey || todo.id}>
                  <SwipeCard
                    todo={todo} ko={ko} fmt={fmt}
                    selected={sel}
                    isRunning={run}
                    isPaused={pau}
                    liveAccum={la}
                    liveDisplay={ld}
                    onClick={() => handleSelect(todo)}
                    onComplete={() => handleComplete(todo.id)}
                    onEdit={() => openEditTodo(todo)}
                    onDelete={() => setConfirmDelete({ todoId: todo.id, todoName: todo.name })}
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
                          <button className="btn btn-muted btn-md flex-1" onClick={handlePause} disabled={saving} style={{borderRadius:'999px'}}>
                            <Pause size={16} strokeWidth={2.1} /> {ko?'일시정지':'Pause'}
                          </button>
                          <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:'999px'}}>
                            {saving ? <span className="spin"/> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                          </button>
                        </>
                      ) : pau ? (
                        <>
                          <button className="btn btn-dark btn-md flex-1" onClick={handleStart} style={{borderRadius:'999px'}}>
                            <Play size={16} strokeWidth={2.1} /> {ko?'재개':'Resume'}
                          </button>
                          <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:'999px'}}>
                            {saving ? <span className="spin"/> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-dark btn-md flex-1" onClick={handleStart} style={{borderRadius:'999px'}}>
                            <Play size={16} strokeWidth={2.1} /> {t.start}
                          </button>
                          {!todo.done && (
                            <button className="btn btn-green btn-md flex-1" onClick={() => handleComplete()} disabled={saving} style={{borderRadius:'999px'}}>
                              {saving ? <span className="spin spin-dark"/> : <><Check size={16} strokeWidth={2.1} /> {t.complete}</>}
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
      <div className="fab-wrap">
        {fabOpen && (
          <div className="fab-menu pop-in">
            <button className="fab-item" onClick={openFeedbackSheet}>{ko?'하루 회고':'Daily reflection'}</button>
            <button className="fab-item" onClick={() => { setEditingTodo(null); setSheet('add'); setFabOpen(false); }}>{ko?'할 일 추가':'Add task'}</button>
          </div>
        )}
        <button className={`fab ${fabOpen?'open':''}`} onClick={() => setFabOpen(o => !o)}>
          <Plus size={24} strokeWidth={2.1} />
        </button>
      </div>
      {fabOpen && <div style={{ position:'fixed', inset:0, zIndex:85 }} onClick={() => setFabOpen(false)} />}

      {/* ── Confirm switch dialog ── */}
      {confirmSwitch && (
        <PopupDialog
          title={ko ? '측정 중인 할일이 있어요' : 'Timer is running'}
          message={ko ? '현재 측정을 멈추고 다른 할 일로 전환할까요?' : 'Stop the current timer and switch to another task?'}
          cancelText={t.cancel}
          confirmText={ko ? '전환하기' : 'Switch'}
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
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.todoId;
            setConfirmDelete(null);
            handleDelete(id);
          }}
        />
      )}

      {popupError && (
        <PopupDialog
          title={ko ? '오류가 발생했어요' : 'Something went wrong'}
          message={popupError}
          confirmText={ko ? '확인' : 'OK'}
          onCancel={() => setPopupError('')}
          onConfirm={() => setPopupError('')}
          singleAction
        />
      )}

      {/* ── Sheets ── */}
      {sheet === 'add' && (
        <AddTodoSheet
          t={t}
          editingTodo={editingTodo}
          onSave={handleSaveTodo}
          onClose={() => { setSheet(null); setEditingTodo(null); }}
        />
      )}
      {sheet === 'feedback' && <FeedbackSheet t={t} isDemoMode={isDemoMode} initialText={feedbackInitialText} onSave={handleSaveFeedback} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ── SwipeCard with spring-snap swipe ──────────────────────────
// 계속 밀면 늘어났다가 자동 실행
function SwipeCard({ todo, ko, fmt, selected, isRunning, isPaused, liveAccum, liveDisplay, onClick, onComplete, onEdit, onDelete, delay }) {
  const [sx, setSx]     = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const isPointerDown = useRef(false);
  const axisRef = useRef(null); // null | 'h' | 'v'
  const fired  = useRef(false);
  const baseSec = Number.isFinite(todo?.accumSec) ? todo.accumSec : Math.max(0, (todo.accum || 0) * 60);
  const displayAccum = liveAccum !== null ? Math.max(0, liveAccum * 60) : baseSec;

  const MAX_L  = 148; // max px for left action (complete)
  const MAX_R  = 300; // edit + delete (delete can stretch)
  const FIRE_L = 120; // auto-fire threshold left
  const FIRE_R = 176; // auto-fire delete threshold after snap + extra pull
  const EDIT_W = 58;  // wider default edit button
  const SNAP_R = EDIT_W * 2; // show edit/delete at default width

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
      triggerHaptic();
      setSx(0);
      setTimeout(() => onComplete(), 50);
    } else if (cur <= -FIRE_R && !fired.current) {
      fired.current = true;
      triggerHaptic();
      setSx(0);
      setTimeout(() => onDelete(), 50);
    } else if (cur < -(EDIT_W + 36)) {
      // Show both action circles and keep clickable.
      setSx(-SNAP_R);
    } else {
      // If action was not executed, always glide back.
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

  const leftProgress  = Math.min(sx / FIRE_L, 1);
  const rightProgress = Math.min(-sx / FIRE_R, 1);
  const rightReveal = Math.max(0, -sx);
  const leftReveal = Math.max(0, sx);
  // Edit stays fixed circle width once revealed; only delete stretches.
  const editWidth = rightReveal > 0 ? EDIT_W : 0;
  const deleteRawWidth = Math.max(0, rightReveal - EDIT_W);
  // Once delete appears, keep it circular at first, then stretch.
  const deleteWidth = deleteRawWidth > 0 ? Math.max(EDIT_W, deleteRawWidth) : 0;

  return (
    <div style={{ position:'relative', borderRadius:'var(--r)', overflow:'hidden', animationDelay:`${delay}ms` }} className="slide-in">
      {/* Left action: complete */}
      <button
        type="button"
        aria-label={ko ? '완료' : 'Complete'}
        style={{
        position:'absolute', left:0, top:0, bottom:0,
        width: leftReveal,
        border:'none',
        background: `rgba(52, 199, 89, ${0.72 + leftProgress * 0.24})`,
        cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden',
        borderRadius: 999,
        transition: drag ? 'none' : 'width .55s cubic-bezier(.18,.88,.22,1)',
      }}
        onTouchStart={() => triggerHaptic()}
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic();
          setSx(0);
          setTimeout(() => onComplete?.(), 0);
        }}
      >
        <Check size={24} strokeWidth={2.2} color="white" />
      </button>

      {/* Right actions: edit (orange) + delete (red) */}
      <div style={{
        position:'absolute', right:0, top:0, bottom:0,
        width: rightReveal,
        display:'flex', flexDirection:'row',
        overflow:'visible',
        borderRadius: 'var(--r)',
        transition: drag ? 'none' : 'width .55s cubic-bezier(.18,.88,.22,1)',
      }}>
        <button
          type="button"
          aria-label={ko ? '수정' : 'Edit'}
          style={{
            width: editWidth,
            border: 'none',
            cursor: 'pointer',
            background: `rgba(255, 149, 0, ${0.32 + rightProgress * 0.56})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderTopLeftRadius: editWidth > 0 ? 999 : 0,
            borderBottomLeftRadius: editWidth > 0 ? 999 : 0,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
          }}
          onTouchStart={() => triggerHaptic()}
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic();
            setSx(0);
            setTimeout(() => onEdit?.(), 0);
          }}
        >
          <Pencil size={20} strokeWidth={2.2} color="white" />
        </button>
        <button
          type="button"
          aria-label={ko ? '삭제' : 'Delete'}
          style={{
            width: deleteWidth,
            border: 'none',
            cursor: 'pointer',
            background: `rgba(255, 59, 48, ${0.22 + rightProgress * 0.5})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderTopRightRadius: deleteWidth > 0 ? 999 : 0,
            borderBottomRightRadius: deleteWidth > 0 ? 999 : 0,
          }}
          onTouchStart={() => triggerHaptic()}
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic();
            setSx(0);
            setTimeout(() => onDelete?.(), 0);
          }}
        >
          <Trash2 size={22} strokeWidth={2.2} color="white" />
        </button>
      </div>

      {/* Card */}
      <div
        className="card"
        style={{
          touchAction: 'pan-y',
          userSelect: 'none',
          cursor:'pointer',
          transform:`translate3d(${sx}px, 0, 0)`,
          willChange:'transform',
          transition: drag ? 'none' : 'transform .55s cubic-bezier(.18,.88,.22,1)',
          position:'relative', zIndex:1,
          border: selected ? '2px solid var(--text)' : '2px solid transparent',
          padding:'10px 14px',
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
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div className={`chk ${todo.done ? 'done' : ''}`} onClick={e => { e.stopPropagation(); onComplete(); }}>
            {todo.done && <Check size={12} strokeWidth={2.3} color="white" />}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{
              fontWeight:600, fontSize:17, color:'var(--text)',
              opacity: todo.done ? .4 : 1,
              textDecoration: todo.done ? 'line-through' : 'none',
              marginBottom:2,
            }} className="truncate">
              {todo.name}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            </div>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <span
              style={{
                fontSize:12,
                color:'var(--text2)',
                fontWeight:700,
                minWidth:40,
                textAlign:'right',
                background:'var(--bg3)',
                borderRadius:999,
                padding:'4px 10px',
                lineHeight:1,
                display:'inline-flex',
                alignItems:'center',
                gap:4,
              }}
            >
              {(isRunning || isPaused) && liveDisplay ? (
                <>
                  {isPaused ? (
                    <Pause size={12} strokeWidth={2.2} color="var(--orange)" />
                  ) : (
                    <span style={{ color:'var(--orange)', fontSize:12, lineHeight:1 }}>●</span>
                  )}
                  <span style={{ fontVariantNumeric:'tabular-nums' }}>{liveDisplay}</span>
                </>
              ) : (
                fmtHM(displayAccum)
              )}
            </span>
            <ChevronRight
              size={13}
              strokeWidth={2.1}
              color="var(--text4)"
              style={{ transform:selected?'rotate(90deg)':'none', transition:'transform .2s', flexShrink:0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
