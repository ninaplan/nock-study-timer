// app/layout.js
import './globals.css';

/** Bump when replacing public/icon.png so browsers fetch the new favicon (they cache aggressively). */
const ICON_CACHE_BUST = 'v=11';

export const metadata = {
  title: '노크 순공타이머',
  description: '집중한 시간이 쌓이는 곳',
  icons: {
    icon: [
      { url: `/icon.png?${ICON_CACHE_BUST}`, sizes: 'any', type: 'image/png' },
      { url: `/icon-192.png?${ICON_CACHE_BUST}`, sizes: '192x192', type: 'image/png' },
      { url: `/icon-512.png?${ICON_CACHE_BUST}`, sizes: '512x512', type: 'image/png' },
    ],
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
        {/* Android Chrome often picks manifest / explicit sizes for tabs & install */}
        <link rel="icon" href={`/icon-192.png?${ICON_CACHE_BUST}`} type="image/png" sizes="192x192" />
        <link rel="icon" href={`/icon-512.png?${ICON_CACHE_BUST}`} type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href={`/apple-touch-icon.png?${ICON_CACHE_BUST}`} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>{children}</body>
    </html>
  );
}
