// app/api/databases/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { searchDBs, notionFetch } from '@/app/lib/notion';

async function getPageTitle(token, pageId, cache) {
  if (cache[pageId]) return cache[pageId];
  try {
    const page = await notionFetch(token, 'GET', `/pages/${pageId}`);
    const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
    const title = titleProp?.title?.map(t => t.plain_text).join('') || '';
    cache[pageId] = title;
    return title;
  } catch { return ''; }
}

export async function GET(request) {
  const { token } = getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  try {
    const results = [];
    let cursor;
    do {
      const resp = await searchDBs(token, cursor);
      results.push(...resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    const cache = {};
    const dbs = await Promise.all(results.map(async (db) => {
      const title       = db.title?.map(t => t.plain_text).join('') || '(제목 없음)';
      const description = db.description?.map(t => t.plain_text).join('') || '';
      const parentId    = db.parent?.page_id || db.parent?.block_id;
      const parentTitle = parentId ? await getPageTitle(token, parentId, cache) : '';
      const label       = parentTitle ? `${parentTitle} › ${title}` : title;
      return { id: db.id, title, description, label };
    }));

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
