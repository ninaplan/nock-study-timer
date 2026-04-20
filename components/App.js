'use client';
// components/App.js
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
  const [creds, setCreds] = useState(null); // { token, dbTodo, dbReport }
  const [settings, setSettings] = useState({
    lang: null, // null = system
    todoFields: {},
    reportFields: {},
  });
  const [tab, setTab] = useState('home');
  const [isDemoMode, setIsDemoMode] = useState(false);

  const locale = getLocale(settings.lang);
  const t = useT(locale);

  // Load from localStorage
  useEffect(() => {
    try {
      const rawCreds = localStorage.getItem(CREDS_KEY);
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (rawCreds) setCreds(JSON.parse(rawCreds));
      if (rawSettings) setSettings(JSON.parse(rawSettings));
    } catch {}
    setLoaded(true);
  }, []);

  const saveCreds = useCallback((newCreds) => {
    setCreds(newCreds);
    if (newCreds) {
      localStorage.setItem(CREDS_KEY, JSON.stringify(newCreds));
    } else {
      localStorage.removeItem(CREDS_KEY);
    }
  }, []);

  const saveSettings = useCallback((newSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  }, []);

  const handleOnboardingComplete = (newCreds, newSettings) => {
    saveCreds(newCreds);
    saveSettings({ ...settings, ...newSettings });
    setIsDemoMode(false);
  };

  const handleDemoMode = () => {
    setIsDemoMode(true);
  };

  const handleDisconnect = () => {
    saveCreds(null);
    setIsDemoMode(false);
  };

  if (!loaded) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Show onboarding if no creds and not demo mode
  if (!creds && !isDemoMode) {
    return (
      <Onboarding
        t={t}
        onComplete={handleOnboardingComplete}
        onDemo={handleDemoMode}
        creds={creds}
        settings={settings}
      />
    );
  }

  return (
    <div className="app-container">
      {isDemoMode && (
        <div className="demo-banner">{t.demoMode}</div>
      )}

      {/* Tab Content */}
      <div className="tab-content">
        {tab === 'home' && (
          <HomeTab
            t={t}
            creds={creds}
            settings={settings}
            isDemoMode={isDemoMode}
          />
        )}
        {tab === 'log' && (
          <LogTab
            t={t}
            creds={creds}
            settings={settings}
            isDemoMode={isDemoMode}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            t={t}
            creds={creds}
            settings={settings}
            onSaveSettings={saveSettings}
            onSaveCreds={saveCreds}
            onDisconnect={handleDisconnect}
            locale={locale}
          />
        )}
      </div>

      {/* Tab Bar */}
      <nav className="tab-bar">
        <TabItem
          icon={<HomeIcon />}
          label={t.home}
          active={tab === 'home'}
          onClick={() => setTab('home')}
        />
        <TabItem
          icon={<LogIcon />}
          label={t.log}
          active={tab === 'log'}
          onClick={() => setTab('log')}
        />
        <TabItem
          icon={<SettingsIcon />}
          label={t.settings}
          active={tab === 'settings'}
          onClick={() => setTab('settings')}
        />
      </nav>
    </div>
  );
}

function TabItem({ icon, label, active, onClick }) {
  return (
    <button className={`tab-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}
