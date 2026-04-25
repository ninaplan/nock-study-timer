import { NextResponse } from 'next/server';
import { getNotionSessionFromCookie } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

export async function GET(request) {
  const s = await getNotionSessionFromCookie(request);
  const authed = !!s?.access_token;
  return NextResponse.json({
    authenticated: authed,
    workspace_name: authed ? (s.workspace_name || null) : null,
    workspace_id: authed ? (s.workspace_id || null) : null,
  });
}
