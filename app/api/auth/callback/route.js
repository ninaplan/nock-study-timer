import { NextResponse } from 'next/server';
import { sealSession, STATE_COOKIE, SESSION_COOKIE, MAX_AGE } from '@/app/lib/notion-session';
import { getNotionOAuthRedirectUri } from '@/app/lib/notion-oauth-redirect';

export const runtime = 'nodejs';

function basicB64(id, secret) {
  return btoa(`${id}:${secret}`);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const err = searchParams.get('error');
  const base = new URL(request.url).origin;
  if (err) {
    return NextResponse.redirect(
      new URL(`/?error=oauth&reason=${encodeURIComponent(err)}`, base)
    );
  }
  const code = searchParams.get('code');
  const stateQ = searchParams.get('state');
  const stateC = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !stateQ || !stateC || stateQ !== stateC) {
    return NextResponse.redirect(
      new URL('/?error=oauth&reason=state', base)
    );
  }
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  const redirectUri = getNotionOAuthRedirectUri(request);
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'OAuth env missing' }, { status: 501 });
  }
  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicB64(clientId, clientSecret)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(
        `/?error=oauth&reason=${encodeURIComponent(data?.message || 'token')}`,
        base
      )
    );
  }
  const sealed = await sealSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    workspace_id: data.workspace_id,
    bot_id: data.bot_id,
    workspace_name: data.workspace_name,
  });
  const res = NextResponse.redirect(new URL('/?onboarding=db&oauth=1', base));
  res.cookies.set(SESSION_COOKIE, sealed, {
    httpOnly: true,
    path: '/',
    maxAge: MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
