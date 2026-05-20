'use client';
import { useEffect } from 'react';

export function useAppHeight() {
  useEffect(() => {
    const apply = () => {
      const h = window.innerHeight;
      if (!h) return;
      const safeBottom = parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue('--sab') || '0'
      ) || 0;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };

    apply();
    window.addEventListener('resize', apply);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(apply, 300);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', apply);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
