import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nock.studytimer',
  appName: '순공타이머',
  webDir: 'public',
  /** WebView 뒤 깔리는 색 — 투명/기본 검정이면 스플래시 직후 “검은 화면”으로 보이기 쉽움 (app/layout 인라인 라이트 배경과 맞춤) */
  backgroundColor: '#F2F2F7',
  ios: {
    backgroundColor: '#F2F2F7',
    /** iOS 16.4+ — 서드파티 앱 WKWebView도 Mac Safari 개발자 메뉴에 뜨게 함(Release 아카이브에도 필요 시 true 유지) */
    webContentsDebuggingEnabled: true,
  },
  server: {
    url: 'https://timerapp.nock.kr',
    cleartext: false,
    allowNavigation: ['*.nock.kr']
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      iosSpinnerStyle: 'large',
      spinnerColor: '#999999',
      showSpinner: false,
    },
  },
};

export default config;
