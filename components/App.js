'use client';
import { useState, useLayoutEffect, useEffect, useCallback, useRef } from 'react';
import { Timer, CalendarDays, BarChart3, Settings } from 'lucide-react';
import { getLocale, useT } from '@/app/lib/i18n';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { hapticLight } from './lib/haptics';
import { resolveApiUrl } from './lib/apiClient';
import Onboarding from './Onboarding';
import { isLocalMode } from '@/app/lib/credsMode';
import HomeTab from './HomeTab';
import LogTab from './LogTab';
import SettingsTab from './SettingsTab';
import { NOCK_TIMER_PAUSED_KEY, NOCK_TIMER_STATE_KEY } from './lib/useTimer';

const CREDS_KEY = 'nock_study_creds';
const SETTINGS_KEY = 'nock_study_settings';
/** DB 재선택이 설정 화면에서 이뤄질지 / 온보딩인지(새로고침 복원용) */
const NOCK_OAUTH_REPICK_KEY = 'nock_oauth_repick';

/** 첫 탭: 저장된 홈 면만 반영(타이머/시간표). 기록·설정은 매번 타이머·시간표로 시작 */
function readInitialMainTab() {
  if (typeof window === 'undefined') return 'timer';
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : {};
    return s?.homeSurface === 'timetable' ? 'timetable' : 'timer';
  } catch {
    return 'timer';
  }
}

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

/** OAuth 콜백 쿼리 (클라이언트 전용) */
function parseOnboardParamsFromSearch(search) {
  const sp = new URLSearchParams(search);
  return {
    initialStep: sp.get('onboarding') === 'db' ? 1 : 0,
    fromOAuth: sp.get('oauth') === '1',
    /** 설정>노션에서 재인증(페이지 액세스) 시 콜백이 루트+설정 흐름으로 옴 */
    settingsNotion: sp.get('settingsNotion') === '1',
  };
}

