/**
 * Opens the system mail client with a pre-filled support message (mailto:).
 * Default To: nockcreator@gmail.com. Override with NEXT_PUBLIC_SUPPORT_EMAIL in Vercel / .env.local.
 * Optional: NEXT_PUBLIC_APP_VERSION, NEXT_PUBLIC_APP_BUILD (build number).
 */

const DEFAULT_SUPPORT_EMAIL = 'nockcreator@gmail.com';

export function getAppVersionLabel() {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0';
  const b = process.env.NEXT_PUBLIC_APP_BUILD;
  return b ? `${v} (${b})` : v;
}

/**
 * @param {'ko' | 'en'} locale
 */
function buildDebugBlock(locale) {
  if (typeof window === 'undefined') return '';
  const isKo = locale === 'ko';
  const nav = window.navigator;
  const ua = nav.userAgent || 'unknown';
  let notif = isKo ? '알 수 없음' : 'Unknown';
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') notif = isKo ? '허용' : 'Yes';
      else if (Notification.permission === 'denied') notif = isKo ? '거부' : 'No';
      else notif = isKo ? 'default / 요청 전' : 'default / not asked';
    }
  } catch {
    notif = 'N/A';
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const langs = Array.isArray(nav.languages) && nav.languages.length
    ? nav.languages.slice(0, 5).join(', ')
    : nav.language || 'unknown';
  const pwa = window.matchMedia?.('(display-mode: standalone)')?.matches
    ? (isKo ? '예 (PWA)' : 'Yes (PWA)')
    : (isKo ? '아니오 (브라우저 탭)' : 'No (browser tab)');
  const v = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0';
  const build = process.env.NEXT_PUBLIC_APP_BUILD || '';
  const verLine = build ? `${v} (${build})` : v;
  const href = typeof window.location?.href === 'string' ? window.location.href : '';
  const ts = new Date().toISOString();
  const pairs = isKo
    ? [
        ['앱 버전', verLine],
        ['PWA / 단독 실행', pwa],
        ['기기 / UA', ua],
        ['알림', notif],
        ['로케일', langs],
        ['시간대', tz],
        ['페이지 URL', href || '(없음)'],
        ['타임스탬프(UTC)', ts],
      ]
    : [
        ['App version', verLine],
        ['PWA / standalone', pwa],
        ['Device / UA', ua],
        ['Notifications', notif],
        ['Locale', langs],
        ['Time zone', tz],
        ['Page URL', href || '(empty)'],
        ['Timestamp (UTC)', ts],
      ];
  // Plain-text mail: **label** is widely recognized as “bold” when pasted or in Markdown-aware clients
  return pairs.map(([label, value]) => `**${label}:** ${value}`).join('\n');
}

function buildBody(locale) {
  const isKo = locale === 'ko';
  const userBlock = isKo
    ? '【 직접 입력 】\n증상이나 재현 방법을 아래에 적어 주세요.\n\n\n\n'
    : '【 Your message 】\nDescribe the issue or steps to reproduce below.\n\n\n\n';
  const autoLabel = isKo ? '【 자동 수집 · 환경 】' : '【 Auto-collected environment 】';
  const div = isKo ? '──────────────────' : '──────────────────';
  return `${userBlock}${div}\n${autoLabel}\n\n${buildDebugBlock(locale)}`;
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
