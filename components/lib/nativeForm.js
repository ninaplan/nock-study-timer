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

/** 설정 행·DB 피커 등 — 오른쪽 라벨 + 숨김 `<select>` (iOS에서 시스템 피커). */
export function IosInlineSelect({ ariaLabel, value, options, onChange, faceStyle, disabled }) {
  const label = options.find((o) => o.value === value)?.label ?? '';
  return (
    <div className="settings-select-shell">
      <span className="settings-select-face" style={faceStyle}>
        {label}
      </span>
      <span className="settings-chevron" aria-hidden>
        ›
      </span>
      <select
        className="settings-native-select-hidden"
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
