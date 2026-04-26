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
    { media: '(prefers-color-scheme: dark)',  color: '#1C1C1E' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* No-flash: background before globals.css + JS (avoids all-white PWA / slow network) */}
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{margin:0}html{height:100%;height:-webkit-fill-available}body{min-height:100%;min-height:-webkit-fill-available;height:100%}html,body{background:#F2F2F7;color:#111}@media (prefers-color-scheme:dark){html,body{background:#000;color:rgba(235,235,245,.92)}}@keyframes _appBootSpin{to{transform:rotate(360deg)}}`,
          }}
        />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
          crossOrigin="anonymous"
        />
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
