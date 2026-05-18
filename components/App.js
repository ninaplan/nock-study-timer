'use client';
import { useState, useLayoutEffect, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Timer, BarChart3, Settings, Crown, Sparkles } from 'lucide-react';
import { getLocale, useT } from '@/app/lib/i18n';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { hapticLight } from './lib/haptics';
import { resolveApiUrl } from './lib/apiClient';
import { fetchWithTimeout } from '@/app/lib/fetchWithTimeout';
import Onboarding from './Onboarding';
import HomeScreenPrompt, { isHomeScreenPrompted } from './HomeScreenPrompt';
import { isLocalMode } from '@/app/lib/credsMode';
import { getUserKey } from '@/app/lib/getUserKey';
import { getSupabaseClient } from '@/app/lib/supabase';
import TimeBlockIslandIcon from './TimeBlockIslandIcon';
import HomeTab from './HomeTab';
import LogTab from './LogTab';
import SettingsTab from './SettingsTab';
import { NOCK_TIMER_PAUSED_KEY, NOCK_TIMER_STATE_KEY } from './lib/useTimer';
import { useKeyboardAware } from './lib/useKeyboardAware';

const CREDS_KEY = 'nock_study_creds';
const SETTINGS_KEY = 'nock_study_settings';
/** DB 재선택이 설정 화면에서 이뤄질지 / 온보딩인지(새로고침 복원용) */
const NOCK_OAUTH_REPICK_KEY = 'nock_oauth_repick';

