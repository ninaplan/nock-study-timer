'use client';
// components/LogTab.js
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './lib/apiClient';

const FILTERS = ['daily', 'weekly', 'monthly', 'yearly'];

function getDateRange(filter) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (filter === 'daily') {
    // Last 14 days
    const start = new Date(now);
    start.setDate(start.getDate() - 13);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: today,
      groupBy: 'day',
    };
  }
  if (filter === 'weekly') {
    // Last 12 weeks
    const start = new Date(now);
    start.setDate(start.getDate() - 83);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: today,
      groupBy: 'week',
    };
  }
  if (filter === 'monthly') {
    // Last 12 months
    const start = new Date(now);
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: today,
      groupBy: 'month',
    };
  }
  // yearly: last 5 years
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 4);
  start.setMonth(0);
  start.setDate(1);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: today,
    groupBy: 'year',
  };
}

function groupTodos(todos, groupBy) {
  const map = {};
  todos.forEach((todo) => {
    if (!todo.date || !todo.accum) return;
    let key;
    const d = new Date(todo.date);
    if (groupBy === 'day') key = todo.date;
    else if (groupBy === 'week') {
      const monday = new Date(d);
      monday.setDate(d.getDate() - d.getDay() + 1);
      key = monday.toISOString().split('T')[0];
    } else if (groupBy === 'month') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
      key = String(d.getFullYear());
    }
    if (!map[key]) map[key] = { key, totalMin: 0, todos: [] };
    map[key].totalMin += todo.accum;
    map[key].todos.push(todo);
  });
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
}

function formatBarLabel(key, groupBy, locale) {
  if (groupBy === 'day') {
    const d = new Date(key);
    if (locale === 'ko') return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (groupBy === 'week') {
    const d = new Date(key);
    if (locale === 'ko') return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (groupBy === 'month') {
    const [y, m] = key.split('-');
    if (locale === 'ko') return `${parseInt(m)}월`;
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en', { month: 'short' });
  }
  return key;
}

function formatMinShort(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  return `${min}m`;
}

// Demo data
function generateDemoData() {
  const todos = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const sessions = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < sessions; j++) {
      todos.push({
        id: `demo-${i}-${j}`,
        name: ['알고리즘', '운영체제', '영어', '수학', '프로그래밍'][Math.floor(Math.random() * 5)],
        date: dateStr,
        accum: Math.floor(Math.random() * 90) + 10,
        done: Math.random() > 0.3,
      });
    }
  }
  return todos;
}

