import { addCalendarDays } from '@/app/lib/dateUtils';

const STORE_KEY = 'nock_local_todos_by_day_v1';

export function loadLocalTodosForDay(dateKey) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    const row = o?.days?.[dateKey];
    return Array.isArray(row) ? row : null;
  } catch {
    return null;
  }
}

export function saveLocalTodosForDay(dateKey, todos) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const o = raw ? JSON.parse(raw) : { v: 1, days: {} };
    if (!o.days || typeof o.days !== 'object') o.days = {};
    o.days[dateKey] = todos;
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch {
    /* quota */
  }
}

/** 날짜 구간(포함)의 할 일을 합침 — 기록 탭 통계용 */
export function loadLocalTodosInRange(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw);
    const days = o?.days || {};
    const out = [];
    let d = startDate;
    for (;;) {
      if (d > endDate) break;
      const arr = days[d];
      if (Array.isArray(arr)) out.push(...arr);
      if (d === endDate) break;
      d = addCalendarDays(d, 1);
    }
    return out;
  } catch {
    return [];
  }
}
