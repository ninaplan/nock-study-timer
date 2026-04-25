import { NextResponse } from 'next/server';
import { STATE_COOKIE } from '@/app/lib/notion-session';
import { getNotionOAuthRedirectUri } from '@/app/lib/notion-oauth-redirect';

/** Node: Edge sandbox에서 `import` 시 "reading 'default'" 오류가 날 수 있어 Node 런타임 사용. */
export const runtime = 'nodejs';

export async function GET(request) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const redirectUri = getNotionOAuthRedirectUri(request);
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'NOTION_OAUTH_CLIENT_ID / NOTION_OAUTH_REDIRECT_URI not configured' },
      { status: 501 }
    );
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
  const res = NextResponse.redirect(u.toString());
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    path: '/',
    maxAge: 600,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
