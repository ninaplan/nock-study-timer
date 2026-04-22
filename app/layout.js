// app/layout.js
import './globals.css';

/** Bump when replacing public/icon.png so browsers fetch the new favicon (they cache aggressively). */
const ICON_CACHE_BUST = 'v=5';

export const metadata = {
  title: '노크 순공타이머',
  description: '집중한 시간이 쌓이는 곳',
  icons: {
    icon: [{ url: `/icon.png?${ICON_CACHE_BUST}`, sizes: 'any', type: 'image/png' }],
    apple: [{ url: `/apple-touch-icon.png?${ICON_CACHE_BUST}`, type: 'image/png' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Explicit fallback — some clients ignore metadata.icons */}
        <link rel="icon" href={`/icon.png?${ICON_CACHE_BUST}`} type="image/png" sizes="any" />
        <link rel="apple-touch-icon" href={`/apple-touch-icon.png?${ICON_CACHE_BUST}`} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Nanum Square Round — link 방식으로 폰트 블로킹 방지 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Square+Round:wght@400;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
