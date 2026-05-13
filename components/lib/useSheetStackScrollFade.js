'use client';
import { useEffect } from 'react';

const FADE_RANGE_PX = 22;

/**
 * `.sheet-stack-scroll` / 동일 구조 스크롤 시, 직계 `.sheet-stack-head`의 상단 페이드( ::before )를
 * 메인 화면과 같이 스크롤 직후부터 올린다.
 */
export function useSheetStackScrollFade(scrollRef, active) {
  useEffect(() => {
    if (!active) return undefined;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return undefined;
    const head = scrollEl.querySelector(':scope > .sheet-stack-head');
    if (!head) return undefined;

    const apply = () => {
      const o = Math.min(1, Math.max(0, scrollEl.scrollTop / FADE_RANGE_PX));
      head.style.setProperty('--sheet-sticky-content-fade', String(o));
    };

    apply();
    scrollEl.addEventListener('scroll', apply, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', apply);
      head.style.removeProperty('--sheet-sticky-content-fade');
    };
  }, [active, scrollRef]);
}
