import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nock.studytimer',
  appName: '순공타이머',
  webDir: 'public',
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
