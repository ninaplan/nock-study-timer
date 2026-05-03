/** Notion 할 일 ID 비교용 — 하이픈 무시 */
export function normalizeTodoKey(id) {
  return String(id ?? '').replace(/-/g, '');
}

/** 집중 분 필드: API는 분(number)으로 통일. 초 단위 자동 변환은 오판 시 합계 폭주·축소가 나므로 하지 않음. */
export function normalizeAccumMin(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * 동일 할 일이 두 줄로 오면 accum 합계가 배로 늘어나므로 ID당 하나로 합침.
 */
export function dedupeTodosById(list) {
  const m = new Map();
  for (const item of list) {
    if (!item || item.id == null) continue;
    const k = normalizeTodoKey(item.id);
    const prev = m.get(k);
    const nextAccum = Math.max(Number(prev?.accum) || 0, Number(item.accum) || 0);
    if (!prev) {
      m.set(k, { ...item, accum: nextAccum });
    } else {
      m.set(k, {
        ...prev,
        ...item,
        accum: nextAccum,
        accumSec:
          Number.isFinite(prev.accumSec) && Number.isFinite(item.accumSec)
            ? Math.max(prev.accumSec, item.accumSec)
            : (item.accumSec ?? prev.accumSec),
      });
    }
  }
  return [...m.values()];
}

/** 노션 목표 DB와 relation 연결된 할 일 */
export function todoHasGoalLink(todo) {
  return Boolean(todo && String(todo.goalPageId || '').trim());
}
