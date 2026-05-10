'use client';

/**
 * iOS(Safari) / Capacitor 네이티브에서 `<select>`가 시스템 스타일(휠 등)로 열리는 경우.
 * 이때는 투명 select 오버레이를 유지하고, 그 외에는 시트 피커를 쓴다.
 */
export function prefersNativeSettingsSelect() {
  if (typeof navigator === 'undefined') return false;
  try {
    const { Capacitor } = require('@capacitor/core');
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') return true;
  } catch {
    /* no Capacitor */
  }
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}
