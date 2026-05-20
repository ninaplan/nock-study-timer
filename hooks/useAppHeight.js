'use client';
import { useEffect } from 'react';

export function useAppHeight() {
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };

    apply();

    // visualViewport resize 이벤트: 일반 resize보다 더 정확함
    window.visualViewport?.addEventListener('resize', apply);
    window.addEventListener('resize', apply);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(apply, 300);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.visualViewport?.removeEventListener('resize', apply);
      window.removeEventListener('resize', apply);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
