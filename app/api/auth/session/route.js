import { NextResponse } from 'next/server';
import { getNotionTokenFromCookie } from '@/app/lib/notion-session';

export const runtime = 'nodejs';

export async function GET(request) {
  const t = await getNotionTokenFromCookie(request);
  return NextResponse.json({ authenticated: !!t });
}