function readOauthRepickFromUrlOrStorage() {
  if (typeof window === 'undefined') return '';
  const sp = new URLSearchParams(window.location.search);
  if (sp.get('oauth') === '1') {
    return sp.get('settingsNotion') === '1' ? 'settings' : 'onboard';
  }
  try {
    return localStorage.getItem(NOCK_OAUTH_REPICK_KEY) || '';
  } catch {
    return '';
  }
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [creds, setCreds] = useState(null);
  const [settings, setSettings] = useState({
    lang: 'ko',
    todoFields: {},
    reportFields: {},
    dayWindowStart: 6,
    dayWindowEnd: 0,
    dayWindowStartMin: 6 * 60,
    dayWindowEndMin: 0,
    timeDisplay: '24',
    homeSurface: 'timer',
    /** 'local' | 'notion' — home timetable: local-only time blocks vs sync to Notion */
    timetableStorageMode: 'local',
  });
  const [notionSettingsSignal, setNotionSettingsSignal] = useState(0);
  const [mainTab, setMainTab] = useState(readInitialMainTab);
  const [addTodoSignal, setAddTodoSignal] = useState(0);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  /** 설정 «표시 시간 범위» 바텀시트 — 아일랜드 탭과 z-index 겹침 방지 */
  const [settingsIslandCoverOpen, setSettingsIslandCoverOpen] = useState(false);
  const [contentScrollY, setContentScrollY] = useState(0);
  /** 홈 타이머 탭 스크롤 시 접힌 제목에 표시할 오늘 집중 합계 문자열 */
  const [timerFocusSummaryLabel, setTimerFocusSummaryLabel] = useState('');
  const contentRef = useRef(null);
  const [onboardUrl, setOnboardUrl] = useState({ initialStep: 0, fromOAuth: false });
  const [oauthRepick, setOauthRepick] = useState(readOauthRepickFromUrlOrStorage);
  /** 설정 탭에서 노션 연동 하위 화면일 때 상단 큰「설정」제목을 숨김 */
  const [settingsNotionDetailOpen, setSettingsNotionDetailOpen] = useState(false);

  const locale = getLocale(settings.lang);
  const t = useT(locale);
  const ko = locale === 'ko';
  const islandBarHidden = isSheetOpen || settingsIslandCoverOpen;

  const timerTabScrolled = mainTab === 'timer' && contentScrollY >= 20;
  const collapsedNavTitle =
    timerTabScrolled && timerFocusSummaryLabel
      ? timerFocusSummaryLabel
      : mainTab === 'log'
        ? t.log
        : mainTab === 'settings'
          ? settingsNotionDetailOpen
            ? t.notionSubpageTitle
            : t.settings
          : mainTab === 'timetable'
            ? t.homeIslandTimetable
            : t.homeIslandTimer;
  const collapsedTitleOpacity = Math.min(1, Math.max(0, (contentScrollY - 20) / 24));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en';
  }, [locale]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || !loaded) return undefined;
    const onScroll = () => setContentScrollY(el.scrollTop);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loaded, mainTab]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
    setContentScrollY(0);
  }, [mainTab]);

  useEffect(() => {
    if (mainTab !== 'settings') setSettingsNotionDetailOpen(false);
  }, [mainTab]);

  // Before first paint: restore session so Fast Refresh / remounts don’t flash a blank spinner
  useLayoutEffect(() => {
    try {
      let fromOAuth = false;
      let p = { initialStep: 0, fromOAuth: false, settingsNotion: false };
      if (typeof window !== 'undefined') {
        const search = window.location.search;
        p = parseOnboardParamsFromSearch(search);
        fromOAuth = p.fromOAuth;
        if (fromOAuth) {
          const rep = p.settingsNotion ? 'settings' : 'onboard';
          try {
            localStorage.setItem(NOCK_OAUTH_REPICK_KEY, rep);
          } catch { /* */ }
          setOauthRepick(rep);
        }
        if (p.fromOAuth && p.settingsNotion) {
          /** 설정에서 노션 로그인 → 첫 화면(welcome) 없이 DB 지정 단계(온보딩 1단계와 동일) */
          setOnboardUrl({ initialStep: 1, fromOAuth: true });
        } else if (p.fromOAuth && !p.settingsNotion) {
          setOnboardUrl({ initialStep: p.initialStep > 0 ? p.initialStep : 1, fromOAuth: true });
        }
        if (search && (p.initialStep > 0 || p.fromOAuth || p.settingsNotion)) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      const c = localStorage.getItem(CREDS_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (c) {
        const parsed = parseObjectSafe(c, CREDS_KEY);
        if (parsed) {
          // OAuth 콜백 직후: 접근 범위가 바뀌었을 수 있으니 DB는 다시 고르고 저장하도록 강제
          if (fromOAuth) {
            const next = { ...parsed };
            delete next.dbTodo;
            delete next.dbReport;
            delete next.dbGoal;
            next.authMode = 'oauth';
            setCreds(next);
            try {
              localStorage.setItem(CREDS_KEY, JSON.stringify({ ...next, authMode: 'oauth' }));
              // 접근 범위 변경 뒤 재연결: 이전 페이지에서 돌아가던 타이머는 LS에 남으면 이후에 부활함 → 제거
              localStorage.removeItem(NOCK_TIMER_STATE_KEY);
              localStorage.removeItem(NOCK_TIMER_PAUSED_KEY);
            } catch { /* */ }
          } else {
            setCreds(parsed);
          }
        } else setCreds(null);
      }
      if (s) {
        const parsed = parseObjectSafe(s, SETTINGS_KEY);
        if (parsed) {
          setSettings((prev) => {
            const next = { ...prev, ...parsed };
            if (next.lang == null) next.lang = 'ko';
            return next;
          });
        }
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
      /** OAuth 리다이렉트 직후 세션 쿠키가 한 프레임 늦게 붙으면 첫 /session 만으로는 미인증으로 나올 수 있음 — 즉시 creds 를 지우지 않고 재시도 */
      const maxAttempts = 6;
      const delayMs = 320;
      let authenticated = false;
      let workspaceName = null;
      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, delayMs));
        try {
          const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
          const j = await r.json();
          if (cancelled) return;
          if (j?.authenticated) {
            authenticated = true;
            workspaceName = j.workspace_name || null;
            break;
          }
        } catch { /* retry */ }
      }
      if (cancelled) return;
      if (!authenticated) {
        setCreds((prev) => {
          if (!prev || prev.authMode !== 'oauth') return prev;
          try {
            localStorage.removeItem(CREDS_KEY);
          } catch { /* */ }
          return null;
        });
        return;
      }
      setCreds((prev) => {
        const base = prev ? { ...prev } : { authMode: 'oauth' };
        if (prev?.authMode === 'local') {
          base.authMode = 'oauth';
        }
        if (workspaceName) {
          base.workspaceName = workspaceName;
        } else if (prev?.workspaceName) {
          base.workspaceName = prev.workspaceName;
        }
        try {
          localStorage.setItem(CREDS_KEY, JSON.stringify(base));
        } catch { /* */ }
        return base;
      });
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
    if (v?.dbTodo) {
      try {
        localStorage.removeItem(NOCK_OAUTH_REPICK_KEY);
      } catch { /* */ }
      setOauthRepick('');
      setOnboardUrl({ initialStep: 0, fromOAuth: false });
    } else if (!v) {
      try {
        localStorage.removeItem(NOCK_OAUTH_REPICK_KEY);
      } catch { /* */ }
      setOauthRepick('');
      // Logout or expired session should always restart onboarding at step 0.
      setOnboardUrl({ initialStep: 0, fromOAuth: false });
    }
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
      className="shell shell--no-edge-scrim"
      data-locale={locale}
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

  const notionDbReady = hasNotionAuth(creds) && Boolean(String(creds?.dbTodo || '').trim());
  /** 노션 연결만 되고 할 일 DB 미지정 → 전체 화면 온보딩(설정에서 OAuth 한 경우도 동일, DB 단계부터) */
  if (!isLocalMode(creds) && !notionDbReady) {
    return (
      <div className="shell" data-locale={locale}>
        <Onboarding
          key={`onboard-${onboardUrl.initialStep}-${onboardUrl.fromOAuth ? '1' : '0'}`}
          t={t}
          locale={locale}
          initialStep={onboardUrl.initialStep}
          fromOAuth={onboardUrl.fromOAuth}
          onComplete={(c, s) => { saveCreds(c); saveSettings({ ...settings, ...s }); }}
          onStartLocal={() => saveCreds({ authMode: 'local' })}
        />
      </div>
    );
  }

  return (
    <div
      className="shell shell--scroll-scrim shell--no-edge-scrim"
      data-locale={locale}
      data-main-island={!islandBarHidden ? '1' : '0'}
      style={{ ['--shell-top-scrim-opacity']: collapsedTitleOpacity }}
    >
      {collapsedTitleOpacity > 0.04 && (
        <div
          className="app-collapsed-title-bar"
          style={{ opacity: collapsedTitleOpacity }}
          aria-hidden={collapsedTitleOpacity < 0.02}
        >
          <span>{collapsedNavTitle}</span>
        </div>
      )}

      <div
        ref={contentRef}
        className={`content ${islandBarHidden ? 'content-sheet-open' : ''}`}
      >
        <div
          style={{
            display: mainTab === 'timer' || mainTab === 'timetable' ? 'block' : 'none',
          }}
          aria-hidden={mainTab !== 'timer' && mainTab !== 'timetable'}
        >
          <HomeTab
            t={t}
            creds={creds}
            settings={settings}
            openAddSignal={addTodoSignal}
            onSheetOpenChange={setIsSheetOpen}
            onSaveSettings={saveSettings}
            onFocusSummaryChange={setTimerFocusSummaryLabel}
            onRequestAddTodo={() => setAddTodoSignal((n) => n + 1)}
          />
        </div>

        {mainTab === 'log' && (
          <>
            <div className="page-large-title-block">
              <h1 className="page-title">{t.log}</h1>
            </div>
            <LogTab
              t={t}
              creds={creds}
              settings={settings}
              onSheetOpenChange={setIsSheetOpen}
              inBottomSheet
            />
          </>
        )}

        {mainTab === 'settings' && (
          <>
            {!settingsNotionDetailOpen && (
              <div className="page-large-title-block">
                <h1 className="page-title">{t.settings}</h1>
              </div>
            )}
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
                setMainTab('timer');
              }}
              locale={locale}
              openNotionSubpageOnMount={false}
              notionOpenSignal={notionSettingsSignal}
              onNotionDetailChange={setSettingsNotionDetailOpen}
              onSettingsIslandCoverChange={setSettingsIslandCoverOpen}
              inBottomSheet
            />
          </>
        )}
      </div>

      {!islandBarHidden && (
        <nav className="main-island-bar" aria-label={ko ? '바닥 메뉴' : 'Main navigation'}>
          <div className="main-island-bar-inner">
            <div
              className="main-island-tabs-cluster"
              style={{
                '--mi-idx':
                  mainTab === 'timer' ? 0 : mainTab === 'timetable' ? 1 : mainTab === 'log' ? 2 : 3,
              }}
            >
              <span className="main-island-thumb" aria-hidden />
              <button
                type="button"
                className="main-island-tab"
                data-active={mainTab === 'timer' ? 'true' : undefined}
                aria-current={mainTab === 'timer' ? 'page' : undefined}
                onClick={() => {
                  hapticLight();
                  setMainTab('timer');
                  saveSettings({ ...settings, homeSurface: 'timer' });
                }}
              >
                <Timer size={22} strokeWidth={2.1} aria-hidden />
                <span className="main-island-tab-label">{t.homeIslandTimer}</span>
              </button>
              <button
                type="button"
                className="main-island-tab"
                data-active={mainTab === 'timetable' ? 'true' : undefined}
                aria-current={mainTab === 'timetable' ? 'page' : undefined}
                onClick={() => {
                  hapticLight();
                  setMainTab('timetable');
                  saveSettings({ ...settings, homeSurface: 'timetable' });
                }}
              >
                <CalendarDays size={22} strokeWidth={2.1} aria-hidden />
                <span className="main-island-tab-label">{t.homeIslandTimetable}</span>
              </button>
              <button
                type="button"
                className="main-island-tab"
                data-active={mainTab === 'log' ? 'true' : undefined}
                aria-current={mainTab === 'log' ? 'page' : undefined}
                onClick={() => {
                  hapticLight();
                  setMainTab('log');
                }}
              >
                <BarChart3 size={22} strokeWidth={2.1} aria-hidden />
                <span className="main-island-tab-label">{t.log}</span>
              </button>
              <button
                type="button"
                className="main-island-tab"
                data-active={mainTab === 'settings' ? 'true' : undefined}
                aria-current={mainTab === 'settings' ? 'page' : undefined}
                onClick={() => {
                  hapticLight();
                  setMainTab('settings');
                }}
              >
                <Settings size={22} strokeWidth={2.1} aria-hidden />
                <span className="main-island-tab-label">{t.settings}</span>
              </button>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}

