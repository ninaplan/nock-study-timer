/** Day-window helpers: timetable visible hours (legacy hour fields + optional minute fields). */

export const MIN_PER_DAY = 24 * 60;

export function clampMinOfDay(m) {
  const v = Math.round(Number(m) || 0);
  return ((v % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

/** Minutes since midnight; falls back to legacy `dayWindowStart` hour (0–23). */
export function getDayWindowStartMin(settings) {
  if (Number.isFinite(settings?.dayWindowStartMin)) {
    return clampMinOfDay(settings.dayWindowStartMin);
  }
  const h = Number.isFinite(settings?.dayWindowStart) ? Number(settings.dayWindowStart) : 6;
  return clampMinOfDay((Math.floor(h) % 24) * 60);
}

export function getDayWindowEndMin(settings) {
  if (Number.isFinite(settings?.dayWindowEndMin)) {
    return clampMinOfDay(settings.dayWindowEndMin);
  }
  const h = Number.isFinite(settings?.dayWindowEnd) ? Number(settings.dayWindowEnd) : 0;
  return clampMinOfDay((Math.floor(h) % 24) * 60);
}

/**
 * Inclusive hour indices 0–23; if end is before start in clock order, continues past midnight.
 * Uses floored hours from start/end minutes.
 */
export function getDayWindowHourIndicesFromSettings(settings) {
  const startH = Math.floor(getDayWindowStartMin(settings) / 60) % 24;
  const endH = Math.floor(getDayWindowEndMin(settings) / 60) % 24;
  const out = [];
  let h = startH;
  for (let i = 0; i < 48; i += 1) {
    out.push(h);
    if (h === endH) break;
    h = (h + 1) % 24;
  }
  return out;
}

export function formatMinOfDay(m, { timeDisplay, ko }) {
  const v = clampMinOfDay(m);
  const h24 = Math.floor(v / 60);
  const mm = v % 60;
  if (timeDisplay === '12') {
    const hh = h24 % 12 === 0 ? 12 : h24 % 12;
    if (ko) {
      return `${h24 < 12 ? '오전' : '오후'} ${hh}:${String(mm).padStart(2, '0')}`;
    }
    return `${hh}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  }
  return `${String(h24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
