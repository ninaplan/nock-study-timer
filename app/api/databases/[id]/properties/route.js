// app/api/databases/[id]/properties/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getDBProps } from '@/app/lib/notion';

export async function GET(request, { params }) {
  const { token } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  try {
    const db = await getDBProps(token, params.id);
    const properties = Object.entries(db.properties || {}).map(([name, prop]) => ({
      name,
      type: prop.type,
    }));
    return NextResponse.json({ properties });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