export default function LogTab({ t, creds, settings, isDemoMode }) {
  const [view, setView] = useState('graph');
  const [filter, setFilter] = useState('daily');
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBar, setSelectedBar] = useState(null);
  const locale = settings?.lang || 'ko';

  const filterLabels = {
    daily: t.daily,
    weekly: t.weekly,
    monthly: t.monthly,
    yearly: t.yearly,
  };

  const fetchData = useCallback(async () => {
    if (isDemoMode || !creds?.token) {
      setTodos(generateDemoData());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(filter);
      const data = await apiFetch(
        '/api/log',
        { method: 'POST', body: JSON.stringify({ startDate, endDate }) },
        creds,
        settings
      );
      setTodos(data.todos || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, creds, settings, isDemoMode]);

  useEffect(() => {
    fetchData();
    setSelectedBar(null);
  }, [fetchData]);

  const { groupBy } = getDateRange(filter);
  const grouped = groupTodos(todos, groupBy);
  const maxMin = Math.max(...grouped.map((g) => g.totalMin), 1);

  const totalAccum = todos.reduce((s, t) => s + (t.accum || 0), 0);
  const avgDaily = grouped.length ? Math.round(totalAccum / grouped.length) : 0;

  return (
    <div style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-title">{t.log}</div>
        <div style={{ marginTop: 12 }}>
          <div className="segment">
            {['graph'].map((v) => (
              <button
                key={v}
                className={`segment-item ${view === v ? 'active' : ''}`}
                onClick={() => setView(v)}
              >
                {t.graphView}
              </button>
            ))}
            <button
              className={`segment-item ${view === 'planner' ? 'active' : ''}`}
              onClick={() => setView('planner')}
            >
              {t.plannerView}
            </button>
          </div>
        </div>
      </div>

      {view === 'graph' ? (
        <GraphView
          t={t}
          locale={locale}
          loading={loading}
          filter={filter}
          setFilter={setFilter}
          filterLabels={filterLabels}
          grouped={grouped}
          groupBy={groupBy}
          maxMin={maxMin}
          selectedBar={selectedBar}
          setSelectedBar={setSelectedBar}
          totalAccum={totalAccum}
          avgDaily={avgDaily}
        />
      ) : (
        <PlannerView t={t} />
      )}
    </div>
  );
}

function GraphView({ t, locale, loading, filter, setFilter, filterLabels, grouped, groupBy, maxMin, selectedBar, setSelectedBar, totalAccum, avgDaily }) {
  return (
    <div style={{ padding: '16px 16px 0' }}>
      {/* Filter tabs */}
      <div className="segment" style={{ marginBottom: 16 }}>
        {Object.entries(filterLabels).map(([key, label]) => (
          <button
            key={key}
            className={`segment-item ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
            style={{ fontSize: 13 }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      {!loading && grouped.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 16,
        }}>
          <StatCard
            label={locale === 'ko' ? '총 집중시간' : 'Total'}
            value={formatMinShort(totalAccum)}
          />
          <StatCard
            label={locale === 'ko' ? '일평균' : 'Daily avg'}
            value={formatMinShort(avgDaily)}
          />
        </div>
      )}

      {/* Chart */}
      <div className="card" style={{ padding: '20px 16px 16px', marginBottom: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
            <div>{t.noData}</div>
          </div>
        ) : (
          <BarChart
            data={grouped}
            groupBy={groupBy}
            maxMin={maxMin}
            locale={locale}
            selectedBar={selectedBar}
            onSelectBar={setSelectedBar}
            formatBarLabel={formatBarLabel}
          />
        )}
      </div>

      {/* Selected bar detail */}
      {selectedBar && (
        <div className="card slide-in" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text)' }}>
            {formatBarLabel(selectedBar.key, groupBy, locale)} · {formatMinShort(selectedBar.totalMin)}
          </div>
          <div className="stack-sm">
            {selectedBar.todos.map((todo) => (
              <div key={todo.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--separator)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: todo.done ? 'var(--green)' : 'var(--text4)',
                    flexShrink: 0
                  }} />
                  <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }} className="truncate">
                    {todo.name}
                  </span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>
                  {formatMinShort(todo.accum)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '14px 12px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function BarChart({ data, groupBy, maxMin, locale, selectedBar, onSelectBar, formatBarLabel }) {
  const BAR_WIDTH = Math.max(12, Math.min(32, Math.floor(280 / data.length)));
  const CHART_HEIGHT = 160;

  return (
    <div>
      {/* Y axis label */}
      <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 8, fontWeight: 600 }}>
        {formatMinShort(maxMin)}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: Math.max(2, Math.floor(8 - data.length / 4)),
        height: CHART_HEIGHT,
        overflowX: 'auto',
        paddingBottom: 4,
      }}>
        {data.map((item) => {
          const heightPct = maxMin > 0 ? item.totalMin / maxMin : 0;
          const isSelected = selectedBar?.key === item.key;
          const barH = Math.max(4, Math.round(heightPct * CHART_HEIGHT));

          return (
            <div
              key={item.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onClick={() => onSelectBar(isSelected ? null : item)}
            >
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: isSelected ? 'var(--accent)' : 'transparent',
                marginBottom: 2,
                whiteSpace: 'nowrap',
              }}>
                {isSelected ? formatMinShort(item.totalMin) : ''}
              </div>
              <div
                style={{
                  width: BAR_WIDTH,
                  height: barH,
                  borderRadius: '4px 4px 0 0',
                  background: isSelected
                    ? 'var(--accent)'
                    : `linear-gradient(180deg, var(--accent) 0%, rgba(0,122,255,0.5) 100%)`,
                  transition: 'height 0.3s ease, background 0.2s',
                  opacity: item.totalMin === 0 ? 0.2 : 1,
                  boxShadow: isSelected ? '0 0 12px rgba(0,122,255,0.4)' : 'none',
                }}
              />
              <div style={{
                fontSize: 10,
                color: isSelected ? 'var(--accent)' : 'var(--text4)',
                fontWeight: 600,
                transform: data.length > 14 ? 'rotate(-45deg)' : 'none',
                transformOrigin: 'top center',
                whiteSpace: 'nowrap',
              }}>
                {formatBarLabel(item.key, groupBy, locale)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlannerView({ t }) {
  const [sessions] = useState(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('nock_session_log') : null;
      if (!raw) return [];
      const log = JSON.parse(raw);
      const today = new Date().toISOString().split('T')[0];
      return log.filter((s) => s.date === today);
    } catch { return []; }
  });

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getSessionBlocks = () => {
    return sessions.map((s) => {
      const start = new Date(s.startedAt);
      const end = new Date(s.endedAt);
      const startH = start.getHours() + start.getMinutes() / 60;
      const endH = end.getHours() + end.getMinutes() / 60;
      return { ...s, startH, endH, duration: endH - startH };
    });
  };

  const blocks = getSessionBlocks();

  return (
    <div style={{ padding: '16px' }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {sessions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⏰</div>
            <div>{t.noSession}</div>
          </div>
        ) : (
          <div style={{ position: 'relative', height: 24 * 48, paddingLeft: 44 }}>
            {/* Hour lines */}
            {hours.map((h) => (
              <div key={h} style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: h * 48,
                height: 48,
                borderTop: '1px solid var(--separator)',
                display: 'flex',
                alignItems: 'flex-start',
                paddingTop: 4,
                paddingLeft: 8,
              }}>
                <span style={{ fontSize: 11, color: 'var(--text4)', width: 32 }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {/* Session blocks */}
            {blocks.map((block, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: 44,
                right: 8,
                top: block.startH * 48,
                height: Math.max(24, block.duration * 48),
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
                borderRadius: 6,
                padding: '4px 8px',
                zIndex: 2,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{block.todoName}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>
                  {block.minutes}m
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
