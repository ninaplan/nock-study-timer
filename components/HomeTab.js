'use client';
// components/HomeTab.js
import { useState, useEffect, useCallback } from 'react';
import { useTimer, logSession } from './lib/useTimer';
import { apiFetch } from './lib/apiClient';
import AddTodoSheet from './AddTodoSheet';
import FeedbackSheet from './FeedbackSheet';

function formatMin(totalMin) {
  if (!totalMin) return '0분';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function formatMinEn(totalMin) {
  if (!totalMin) return '0m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(locale) {
  const d = new Date();
  if (locale === 'ko') {
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}요일`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function HomeTab({ t, creds, settings, isDemoMode }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [sheet, setSheet] = useState(null); // null | 'add' | 'feedback' | 'fab'
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState(null);
  const locale = settings?.lang || 'ko';

  const timer = useTimer();

  const fmt = locale === 'ko' ? formatMin : formatMinEn;

  const fetchTodos = useCallback(async () => {
    if (isDemoMode || !creds?.token) {
      // Demo data
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
      const data = await apiFetch(
        `/api/todos?date=${todayStr()}`,
        { method: 'GET' },
        creds,
        settings
      );
      setTodos(data.todos || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [creds, settings, isDemoMode]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // Stats
  const totalMin = todos.reduce((s, t) => s + (t.accum || 0), 0);
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;

  // Active todo
  const activeTodo = todos.find((t) => t.id === timer.activeId);
  const selected = todos.find((t) => t.id === selectedId);

  const handleSelect = (todo) => {
    setSelectedId((prev) => (prev === todo.id ? null : todo.id));
  };

  const handleStart = async () => {
    if (!selected) return;
    if (timer.isRunning && timer.activeId !== selected.id) {
      // Stop current timer first
      await handleStop(false);
    }
    timer.start(selected.id, selected.accum || 0);
  };

  const handleStop = async (updateNotion = true) => {
    const result = timer.stop();
    if (!result) return;
    if (isDemoMode || !creds?.token) {
      // Demo: update local state only
      setTodos((prev) =>
        prev.map((t) => (t.id === result.todoId ? { ...t, accum: result.totalMin } : t))
      );
      logSession(result.todoId, activeTodo?.name || '', new Date().toISOString(), new Date().toISOString(), result.totalMin);
      return;
    }
    if (!updateNotion) return;
    setSaving(true);
    try {
      await apiFetch(
        `/api/todos/${result.todoId}`,
        { method: 'PATCH', body: JSON.stringify({ accum: result.totalMin }) },
        creds,
        settings
      );
      setTodos((prev) =>
        prev.map((t) => (t.id === result.todoId ? { ...t, accum: result.totalMin } : t))
      );
      // Update report totalMin
      await updateReportTotal();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!selected) return;
    const wasRunning = timer.activeId === selected.id;
    let finalAccum = selected.accum || 0;

    if (wasRunning) {
      const result = timer.stop();
      if (result) finalAccum = result.totalMin;
    }

    if (isDemoMode || !creds?.token) {
      setTodos((prev) =>
        prev.map((t) => (t.id === selected.id ? { ...t, done: true, accum: finalAccum } : t))
      );
      setSelectedId(null);
      return;
    }

    setSaving(true);
    try {
      await apiFetch(
        `/api/todos/${selected.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ done: true, accum: finalAccum }),
        },
        creds,
        settings
      );
      setTodos((prev) =>
        prev.map((t) =>
          t.id === selected.id ? { ...t, done: true, accum: finalAccum } : t
        )
      );
      setSelectedId(null);
      await updateReportTotal();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const updateReportTotal = async () => {
    if (!creds?.dbReport) return;
    try {
      // Get/find today's report
      const reportData = await apiFetch(
        `/api/reports?date=${todayStr()}`,
        { method: 'GET' },
        creds,
        settings
      );
      const report = reportData.report;
      if (report) {
        const freshTodos = await apiFetch(
          `/api/todos?date=${todayStr()}`,
          { method: 'GET' },
          creds,
          settings
        );
        const newTotal = (freshTodos.todos || []).reduce((s, t) => s + (t.accum || 0), 0);
        await apiFetch(
          `/api/reports/${report.id}`,
          { method: 'PATCH', body: JSON.stringify({ totalMin: newTotal }) },
          creds,
          settings
        );
        setReportId(report.id);
      }
    } catch {}
  };

  const handleAddTodo = async (name, date) => {
    if (isDemoMode || !creds?.token) {
      const newTodo = { id: String(Date.now()), name, date, done: false, accum: 0 };
      setTodos((prev) => [...prev, newTodo]);
      setSheet(null);
      return;
    }
    try {
      const data = await apiFetch(
        '/api/todos',
        { method: 'POST', body: JSON.stringify({ name, date }) },
        creds,
        settings
      );
      if (data.todo?.date === todayStr()) {
        setTodos((prev) => [...prev, data.todo]);
      }
      setSheet(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveFeedback = async (text) => {
    if (isDemoMode || !creds?.token) {
      setSheet(null);
      return;
    }
    try {
      let rid = reportId;
      if (!rid) {
        const reportData = await apiFetch(
          `/api/reports?date=${todayStr()}`,
          { method: 'GET' },
          creds,
          settings
        );
        rid = reportData.report?.id;
      }
      if (rid) {
        await apiFetch(
          `/api/reports/${rid}`,
          { method: 'PATCH', body: JSON.stringify({ review: text }) },
          creds,
          settings
        );
      }
      setSheet(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Current session display time
  const currentDisplay = timer.isRunning ? timer.formatElapsed() : null;
  const currentAccum = timer.isRunning
    ? timer.baseAccum + timer.sessionMin
    : null;

  return (
    <div style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>
          {formatDate(locale)}
        </div>
        <div className="page-title">{t.totalFocusTime}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '-1px',
            color: 'var(--accent)',
            lineHeight: 1
          }}>
            {fmt(totalMin + (timer.isRunning ? timer.sessionMin : 0))}
          </span>
          {timer.isRunning && (
            <span style={{
              fontSize: 13,
              color: 'var(--text3)',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}>
              ● 집중 중
            </span>
          )}
        </div>
        {todos.length > 0 && (
          <div style={{ fontSize: 14, color: 'var(--text3)', marginTop: 6 }}>
            {locale === 'ko'
              ? `${todos.length}개 중 ${doneCount}개 완료 · ${pct}%`
              : `${doneCount} of ${todos.length} done · ${pct}%`}
          </div>
        )}
        {todos.length > 0 && (
          <div className="progress-track" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 16px 8px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="spinner" />
          </div>
        ) : todos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div style={{ color: 'var(--text3)', fontWeight: 600, marginBottom: 20 }}>{t.noTodos}</div>
            <button className="btn btn-primary" onClick={() => setSheet('add')}>
              {t.addFirst}
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            {todos.map((todo, i) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                t={t}
                locale={locale}
                fmt={fmt}
                selected={selectedId === todo.id}
                isRunning={timer.isRunning && timer.activeId === todo.id}
                currentDisplay={timer.activeId === todo.id ? currentDisplay : null}
                currentAccum={timer.activeId === todo.id ? currentAccum : null}
                onClick={() => handleSelect(todo)}
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action Bar (when selected) */}
      {selected && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--surface)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--separator)',
          padding: '12px 16px',
          display: 'flex',
          gap: 10,
          animation: 'slideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
          zIndex: 20,
        }}>
          {timer.isRunning && timer.activeId === selected.id ? (
            <>
              <button
                className="btn btn-secondary flex-1"
                onClick={() => handleStop(true)}
                disabled={saving}
              >
                {saving ? <span className="spinner" /> : `⏸ ${t.pause}`}
              </button>
              <button
                className="btn btn-green flex-1"
                onClick={handleComplete}
                disabled={saving}
              >
                {saving ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : `✓ ${t.complete}`}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-primary flex-1"
                onClick={handleStart}
                disabled={saving}
              >
                ▶ {t.start}
              </button>
              {!selected.done && (
                <button
                  className="btn btn-green flex-1"
                  onClick={handleComplete}
                  disabled={saving}
                >
                  {saving ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : `✓ ${t.complete}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        className={`fab ${sheet === 'fab' ? 'open' : ''}`}
        onClick={() => setSheet(sheet === 'fab' ? null : 'fab')}
        style={{ bottom: selectedId ? 'calc(var(--tab-height) + 76px)' : 'calc(var(--tab-height) + 16px)' }}
      >
        +
      </button>

      {/* FAB Menu */}
      {sheet === 'fab' && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(null)} />
          <div className="sheet" style={{ padding: '8px 16px 40px' }}>
            <div className="sheet-handle" />
            <button
              className="btn btn-secondary btn-full"
              style={{ marginBottom: 10, justifyContent: 'flex-start', gap: 12, fontSize: 16 }}
              onClick={() => setSheet('add')}
            >
              <span style={{ fontSize: 20 }}>📝</span> {t.addTodo}
            </button>
            <button
              className="btn btn-secondary btn-full"
              style={{ justifyContent: 'flex-start', gap: 12, fontSize: 16 }}
              onClick={() => setSheet('feedback')}
            >
              <span style={{ fontSize: 20 }}>💬</span> {t.writeFeedback}
            </button>
          </div>
        </>
      )}

      {/* Add Todo Sheet */}
      {sheet === 'add' && (
        <AddTodoSheet
          t={t}
          onSave={handleAddTodo}
          onClose={() => setSheet(null)}
        />
      )}

      {/* Feedback Sheet */}
      {sheet === 'feedback' && (
        <FeedbackSheet
          t={t}
          isDemoMode={isDemoMode}
          onSave={handleSaveFeedback}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function TodoCard({ todo, t, locale, fmt, selected, isRunning, currentDisplay, currentAccum, onClick, style }) {
  const displayAccum = currentAccum !== null ? currentAccum : (todo.accum || 0);

  return (
    <div
      className={`card pressable slide-in ${selected ? 'selected' : ''}`}
      style={{
        opacity: todo.done ? 0.6 : 1,
        cursor: 'pointer',
        ...style,
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Checkbox */}
        <div className={`ios-checkbox ${todo.done ? 'checked' : ''}`}>
          {todo.done && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text)',
            textDecoration: todo.done ? 'line-through' : 'none',
            marginBottom: 3,
          }} className="truncate">
            {todo.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRunning && currentDisplay ? (
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                ● {currentDisplay}
              </span>
            ) : null}
            {displayAccum > 0 && (
              <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600 }}>
                {fmt(displayAccum)}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="var(--text4)"
          style={{
            transform: selected ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        >
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
        </svg>
      </div>
    </div>
  );
}
