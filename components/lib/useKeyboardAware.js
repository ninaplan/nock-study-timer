'use client';
import { useEffect } from 'react';

/**
 * visualViewport 기반 키보드 높이 추적.
 * `:root`에 --kb-h (키보드 높이) 와 --vvp-h (시각적 뷰포트 높이) CSS 변수를 업데이트.
 *
 * iOS Safari: layout viewport는 키보드가 올라와도 불변 → env(keyboard-inset-height) 미지원.
 *   window.innerHeight - visualViewport.height = 키보드 높이
 * Android Chrome: layout viewport가 키보드 크기만큼 줄어듦 → kbH ≈ 0 (올바른 동작).
 */
export function useKeyboardAware() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;

    function update() {
      const vv = window.visualViewport;
      if (!vv) {
        root.style.setProperty('--kb-h', '0px');
        root.style.setProperty('--vvp-h', `${window.innerHeight}px`);
        root.removeAttribute('data-kb');
        return;
      }
      const kbH = Math.max(0, window.innerHeight - vv.height);
      root.style.setProperty('--kb-h', `${Math.round(kbH)}px`);
      root.style.setProperty('--vvp-h', `${Math.round(vv.height)}px`);
      // data-kb='1': 키보드 활성 시 CSS 패딩 보정에 사용
      if (kbH > 50) {
        root.setAttribute('data-kb', '1');
        // iOS Safari: 키보드 올라올 때 페이지가 스크롤되는 현상 방지
        window.scrollTo(0, 0);
      } else {
        root.removeAttribute('data-kb');
      }
    }

    update();

    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      root.style.removeProperty('--kb-h');
      root.style.removeProperty('--vvp-h');
      root.removeAttribute('data-kb');
    };
  }, []);
}
