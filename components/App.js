'use client';
import { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { House, BarChart3, Settings } from 'lucide-react';
import { getLocale, useT } from '@/app/lib/i18n';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { hapticLight } from './lib/haptics';
import { resolveApiUrl } from './lib/apiClient';
import Onboarding from './Onboarding';
import HomeTab from './HomeTab';
import LogTab from './LogTab';
import SettingsTab from './SettingsTab';

const CREDS_KEY = 'nock_study_creds';
const SETTINGS_KEY = 'nock_study_settings';

/** Reject string/array JSON so creds is never a truthy non-object (breaks the main shell). */
function parseObjectSafe(raw, key) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    if (v == null || typeof v !== 'object' || Array.isArray(v)) {
      try { localStorage.removeItem(key); } catch {}
      return null;
    }
    return v;
  } catch {
    try { localStorage.removeItem(key); } catch {}
    return null;
  }
}

/** OAuth 콜백 뒤 `?onboarding=db&oauth=1` — 클라이언트에서만 읽음 (SSR에선 window 없음). */
function parseOnboardParamsFromSearch(search) {
  const sp = new URLSearchParams(search);
  return {
    initialStep: sp.get('onboarding') === 'db' ? 1 : 0,
    fromOAuth: sp.get('oauth') === '1',
  };
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [creds, setCreds] = useState(null);
  const [settings, setSettings] = useState({ lang: null, todoFields: {}, reportFields: {} });
  const [tab, setTab] = useState('home');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [onboardUrl, setOnboardUrl] = useState({ initialStep: 0, fromOAuth: false });

  const locale = getLocale(settings.lang);
  const t = useT(locale);
  const activeTab = ['home', 'log', 'settings'].includes(tab) ? tab : 'home';

  // Before first paint: restore session so Fast Refresh / remounts don’t flash a blank spinner
  useLayoutEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const search = window.location.search;
        const p = parseOnboardParamsFromSearch(search);
        if (p.initialStep > 0 || p.fromOAuth) {
          setOnboardUrl(p);
        }
        if (search && (p.initialStep > 0 || p.fromOAuth)) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      const c = localStorage.getItem(CREDS_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (c) {
        const parsed = parseObjectSafe(c, CREDS_KEY);
        if (parsed) setCreds(parsed);
        else setCreds(null);
      }
      if (s) {
        const parsed = parseObjectSafe(s, SETTINGS_KEY);
        if (parsed) setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      try {
        localStorage.removeItem(CREDS_KEY);
        setCreds(null);
      } catch {}
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
        const j = await r.json();
        if (cancelled || !j?.authenticated) return;
        setCreds((prev) => {
          if (prev) return prev;
          return { authMode: 'oauth' };
        });
      } catch { /* keep LS-only or null */ }
    })();
    return () => { cancelled = true; };
  }, [loaded]);

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
    <div
      className="shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #F2F2F7)',
        color: 'var(--text, #111)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '3px solid rgba(142, 142, 147, 0.35)',
          borderTopColor: 'rgba(60, 60, 67, 0.9)',
          animation: '_appBootSpin 0.7s linear infinite',
        }}
      />
    </div>
  );

  if (!isDemoMode && (!hasNotionAuth(creds) || !creds?.dbTodo)) {
    return (
      <Onboarding
        key={`onboard-${onboardUrl.initialStep}-${onboardUrl.fromOAuth ? '1' : '0'}`}
        t={t}
        locale={locale}
        initialStep={onboardUrl.initialStep}
        fromOAuth={onboardUrl.fromOAuth}
        onComplete={(c, s) => { saveCreds(c); saveSettings({ ...settings, ...s }); setIsDemoMode(false); }}
        onDemo={() => setIsDemoMode(true)}
      />
    );
  }

  return (
    <div className="shell">
      {/* Demo bar */}
      {isDemoMode && <div className="demo-bar">둘러보기 모드</div>}

      {/* Scrollable content area */}
      <div className={`content ${isSheetOpen ? 'content-sheet-open' : ''}`}>
        {/* display:none 방식 — 탭 전환 시 unmount 없이 유지 → 재진입 즉시 */}
        <div style={{ display: activeTab === 'home'     ? 'block' : 'none' }}>
          <HomeTab     t={t} creds={creds} settings={settings} isDemoMode={isDemoMode} onSheetOpenChange={setIsSheetOpen} />
        </div>
        <div style={{ display: activeTab === 'log'      ? 'block' : 'none' }}>
          <LogTab      t={t} creds={creds} settings={settings} isDemoMode={isDemoMode} />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <SettingsTab
            t={t}
            creds={creds}
            settings={settings}
            onSaveSettings={saveSettings}
            onSaveCreds={saveCreds}
            onDisconnect={async () => {
              try {
                await fetch(resolveApiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
              } catch { /* best-effort */ }
              saveCreds(null);
              setIsDemoMode(false);
            }}
            locale={locale}
          />
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
              className={`tab-btn ${activeTab === id ? 'active' : ''}`}
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

