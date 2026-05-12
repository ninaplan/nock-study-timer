'use client';

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function vibratePulse(ms) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(ms);
  } catch {}
}

function vibratePattern(pattern) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

/** Capacitor iOS/Android 앱(WebView)에서 네이티브 햅틱, 그 외는 Vibration API */
function isNativeApp() {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Light tap — 버튼·탭 */
export function hapticLight() {
  if (isNativeApp()) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => vibratePulse(8));
    return;
  }
  vibratePulse(8);
}

/** Medium — 스와이프 확정·토글 등 */
export function hapticMedium() {
  if (isNativeApp()) {
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => vibratePulse(18));
    return;
  }
  vibratePulse(18);
}

/** 강한 피드백 — DnD 준비·중요한 상태 전환 등 */
export function hapticHeavy() {
  if (isNativeApp()) {
    void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => vibratePulse(34));
    return;
  }
  vibratePulse(34);
}

/** 짧은 선택 틱 — 스와이프 스냅 등 */
export function hapticSelect() {
  if (isNativeApp()) {
    void Haptics.selectionChanged().catch(() => vibratePulse(5));
    return;
  }
  vibratePulse(5);
}

/** 성공 알림 — 삭제/리셋 자동 실행 등 */
export function hapticSuccess() {
  if (isNativeApp()) {
    void Haptics.notification({ type: NotificationType.Success }).catch(() =>
      vibratePattern([6, 40, 12])
    );
    return;
  }
  vibratePattern([6, 40, 12]);
}

export function hapticForSwipeRelease() {
  hapticSelect();
}
