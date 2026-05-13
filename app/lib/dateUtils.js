/** Calendar date YYYY-MM-DD in the user's local timezone (not UTC). */
export function localDateKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DD` + whole days in local calendar (avoids UTC shift). */
export function addCalendarDays(dateStr, deltaDays) {
  if (!dateStr || typeof dateStr !== 'string') return localDateKey();
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return localDateKey();
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + (Number(deltaDays) || 0));
  return localDateKey(dt);
}

/** `YYYY-MM-DD` 한 줄 표시 — `loc`는 `'ko'` | 그 외(영문권 레이아웃) */
export function formatCalendarDateLine(dateStr, loc) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Number(m[1]), mo - 1, d);
  if (loc === 'ko') return `${mo}월 ${d}일 ${'일월화수목금토'[dt.getDay()]}요일`;
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
