/** 타임블록 단일 좌표계 — timeInMinutes = 자정 기준 분 (소수: 초 단위 보간 가능) */

export const TIMELINE_MIN_PER_DAY = 24 * 60;

export function clampMinOfDay(m) {
  let v = Number(m);
  if (!Number.isFinite(v)) return 0;
  v %= TIMELINE_MIN_PER_DAY;
  if (v < 0) v += TIMELINE_MIN_PER_DAY;
  return v;
}

/**
 * 보이는 시간대 배열(시 0–23, 순서대로) 안에서 clock 분의 타임라인 시작점으로부터의 오프셋(분).
 * 자정을 넘기는 창(예: 22→23→0)에서도 슬롯 순서대로 누적.
 */
export function minuteOffsetInVisibleTimeline(timeInMinutes, visibleHours) {
  if (!visibleHours?.length) return 0;
  const t = clampMinOfDay(timeInMinutes);
  let acc = 0;
  for (const h of visibleHours) {
    const hs = (((h % 24) + 24) % 24) * 60;
    const he = hs + 60;
    if (t >= hs && t < he) return acc + (t - hs);
    acc += 60;
  }
  if (t < (((visibleHours[0] % 24) + 24) % 24) * 60) return 0;
  return acc;
}

export function getTimelineSpanMinutes(visibleHours) {
  if (!visibleHours?.length) return TIMELINE_MIN_PER_DAY;
  return visibleHours.length * 60;
}

/** 첫 정각 시각(분) — 타임라인 원점과 동일 */
export function getStartOfDayInMinutes(visibleHours) {
  if (!visibleHours?.length) return 0;
  return (((visibleHours[0] % 24) + 24) % 24) * 60;
}

/** 현재 시각(분)이 보이는 타임라인의 어느 시간 슬롯에도 속하는지 */
export function isMinuteInVisibleTimeline(timeInMinutes, visibleHours) {
  if (!visibleHours?.length) return false;
  const t = clampMinOfDay(timeInMinutes);
  for (const h of visibleHours) {
    const hs = (((h % 24) + 24) % 24) * 60;
    if (t >= hs && t < hs + 60) return true;
  }
  return false;
}

/**
 * 단일 변환: 레이블·점·블록·지금 선 모두 동일.
 * (timeInMinutes - startOfDayInMinutes) * pxPerMin 과 같은 창에선 동치이나,
 * 자정 돌파 창은 minuteOffsetInVisibleTimeline 경로만 사용.
 */
export function timeToY(timeInMinutes, { startOfDayInMinutes: _origin, pxPerMin, paddingTop, visibleHours }) {
  const delta = minuteOffsetInVisibleTimeline(timeInMinutes, visibleHours);
  return paddingTop + delta * pxPerMin;
}
