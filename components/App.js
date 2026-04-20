'use client';
import { useState, useEffect, useCallback } from 'react';
import { getLocale, useT } from '@/app/lib/i18n';
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

  const locale = getLocale(settings.lang);
  const t = useT(locale);

  useEffect(() => {
    try {
      const c = localStorage.getItem(CREDS_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (c) setCreds(JSON.parse(c));
      if (s) setSettings(JSON.parse(s));
    } catch {}
    setLoaded(true);
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

  const TAB_H = 82; // must match --TAB-H in CSS

  return (
    <div className="shell">
      {/* Demo bar */}
      {isDemoMode && <div className="demo-bar">둘러보기 모드</div>}

      {/* Scrollable content area */}
      <div className="content">
        {tab === 'home'     && <HomeTab     t={t} creds={creds} settings={settings} isDemoMode={isDemoMode} />}
        {tab === 'log'      && <LogTab      t={t} creds={creds} settings={settings} isDemoMode={isDemoMode} />}
        {tab === 'settings' && <SettingsTab t={t} creds={creds} settings={settings} onSaveSettings={saveSettings} onSaveCreds={saveCreds} onDisconnect={() => { saveCreds(null); setIsDemoMode(false); }} locale={locale} />}
      </div>

      {/* Fixed tab bar */}
      <nav className="tab-bar">
        {[
          { id: 'home',     label: t.home,     icon: <HomeIco /> },
          { id: 'log',      label: t.log,      icon: <LogIco /> },
          { id: 'settings', label: t.settings, icon: <SettIco /> },
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

const HomeIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
);
const LogIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
  </svg>
);
const SettIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);
