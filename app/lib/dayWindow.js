/** Day-window helpers: timetable visible hours (legacy hour fields + optional minute fields). */

export const MIN_PER_DAY = 24 * 60;

export function clampMinOfDay(m) {
  const v = Math.round(Number(m) || 0);
  return ((v % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

/** 정각(0–23시) 경계로 맞춤 — 하루 기준 UI 휠·`<select>`와 동기 */
export function snapDayWindowMinutesToHourBoundary(m) {
  const h = Math.floor(clampMinOfDay(m) / 60) % 24;
  return h * 60;
}

/** 하루 기준 네이티브 `<select>`용 24개 옵션 (value = 그날 0시부터 경과 분) */
export function dayWindowHourBoundaryOptions(ko = true) {
  return Array.from({ length: 24 }, (_, h) => ({
    value: String(h * 60),
    label: ko ? `${h}시` : `${String(h).padStart(2, '0')}:00`,
  }));
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
 *
 * 끝이 `0`시(설정 요약 `…-00`)이고 시작이 그날 0시가 아닐 때 → 타임라인은 **자정에서 끝**이므로
 * 23→24시 구간까지만 두고, 그 다음 날 00:00–01:00 칸(시 인덱스 0)은 넣지 않는다.
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
  if (
    endH === 0 &&
    startH !== 0 &&
    out.length > 1 &&
    out[out.length - 1] === 0
  ) {
    out.pop();
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

/** 설정 행 요약: 시 단위만 `06-00` 형태 (분 없음). */
export function formatDayWindowSummaryHoursOnly(settings) {
  const startH = Math.floor(getDayWindowStartMin(settings) / 60) % 24;
  const endH = Math.floor(getDayWindowEndMin(settings) / 60) % 24;
  return `${String(startH).padStart(2, '0')}-${String(endH).padStart(2, '0')}`;
}
