import { NextResponse } from 'next/server';
import { unsealData, SESSION_COOKIE, MAX_AGE } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

export async function POST(request) {
  const { nat } = await request.json().catch(() => ({}));
  if (!nat) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  // 5-minute TTL
  const payload = await unsealData(nat, 5 * 60 * 1000);
  if (!payload?.sealed) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, payload.sealed, {
    httpOnly: true,
    path: '/',
    maxAge: MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
