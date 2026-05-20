'use client';
import { useAppHeight } from '@/hooks/useAppHeight';
import { useEffect, useState } from 'react';

function DebugOverlay() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const update = () => {
      setInfo({
        vvpH: window.visualViewport?.height ?? 'N/A',
        innerH: window.innerHeight,
        screenH: screen.height,
        sab: getComputedStyle(document.documentElement).getPropertyValue('--sab').trim() || 'N/A',
      });
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!info) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 100,
      right: 8,
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      fontSize: 12,
      lineHeight: 1.6,
      padding: '6px 10px',
      borderRadius: 8,
      zIndex: 9999,
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    }}>
      <div>vvp.h: {info.vvpH}</div>
      <div>innerH: {info.innerH}</div>
      <div>screen.h: {info.screenH}</div>
      <div>--sab: {info.sab}</div>
    </div>
  );
}

export default function AppHeightProvider({ children }) {
  useAppHeight();
  return (
    <>
      {children}
      <DebugOverlay />
    </>
  );
}
