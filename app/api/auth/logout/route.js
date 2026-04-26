import { NextResponse } from 'next/server';
import { SESSION_COOKIE, STATE_COOKIE, getNotionSessionFromCookie } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

async function revokeNotionToken(accessToken) {
  const id = process.env.NOTION_OAUTH_CLIENT_ID;
  const secret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  if (!id || !secret || !accessToken) return;
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  try {
    await fetch('https://api.notion.com/v1/oauth/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: accessToken }),
    });
  } catch {
    /* best-effort: cookie clear still unbinds the app from this user */
  }
}

export async function POST(request) {
  const s = await getNotionSessionFromCookie(request);
  if (s?.access_token) {
    await revokeNotionToken(s.access_token);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
