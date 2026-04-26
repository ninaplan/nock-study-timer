'use client';
import { useState, useLayoutEffect, useRef, useCallback } from 'react';

/** parse rgb()/rgba()/#rrggbb from getComputedStyle */
function parseCssColorToRgb(s) {
  if (!s || s === 'transparent') return null;
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  let hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  hex = s.match(/^#([0-9a-f]{3})$/i);
  if (hex) {
    const [a, b, c] = hex[1].split('');
    return [parseInt(a + a, 16), parseInt(b + b, 16), parseInt(c + c, 16)];
  }
  return null;
}

/** 상대 휘도(0–1). 밝은 카드면 진한 N, 어두운 카드면 밝은 N */
function isLightBackgroundRgb(rgb) {
  if (!rgb) return true;
  const [r, g, b] = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55;
}

const INK_ON_LIGHT = '#111111';
const INK_ON_DARK = 'rgba(235, 235, 245, 0.92)';

/**
 * Notion "N" — 카드/행의 **실제 배경** 밝기로 채움색을 정해
 * (body·--text와 SVG만 어긋나는 PWA·iOS WebKit 이슈 회피).
 * 보조로 옆 레이블 span·button의 computed color도 참고.
 */
export default function NotionMark({ size = 18, className, style, ...rest }) {
  const rootRef = useRef(null);
  const [fill, setFill] = useState(INK_ON_LIGHT);

  const syncFill = useCallback(() => {
    if (typeof window === 'undefined' || !rootRef.current) return;

    const svg = rootRef.current;
    const btn = svg.closest('button');
    const row = svg.parentElement;

    // 1) 연결 행 버튼 배경(인라인 var(--bg2) 포함) → 대비 색
    if (btn) {
      const bg = getComputedStyle(btn).backgroundColor;
      let rgb = parseCssColorToRgb(bg);
      if (!rgb && btn) {
        const root = getComputedStyle(document.documentElement);
        let raw = root.getPropertyValue('--bg2').trim() || root.getPropertyValue('--bg').trim();
        rgb = parseCssColorToRgb(raw);
      }
      if (rgb) {
        setFill(isLightBackgroundRgb(rgb) ? INK_ON_LIGHT : INK_ON_DARK);
        return;
      }
    }

    // 2) 옆 "노션" 라벨과 동일 색 (부모 flex 안 첫 span)
    if (row) {
      const span = row.querySelector('span');
      if (span) {
        const c = getComputedStyle(span).color;
        if (c && c !== 'rgba(0, 0, 0, 0)') {
          setFill(c);
          return;
        }
      }
    }

    // 3) 버튼 전체 글자색
    if (btn) {
      const c = getComputedStyle(btn).color;
      if (c) {
        setFill(c);
        return;
      }
    }

    setFill(getComputedStyle(document.body).color || INK_ON_LIGHT);
  }, []);

  useLayoutEffect(() => {
    syncFill();
    const t0 = window.setTimeout(syncFill, 0);
    const t1 = window.setTimeout(syncFill, 120);
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncFill();
    m.addEventListener('change', onChange);
    window.addEventListener('visibilitychange', onChange);
    window.addEventListener('pageshow', onChange);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      m.removeEventListener('change', onChange);
      window.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pageshow', onChange);
    };
  }, [syncFill]);

  return (
    <svg
      ref={rootRef}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{
        flexShrink: 0,
        isolation: 'isolate',
        mixBlendMode: 'normal',
        ...style,
      }}
      {...rest}
    >
      <path
        fill={fill}
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.31v14.714c0 .654.374.934.98.887l14.664-.887c.607-.047.98-.374.98-.98V7.518c0-.56-.467-.887-.98-.793L5.252 6.838c-.56.047-.933.327-.933.68zm13.904.14c.093.467 0 .887-.467.98l-.7.14v10.576c-.607.327-1.167.513-1.633.513-.748 0-.935-.234-1.495-.933l-4.478-7.023v6.79l1.448.327s0 .887-1.214.887l-3.217.187c-.094-.187 0-.654.047-.747l.84-1.12V9.855L7.22 9.576c-.094-.42.14-1.026.747-1.073l3.45-.234 4.665 7.139v-6.316l-1.214-.14c-.094-.513.28-.887.747-.933z"
      />
    </svg>
  );
}
