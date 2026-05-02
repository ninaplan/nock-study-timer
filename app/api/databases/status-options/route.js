export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getDBProps } from '@/app/lib/notion';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

/**
 * Collect human-readable option names from a Notion `select` or `status` database property.
 */
function optionNamesFromSchemaProp(prop) {
  if (!prop || typeof prop !== 'object') {
    return { propertyType: null, options: [] };
  }
  const t = prop.type;
  if (t === 'select' && Array.isArray(prop.select?.options)) {
    const raw = prop.select.options.map((o) => o?.name).filter(Boolean);
    return { propertyType: 'select', options: [...new Set(raw)] };
  }
  if (t === 'status' && Array.isArray(prop.status?.options)) {
    const raw = prop.status.options.map((o) => o?.name).filter(Boolean);
    return { propertyType: 'status', options: [...new Set(raw)] };
  }
  return { propertyType: t || 'unsupported', options: [] };
}

export async function GET(request) {
  try {
    const { token } = await getCredentials(request);
    if (!token) {
      return NextResponse.json({ error: 'Missing token', options: [] }, { status: 401, headers: noStore });
    }

    const { searchParams } = new URL(request.url);
    const dbId = searchParams.get('dbId');
    const propertyName = searchParams.get('property');
    if (!dbId || !propertyName) {
      return NextResponse.json({ error: 'Missing dbId or property', options: [] }, { status: 400, headers: noStore });
    }

    const db = await getDBProps(token, dbId);
    const prop = db?.properties?.[propertyName];
    const { propertyType, options } = optionNamesFromSchemaProp(prop);

    return NextResponse.json({ options, propertyType }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'status-options failed', options: [], propertyType: null },
      { status: 500, headers: noStore }
    );
  }
}
