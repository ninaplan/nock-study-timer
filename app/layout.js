// app/layout.js
import './globals.css';
import { getPublicBasePath } from '@/app/lib/basePath';

/** Bump when replacing public/icon.png so browsers fetch the new favicon (they cache aggressively). */
const ICON_CACHE_BUST = 'v=17';
const BASE = getPublicBasePath();

export const metadata = {
  title: '노크 순공타이머',
  description: '집중한 시간이 쌓이는 곳',
  icons: {
    icon: [
      { url: `${BASE}/icon.png?${ICON_CACHE_BUST}`, sizes: 'any', type: 'image/png' },
      { url: `${BASE}/icon-192.png?${ICON_CACHE_BUST}`, sizes: '192x192', type: 'image/png' },
      { url: `${BASE}/icon-512.png?${ICON_CACHE_BUST}`, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: `${BASE}/apple-touch-icon.png?${ICON_CACHE_BUST}`, type: 'image/png' }],
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
    /* Match body/--bg in dark mode so Safari/PWA doesn’t paint a lighter strip under the status bar */
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
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
        <link rel="icon" href={`${BASE}/icon.png?${ICON_CACHE_BUST}`} type="image/png" sizes="any" />
        {/* Android Chrome often picks manifest / explicit sizes for tabs & install */}
        <link rel="icon" href={`${BASE}/icon-192.png?${ICON_CACHE_BUST}`} type="image/png" sizes="192x192" />
        <link rel="icon" href={`${BASE}/icon-512.png?${ICON_CACHE_BUST}`} type="image/png" sizes="512x512" />
        {/* precomposed = iOS에 효과(광택/입체) 적용하지 말 것 */}
        <link rel="apple-touch-icon-precomposed" href={`${BASE}/apple-touch-icon.png?${ICON_CACHE_BUST}`} />
        <link rel="apple-touch-icon" href={`${BASE}/apple-touch-icon.png?${ICON_CACHE_BUST}`} />
        <link rel="manifest" href={`${BASE}/manifest.json`} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* black-translucent: 노치·상태줄 영역이 앱 배경/스크림과 이어지게 (라이트·다크 공통, 다크에서 밝은 띠 방지) */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* 라이트↔다크 전환 시 Safari 상단 theme-color·배경 한 박자 어긋남 완화 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              function shellBg(){
                try{
                  var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches;
                  var bg=d?'#000000':'#F2F2F7';
                  document.documentElement.style.backgroundColor=bg;
                  if(document.body)document.body.style.backgroundColor=bg;
                  var nx=document.getElementById('__next');
                  if(nx)nx.style.backgroundColor=bg;
                  document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',bg);});
                }catch(e){}
              }
              function bind(){
                shellBg();
                if(window.matchMedia){
                  var mq=window.matchMedia('(prefers-color-scheme: dark)');
                  if(mq.addEventListener)mq.addEventListener('change',shellBg);
                  else if(mq.addListener)mq.addListener(shellBg);
                }
              }
              if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
              else bind();
            })();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
