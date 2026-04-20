// app/api/databases/[id]/properties/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getNotionClient } from '@/app/lib/notion';

export async function GET(request, { params }) {
  const { token } = getCredentials(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  try {
    const notion = getNotionClient(token);
    const db = await notion.databases.retrieve({ database_id: params.id });

    const properties = Object.entries(db.properties).map(([name, prop]) => ({
      name,
      type: prop.type,
    }));

    return NextResponse.json({ properties });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
