'use client';
import { Smartphone } from 'lucide-react';

const HOME_SCREEN_PROMPTED_KEY = 'home-screen-prompted';

export function isHomeScreenPrompted() {
  try { return !!localStorage.getItem(HOME_SCREEN_PROMPTED_KEY); } catch { return true; }
}

export function markHomeScreenPrompted() {
  try { localStorage.setItem(HOME_SCREEN_PROMPTED_KEY, 'true'); } catch {}
}

export default function HomeScreenPrompt({ t, onDone }) {
  const handleDone = () => {
    markHomeScreenPrompted();
    onDone?.();
  };

  return (
    <div className="onboard" style={{ paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 28, width: '100%' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(253,104,69,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Smartphone size={32} strokeWidth={1.8} style={{ color: '#FD6845' }} />
        </div>
        <h1 style={{ fontSize: 'var(--font-size-title2)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.4px', lineHeight: 1.3, margin: '0 0 10px' }}>
          {t.addToHomeTitle}
        </h1>
        <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
          {t.addToHomeBody}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginBottom: 32 }}>
        {[
          { label: t.addToHomeIosLabel, steps: [t.addToHomeIosStep1, t.addToHomeIosStep2] },
          { label: t.addToHomeAndroidLabel, steps: [t.addToHomeAndroidStep1, t.addToHomeAndroidStep2] },
        ].map(({ label, steps }) => (
          <div key={label} style={{ background: 'var(--sheet-grouped-bg)', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 'var(--font-weight-semibold)', color: '#FD6845', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</p>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < steps.length - 1 ? 6 : 0 }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(253,104,69,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'var(--font-weight-semibold)', color: '#FD6845' }}>{i + 1}</span>
                <span style={{ fontSize: 'var(--font-size-subhead)', color: 'var(--color-text-primary)', lineHeight: 1.45 }}>{s}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="w-full stack-sm">
        <button type="button" className="btn btn-dark btn-lg btn-full" onClick={handleDone}>{t.addToHomeDone}</button>
        <button type="button" className="welcome-skip-btn welcome-skip-btn--footer" onClick={handleDone}>{t.addToHomeLater}</button>
      </div>
    </div>
  );
}
