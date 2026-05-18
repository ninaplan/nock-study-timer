'use client';
import { useState } from 'react';
import { Smartphone, X } from 'lucide-react';

const HOME_SCREEN_PROMPTED_KEY = 'home-screen-prompted';

export function isHomeScreenPrompted() {
  try { return !!localStorage.getItem(HOME_SCREEN_PROMPTED_KEY); } catch { return false; }
}

export default function HomeScreenPrompt({ t }) {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(HOME_SCREEN_PROMPTED_KEY); } catch { return false; }
  });

  if (!visible) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(HOME_SCREEN_PROMPTED_KEY, 'true'); } catch {}
    setVisible(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'var(--color-bg-surface, #fff)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
      }}
    >
      <Smartphone size={16} strokeWidth={1.8} style={{ color: '#FD6845', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 'var(--font-size-footnote)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
        {t.addToHomeBanner}
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}
        aria-label="닫기"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
