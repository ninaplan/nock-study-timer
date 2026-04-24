// Haptics via navigator.vibrate (Web Vibration API).
// iOS Safari / home-screen PWA: API is typically unavailable — use CSS :active / press feedback in globals instead.
// Android Chrome (incl. many PWAs): often works.
'use client';

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Light tap — buttons, tabs */
export function hapticLight() {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(8);
  } catch {}
}

/** Medium — swipe action fired, important toggles */
export function hapticMedium() {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(18);
  } catch {}
}

/** Soft selection tick */
export function hapticSelect() {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(5);
  } catch {}
}

/** Success: short double-pulse (Android) */
export function hapticSuccess() {
  if (!canVibrate()) return;
  try {
    navigator.vibrate([6, 40, 12]);
  } catch {}
}

export function hapticForSwipeRelease() {
  hapticSelect();
}
