'use client';
import { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { House, BarChart3, Settings } from 'lucide-react';
import { getLocale, useT } from '@/app/lib/i18n';
import { hapticLight } from './lib/haptics';
import Onboarding from './Onboarding';
import HomeTab from './HomeTab';
import LogTab from './LogTab';
import SettingsTab from './SettingsTab';

const CREDS_KEY = 'nock_study_creds';
const SETTINGS_KEY = 'nock_study_settings';

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [creds, setCreds] = useState(null);
  const [settings, setSettings] = useState({ lang: null, todoFields: {}, reportFields: {} });
  const [tab, setTab] = useState('home');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const locale = getLocale(settings.lang);
  const t = useT(locale);

  // Before first paint: restore session so Fast Refresh / remounts don’t flash a blank spinner
  useLayoutEffect(() => {
    try {
      const c = localStorage.getItem(CREDS_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (c) setCreds(JSON.parse(c));
      if (s) setSettings(JSON.parse(s));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const saveCreds = useCallback((v) => {
    setCreds(v);
    if (v) localStorage.setItem(CREDS_KEY, JSON.stringify(v));
    else localStorage.removeItem(CREDS_KEY);
  }, []);

  const saveSettings = useCallback((v) => {
    setSettings(v);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));
  }, []);

  if (!loaded) return (
    <div className="shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spin spin-dark" style={{ width: 28, height: 28 }} />
    </div>
  );

  if (!creds && !isDemoMode) return (
    <Onboarding
      t={t} locale={locale}
      onComplete={(c, s) => { saveCreds(c); saveSettings({ ...settings, ...s }); setIsDemoMode(false); }}
      onDemo={() => setIsDemoMode(true)}
    />
  );

  return (
    <div className="shell">
      {/* Demo bar */}
      {isDemoMode && <div className="demo-bar">둘러보기 모드</div>}

      {/* Scrollable content area */}
      <div className={`content ${isSheetOpen ? 'content-sheet-open' : ''}`}>
        {/* display:none 방식 — 탭 전환 시 unmount 없이 유지 → 재진입 즉시 */}
        <div style={{ display: tab === 'home'     ? 'block' : 'none' }}>
          <HomeTab     t={t} creds={creds} settings={settings} isDemoMode={isDemoMode} onSheetOpenChange={setIsSheetOpen} />
        </div>
        <div style={{ display: tab === 'log'      ? 'block' : 'none' }}>
          <LogTab      t={t} creds={creds} settings={settings} isDemoMode={isDemoMode} />
        </div>
        <div style={{ display: tab === 'settings' ? 'block' : 'none' }}>
          <SettingsTab t={t} creds={creds} settings={settings} onSaveSettings={saveSettings} onSaveCreds={saveCreds} onDisconnect={() => { saveCreds(null); setIsDemoMode(false); }} locale={locale} />
        </div>
      </div>

      {/* Fixed tab bar */}
      <nav className="tab-bar" style={{ display: isSheetOpen ? 'none' : 'flex' }}>
        <div className="tab-bar-row">
          {[
            { id: 'home',     label: t.home,     icon: <House size={24} strokeWidth={2.2} /> },
            { id: 'log',      label: t.log,      icon: <BarChart3 size={24} strokeWidth={2.2} /> },
            { id: 'settings', label: t.settings, icon: <Settings size={24} strokeWidth={2.2} /> },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`tab-btn ${tab === id ? 'active' : ''}`}
              aria-label={label}
              onClick={() => {
                hapticLight();
                setTab(id);
              }}
            >
              {icon}
              <span className="tab-label">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

