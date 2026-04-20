// app/api/databases/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getNotionClient } from '@/app/lib/notion';

export async function GET(request) {
  const { token } = getCredentials(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  try {
    const notion = getNotionClient(token);
    const results = [];
    let cursor = undefined;

    do {
      const resp = await notion.search({
        filter: { value: 'database', property: 'object' },
        page_size: 100,
        start_cursor: cursor,
      });
      results.push(...resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    const dbs = results.map((db) => ({
      id: db.id,
      title:
        db.title?.map((t) => t.plain_text).join('') ||
        '(제목 없음)',
    }));

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
