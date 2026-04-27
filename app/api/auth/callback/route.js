import { NextResponse } from 'next/server';
import { sealSession, STATE_COOKIE, SESSION_COOKIE, OAUTH_INTENT_COOKIE, MAX_AGE } from '@/app/lib/notion-session';
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
  let workspaceName = data.workspace_name;
  if (typeof workspaceName === 'string') {
    const t = workspaceName.trim();
    workspaceName = t || null;
  } else {
    workspaceName = null;
  }
  // Notion token에 workspace_name이 없을 때: /v1/users/me(봇) 표시명으로 보강
  if (!workspaceName && data.access_token) {
    try {
      const u = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          'Notion-Version': '2022-06-28',
        },
      });
      const uj = await u.json();
      if (u.ok && typeof uj?.name === 'string' && uj.name.trim()) {
        workspaceName = uj.name.trim();
      }
    } catch { /* */ }
  }
  const sealed = await sealSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    workspace_id: data.workspace_id,
    bot_id: data.bot_id,
    workspace_name: workspaceName,
  });
  const intent = request.cookies.get(OAUTH_INTENT_COOKIE)?.value;
  const afterAuth =
    intent === 'settings' ? '/?oauth=1&settingsNotion=1' : '/?onboarding=db&oauth=1';
  const res = NextResponse.redirect(new URL(afterAuth, base));
  res.cookies.set(SESSION_COOKIE, sealed, {
    httpOnly: true,
    path: '/',
    maxAge: MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(OAUTH_INTENT_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
