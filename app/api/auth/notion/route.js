import { NextResponse } from 'next/server';
import { STATE_COOKIE } from '@/app/lib/notion-session';
import { getNotionOAuthRedirectUri } from '@/app/lib/notion-oauth-redirect';

/** Node: Edge sandbox에서 `import` 시 "reading 'default'" 오류가 날 수 있어 Node 런타임 사용. */
export const runtime = 'nodejs';

function buildAuthorizeRequest(request) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const redirectUri = getNotionOAuthRedirectUri(request);
  if (!clientId || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push('NOTION_OAUTH_CLIENT_ID');
    if (!redirectUri) missing.push('NOTION_OAUTH_REDIRECT_URI');
    return { error: { status: 501, body: { error: `Missing env: ${missing.join(', ')}` } } };
  }
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const state = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  const u = new URL('https://api.notion.com/v1/oauth/authorize');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('owner', 'user');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  // 재연결·다른 계정 선택 유도(Notion/게이트웨이가 OIDC로 넘기면). 무시되면 쿼리만 추가됨.
  if (request && typeof request.url === 'string') {
    const wantReauth = new URL(request.url).searchParams.get('reauth') === '1';
    if (wantReauth) {
      u.searchParams.set('prompt', 'login');
      u.searchParams.set('max_age', '0');
    }
  }
  return { url: u.toString(), state };
}

const stateCookieOpts = {
  httpOnly: true,
  path: '/',
  maxAge: 600,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

function withStateCookie(res, state) {
  res.cookies.set(STATE_COOKIE, state, stateCookieOpts);
  return res;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wantJson = searchParams.get('format') === 'json';

  const built = buildAuthorizeRequest(request);
  if (built.error) {
    return NextResponse.json(built.error.body, { status: built.error.status });
  }
  const { url, state } = built;

  if (wantJson) {
    return withStateCookie(NextResponse.json({ url }), state);
  }
  return withStateCookie(NextResponse.redirect(url), state);
}
