'use client';
import { useSyncExternalStore } from 'react';

/**
 * Notion 아이콘 — Icons8 (로컬 PNG)
 * - 라이트: https://icons8.kr/icon/F6H2fsqXKBwH/notion (Color, notion--v1)
 * - 다크:  https://icons8.kr/icon/HDd694003FZa/notion (iOS Filled)
 */
function getMq() {
  if (typeof window === 'undefined') return null;
  return window.matchMedia('(prefers-color-scheme: dark)');
}
function subscribeDark(cb) {
  const m = getMq();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
function isDarkMode() {
  return !!getMq()?.matches;
}
function isDarkModeServer() {
  return false;
}

const SRC = { light: '/notion-icon-light.png', dark: '/notion-icon-dark.png' };

export default function NotionMark({ size = 18, className, style, ...rest }) {
  const isDark = useSyncExternalStore(subscribeDark, isDarkMode, isDarkModeServer);
  return (
    <img
      className={className}
      src={isDark ? SRC.dark : SRC.light}
      width={size}
      height={size}
      alt=""
      aria-hidden
      decoding="async"
      draggable={false}
      style={{
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
        imageRendering: 'auto',
        ...style,
      }}
      {...rest}
    />
  );
}
