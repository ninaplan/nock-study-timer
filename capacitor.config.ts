import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nock.studytimer',
  appName: '순공타이머',
  webDir: 'public',
  server: {
    url: 'https://timerapp.nock.kr',
    cleartext: false
  }
};

export default config;
