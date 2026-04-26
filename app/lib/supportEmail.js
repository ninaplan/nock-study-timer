/**
 * Opens the system mail client with a pre-filled support message (mailto:).
 * Body is plain text (no ** bold — many mail clients show asterisks literally).
 * Default To: nockcreator@gmail.com. Override with NEXT_PUBLIC_SUPPORT_EMAIL in Vercel / .env.local.
 * Optional: NEXT_PUBLIC_APP_VERSION, NEXT_PUBLIC_APP_BUILD (build number).
 */

const DEFAULT_SUPPORT_EMAIL = 'nockcreator@gmail.com';

export function getAppVersionLabel() {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0';
  const b = process.env.NEXT_PUBLIC_APP_BUILD;
  return b ? `${v} (${b})` : v;
}

/** Short, readable device + OS (mailto-friendly, no long UA) */
function getDeviceLine() {
  if (typeof window === 'undefined' || !window.navigator) return 'unknown';
  const ua = window.navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS ([\d_]+)/);
    const ios = m ? m[1].replace(/_/g, '.') : '?';
    const d = /iPad/.test(ua) && !/iPhone/.test(ua) ? 'iPad' : 'iPhone';
    return `${d}, iOS ${ios}`;
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    return m ? `Android, ${m[1]}` : 'Android';
  }
  const plat = window.navigator.platform || 'web';
  return `Web (${plat})`;
}

/**
 * @param {'ko' | 'en'} locale
 */
function buildDebugBlock(locale) {
  if (typeof window === 'undefined') return '';
  const isKo = locale === 'ko';
  const nav = window.navigator;
  let notif = isKo ? '알 수 없음' : 'Unknown';
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') notif = isKo ? '예' : 'Yes';
      else if (Notification.permission === 'denied') notif = isKo ? '아니오' : 'No';
      else notif = isKo ? '요청 전' : 'Not asked';
    }
  } catch {
    notif = 'N/A';
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const loc =
    (Array.isArray(nav.languages) && nav.languages[0]) || nav.language || 'unknown';
  const verLine = getAppVersionLabel();
  const deviceLine = getDeviceLine();
  const ts = new Date().toISOString();
  if (isKo) {
    return [
      `- 앱 버전: ${verLine}`,
      `- 기기: ${deviceLine}`,
      `- 알림 허용 여부: ${notif}`,
      `- 로케일: ${loc}`,
      `- 시간대: ${tz}`,
      `- 타임스탬프(UTC): ${ts}`,
    ].join('\n');
  }
  return [
    `- App version: ${verLine}`,
    `- Device: ${deviceLine}`,
    `- Notifications enabled: ${notif}`,
    `- Locale: ${loc}`,
    `- Time zone: ${tz}`,
    `- Timestamp: ${ts}`,
  ].join('\n');
}

function buildBody(locale) {
  const isKo = locale === 'ko';
  const intro = isKo
    ? '아래에 증상이나 재현 방법을 적어 주세요:\n\n\n'
    : 'Please describe the issue:\n\n\n';
  const debugLabel = isKo ? 'Debug info:' : 'Debug info:';
  return `${intro}${debugLabel}\n${buildDebugBlock(locale)}`;
}

/**
 * @param {{ locale?: 'ko' | 'en', appName?: string }} opts
 */
export function openSupportEmail(opts = {}) {
  if (typeof window === 'undefined') return;
  const locale = opts.locale === 'en' ? 'en' : 'ko';
  const appName = opts.appName || 'Nock Study Timer';
  const to = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();
  const subject = encodeURIComponent(`${appName} Support`);
  const body = encodeURIComponent(buildBody(locale));
  const q = `subject=${subject}&body=${body}`;
  const href = to ? `mailto:${to}?${q}` : `mailto:?${q}`;
  window.location.href = href;
}
