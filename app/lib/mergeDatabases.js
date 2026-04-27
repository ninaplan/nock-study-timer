/**
 * @param {Array<{ id: string, title?: string, description?: string, label?: string }>} a
 * @param {Array<{ id: string, title?: string, description?: string, label?: string }>} b
 * @returns 키 id 기준 병합(같은 id면 뒤 배열 항목으로 덮어씀 — 보강 fetch 결과 반영)
 */
export function mergeDbsById(a, b) {
  const m = new Map();
  for (const x of a || []) {
    if (x?.id) m.set(x.id, x);
  }
  for (const x of b || []) {
    if (x?.id) m.set(x.id, x);
  }
  return Array.from(m.values());
}
