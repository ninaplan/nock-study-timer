'use client';
import { useState, useLayoutEffect } from 'react';

/**
 * Notion "N" — 본문 `color`과 동일한 계산 색( body 기준)을 써서
 * SVG+var(–text) + 일부 PWA/웹뷰에서만 나는 라이트/다크 역전을 피합니다.
 */
export default function NotionMark({ size = 18, className, style, ...rest }) {
  const [ink, setInk] = useState(null);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const read = () => {
      setInk(getComputedStyle(document.body).color);
    };
    read();
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    m.addEventListener('change', read);
    // 시스템 '모양' 바뀔 때(일부 iOS) 재계산
    window.addEventListener('visibilitychange', read);
    return () => {
      m.removeEventListener('change', read);
      window.removeEventListener('visibilitychange', read);
    };
  }, []);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ color: ink ?? 'inherit', flexShrink: 0, ...style }}
      {...rest}
    >
      <path
        fill="currentColor"
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.31v14.714c0 .654.374.934.98.887l14.664-.887c.607-.047.98-.374.98-.98V7.518c0-.56-.467-.887-.98-.793L5.252 6.838c-.56.047-.933.327-.933.68zm13.904.14c.093.467 0 .887-.467.98l-.7.14v10.576c-.607.327-1.167.513-1.633.513-.748 0-.935-.234-1.495-.933l-4.478-7.023v6.79l1.448.327s0 .887-1.214.887l-3.217.187c-.094-.187 0-.654.047-.747l.84-1.12V9.855L7.22 9.576c-.094-.42.14-1.026.747-1.073l3.45-.234 4.665 7.139v-6.316l-1.214-.14c-.094-.513.28-.887.747-.933z"
      />
    </svg>
  );
}