/** 항상 타이머로 시작 (시간표 진입점 선택 기능은 추후 추가 예정) */
function readInitialMainTab() {
  return 'timer';
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
  const [homeScreenPrompted, setHomeScreenPrompted] = useState(isHomeScreenPrompted);
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
  /** 설정 «하루 기준» 드롭다운 — 아일랜드 탭과 z-index 겹침 방지 */
  const [settingsIslandCoverOpen, setSettingsIslandCoverOpen] = useState(false);
  const [contentScrollY, setContentScrollY] = useState(0);
  const contentRef = useRef(null);
  const [onboardUrl, setOnboardUrl] = useState({ initialStep: 0, fromOAuth: false });
  const [oauthRepick, setOauthRepick] = useState(readOauthRepickFromUrlOrStorage);
  /** 설정 탭에서 노션 연동 하위 화면일 때 상단 큰「설정」제목을 숨김 */
  const [settingsNotionDetailOpen, setSettingsNotionDetailOpen] = useState(false);
  /** 설정 타이틀 배지용 구독 상태 (SettingsTab에서 bubble-up) */
  const [settingsSubscription, setSettingsSubscription] = useState(null);
  /** 구독 시트 열기 신호 (숫자 증가마다 열림) */
  const [openSubscribeSheetSignal, setOpenSubscribeSheetSignal] = useState(0);
  /** 프리미엄 게이트 팝업 */
  const [premiumGateOpen, setPremiumGateOpen] = useState(false);

  useKeyboardAware();

  const locale = getLocale(settings.lang);
  const t = useT(locale);
  const ko = locale === 'ko';
  const islandBarHidden = isSheetOpen || settingsIslandCoverOpen;

  const collapsedNavTitle =
    mainTab === 'log'
      ? t.log
      : mainTab === 'settings'
        ? settingsNotionDetailOpen
          ? t.notionSubpageTitle
          : t.settings
        : mainTab === 'timetable'
          ? t.homeIslandTimetable
          : t.homeIslandTimer;
  /** 타이머·시간표는 축약 제목 텍스트만 숨김 — 상단 스크림은 스크롤 겹침 방지용으로 유지 */
  const showCollapsedNavTitle = mainTab !== 'timer' && mainTab !== 'timetable';
  /** 스크롤 첫 픽셀부터 페이드 시작(메인 셸 본문) — 구간 길이는 타임블록 페이드와 근사 */
  const topScrollScrimOpacity = Math.min(1, Math.max(0, contentScrollY / 22));
  /** 홈(timer·시간표): 전역 shell::before 페이드는 플로팅 크롬까지 묻음 → Home 내부 페이드만 사용 */
  const homeChromeUsesInternalTopFade = mainTab === 'timer' || mainTab === 'timetable';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en';
  }, [locale]);

  /** 플랫폼 분기(CSS `html[data-nock-platform]`). 안드로이드/Chromium 블러·합성 이슈 폴백용. */
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    let plat = 'web';
    try {
      const cp = Capacitor.getPlatform();
      if (cp === 'android') plat = 'android';
      else if (cp === 'ios') plat = 'ios';
      else if (cp === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')) {
        plat = 'android-chrome';
      }
    } catch {
      if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')) plat = 'android-chrome';
      else plat = 'web';
    }
    root.dataset.nockPlatform = plat;
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || !loaded) return undefined;
    const onScroll = () => setContentScrollY(el.scrollTop);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loaded, mainTab, homeScreenPrompted]);

  /**
   * Capacitor 네이티브: Browser.open 등 외부 시트 종료 후 WebView layout viewport 높이가 순간 불일치하는 보정.
   * (iOS·Android 동일 변수 사용 — WKWebView/Chrome 기반 공통 현상 가능)
   * visualViewport / innerHeight 기반으로 높이 변수만 갱신(고빈도 타이머 없음).
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !loaded) return undefined;
    if (!Capacitor.isNativePlatform()) return undefined;

    const applyShellHeight = () => {
      const h = window.innerHeight;
      if (!h) return;
      document.documentElement.style.setProperty('--app-shell-height-px', `${h}px`);
      document.documentElement.setAttribute('data-app-shell-hpin', '1');
    };

    const nudgeLayout = () => {
      applyShellHeight();
      window.requestAnimationFrame(() => {
        applyShellHeight();
        window.requestAnimationFrame(applyShellHeight);
      });
    };

    nudgeLayout();

    const vv = window.visualViewport;
    const onViewportNudge = () => nudgeLayout();
    window.addEventListener('resize', onViewportNudge);
    vv?.addEventListener('resize', onViewportNudge);
    vv?.addEventListener('scroll', onViewportNudge);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') nudgeLayout();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onPageShow = () => nudgeLayout();
    window.addEventListener('pageshow', onPageShow);

    let resumeListener;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        resumeListener = await App.addListener('resume', () => nudgeLayout());
      } catch {
        /* web / missing module */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onViewportNudge);
      vv?.removeEventListener('resize', onViewportNudge);
      vv?.removeEventListener('scroll', onViewportNudge);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      resumeListener?.remove?.();
      document.documentElement.removeAttribute('data-app-shell-hpin');
      document.documentElement.style.removeProperty('--app-shell-height-px');
    };
  }, [loaded, homeScreenPrompted]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    /* 타임블록 탭은 HomeTab에서 '지금'으로 스크롤 — 여기서 0 고정하면 가려짐 */
    if (mainTab === 'timetable') return;
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
      let c = localStorage.getItem(CREDS_KEY);
      /** OAuth 콜백 직후 첫 페인트: 저장된 creds 없어도 세션 쿠키가 있으므로 oauth 스텁으로 온보딩 게이트 통과 */
      if (typeof window !== 'undefined' && fromOAuth && !parseObjectSafe(c, CREDS_KEY)) {
        try {
          const stub = JSON.stringify({ authMode: 'oauth' });
          localStorage.setItem(CREDS_KEY, stub);
          c = stub;
        } catch {
          /* */
        }
      }
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
            next.homeSurface = 'timer'; // 항상 타이머로 시작
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
      let workspaceId = null;
      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, delayMs));
        try {
          const r = await fetchWithTimeout(
            resolveApiUrl('/api/auth/session'),
            { credentials: 'include' },
            12000
          );
          const j = await r.json();
          if (cancelled) return;
          if (j?.authenticated) {
            authenticated = true;
            workspaceName = j.workspace_name || null;
            workspaceId = j.workspace_id || null;
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
        if (workspaceId) {
          base.workspaceId = workspaceId;
        }
        try {
          localStorage.setItem(CREDS_KEY, JSON.stringify(base));
        } catch { /* */ }
        return base;
      });
    })();
    return () => { cancelled = true; };
  }, [loaded]);

  // 구독 상태를 탭과 무관하게 항상 최신으로 유지 (배지, 게이트 공통)
  useEffect(() => {
    if (!loaded) return;
    const fetchSub = () => {
      const userKey = getUserKey(creds);
      // creds 자체가 없으면(미로그인) 건너뜀. userKey가 없어도 session cookie fallback 허용
      if (!creds) return;
      const url = userKey
        ? resolveApiUrl(`/api/subscription?customerKey=${encodeURIComponent(userKey)}&_t=${Date.now()}`)
        : resolveApiUrl(`/api/subscription?_t=${Date.now()}`);
      fetch(url, { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.status) setSettingsSubscription(d); })
        .catch(() => {});
    };
    fetchSub();
    // 앱 포그라운드 복귀 시 재조회 (visibilitychange + focus 이중 보장)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchSub(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchSub);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchSub);
    };
  }, [loaded, creds?.authMode, creds?.workspaceId]);

  // Supabase Realtime: subscriptions 테이블 변경 즉시 감지
  useEffect(() => {
    if (!loaded || !creds) return;
    const userKey = getUserKey(creds);
    if (!userKey) return;
    let channel;
    try {
      const supabase = getSupabaseClient();
      channel = supabase
        .channel(`sub-${userKey}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `customer_key=eq.${userKey}` },
          () => {
            // DB 변경 감지 → 최신 구독 상태 즉시 재조회
            const url = resolveApiUrl(`/api/subscription?customerKey=${encodeURIComponent(userKey)}&_t=${Date.now()}`);
            fetch(url, { credentials: 'include', cache: 'no-store' })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => { if (d?.status) setSettingsSubscription(d); })
              .catch(() => {});
          }
        )
        .subscribe();
    } catch {
      // Realtime 미설정 환경에서는 무시
    }
    return () => {
      if (channel) {
        try { getSupabaseClient().removeChannel(channel); } catch {}
      }
    };
  }, [loaded, creds?.authMode, creds?.workspaceId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    /* Capacitor WKWebView + 원격 로드에서는 SW가 캐시/가로채기로 빈 화면을 유발할 수 있어 등록하지 않고 기존 등록만 제거 */
    if (Capacitor.isNativePlatform()) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
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
        color: 'var(--text, #000)',
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

  if (!homeScreenPrompted) {
    return (
      <div className="shell" data-locale={locale}>
        <HomeScreenPrompt t={t} onDone={() => setHomeScreenPrompted(true)} />
      </div>
    );
  }

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
      className="shell shell--scroll-scrim"
      data-locale={locale}
      data-main-island={!islandBarHidden ? '1' : '0'}
      data-main-tab={mainTab}
      style={{
        ['--shell-top-scrim-opacity']: homeChromeUsesInternalTopFade ? 0 : topScrollScrimOpacity,
        ['--home-content-under-top-fade']: homeChromeUsesInternalTopFade ? topScrollScrimOpacity : 0,
      }}
    >
      {showCollapsedNavTitle && topScrollScrimOpacity > 0.04 && (
        <div
          className="app-collapsed-title-bar"
          style={{ opacity: topScrollScrimOpacity }}
          aria-hidden={topScrollScrimOpacity < 0.02}
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
            mainTab={mainTab}
            openAddSignal={addTodoSignal}
            onSheetOpenChange={setIsSheetOpen}
            onSaveSettings={saveSettings}
            onRequestAddTodo={() => setAddTodoSignal((n) => n + 1)}
            onPremiumGate={() => setPremiumGateOpen(true)}
            subscription={settingsSubscription}
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
              onPremiumGate={() => setPremiumGateOpen(true)}
              subscription={settingsSubscription}
              inBottomSheet
              onOpenHomeTimetable={() => {
                setMainTab('timetable');
                saveSettings({ ...settings, homeSurface: 'timetable' });
              }}
            />
          </>
        )}

        {mainTab === 'settings' && (
          <>
            {!settingsNotionDetailOpen && (
              <div className="page-large-title-block" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <h1 className="page-title">{t.settings}</h1>
                {settingsSubscription && (() => {
                  const st = settingsSubscription?.status;
                  const planId = settingsSubscription?.plan;
                  const withinPeriod = settingsSubscription?.next_charge_at && new Date(settingsSubscription.next_charge_at) > new Date();
                  const isActive = st === 'active' || st === 'trialing' || (st === 'cancelled' && withinPeriod);
                  const isTrial  = st === 'trialing';
                  const label    = !isActive
                    ? (ko ? 'Upgrade!' : 'Upgrade!')
                    : isTrial
                      ? (ko ? '무료체험' : 'Free Trial')
                      : planId === 'annual'
                        ? (ko ? '연간 Premium' : 'Annual Premium')
                        : (ko ? '월간 Premium' : 'Monthly Premium');
                  // Notion 선택항목 스타일 컬러
                  const style = !isActive
                    ? { background: 'rgba(235,87,87,0.12)', color: '#e04e4e' }
                    : isTrial
                      ? { background: 'rgba(52,168,83,0.12)', color: '#1e8a3e' }
                      : st === 'cancelled'
                        ? { background: 'rgba(255,140,0,0.12)', color: '#c2660a' }
                        : { background: 'rgba(35,131,226,0.12)', color: '#1a6bb5' };
                  const Icon = isActive ? Crown : Sparkles;
                  return (
                    <button
                      type="button"
                      onClick={() => { hapticLight(); setOpenSubscribeSheetSignal((n) => n + 1); }}
                      style={{
                        ...style,
                        fontSize: 12, fontWeight: 700,
                        borderRadius: 20, padding: '5px 12px 5px 10px',
                        border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        marginBottom: 6,
                        letterSpacing: '0.01em',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Icon size={12} strokeWidth={2.5} />
                      {label}
                    </button>
                  );
                })()}
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
              onSubscriptionChange={setSettingsSubscription}
              openSubscribeSheetSignal={openSubscribeSheetSignal}
              initialSubscription={settingsSubscription}
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
                <TimeBlockIslandIcon
                  fill={mainTab === 'timetable' ? 'currentColor' : 'none'}
                  stroke={mainTab === 'timetable' ? 'none' : 'currentColor'}
                />
                <span className="main-island-tab-label" style={{ position: 'relative' }}>
                  {t.homeIslandTimetable}
                  <span style={{
                    position: 'absolute',
                    top: -6,
                    right: -18,
                    fontSize: 'var(--font-size-badge)',
                    fontWeight: 'var(--font-weight-bold)',
                    letterSpacing: '0.02em',
                    color: 'var(--notion)',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}>
                    PRO
                  </span>
                </span>
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

      {/* 프리미엄 게이트 팝업 */}
      {premiumGateOpen && (
        <>
          <div
            onClick={() => setPremiumGateOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000 }}
          />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 10001, background: 'var(--bg2)', borderRadius: 20,
            padding: '24px 22px', width: 'min(300px,88vw)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              {ko ? 'Premium 기능이에요' : 'Premium feature'}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 20 }}>
              {ko
                ? 'Premium 구독으로 날짜 이동, 통계 기간 확장, 차트 집계 방식 등 모든 기능을 자유롭게 사용할 수 있어요.'
                : 'Subscribe to Premium and unlock date navigation, extended stats, chart breakdowns, and more.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPremiumGateOpen(false)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--sep)',
                  background: 'transparent', color: 'var(--text3)', fontSize: 15, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {ko ? '닫기' : 'Close'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPremiumGateOpen(false);
                  setMainTab('settings');
                  // SettingsTab이 mount된 뒤 신호를 올려야 ref 초기값과 비교가 올바르게 동작함
                  setTimeout(() => setOpenSubscribeSheetSignal((n) => n + 1), 80);
                }}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
                  background: 'var(--text)', color: 'var(--bg)', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {ko ? '구독하기' : 'Subscribe'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

