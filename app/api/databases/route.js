// app/api/databases/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { databaseIdFromSearchItem, notionFetch, searchAllDatabasesForPicker } from '@/app/lib/notion';

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
  const { token } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  try {
    const { legacy, fromDataSources } = await searchAllDatabasesForPicker(token);
    const merged = [...legacy, ...fromDataSources];
    const seen = new Set();
    const unique = [];
    for (const item of merged) {
      const id = databaseIdFromSearchItem(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(item);
    }

    const cache = {};
    const dbs = await Promise.all(unique.map(async (db) => {
      const title       = db.title?.map(t => t.plain_text).join('') || '(제목 없음)';
      const description = db.description?.map(t => t.plain_text).join('') || '';
      let parentId = null;
      if (db.object === 'database') {
        parentId = db.parent?.page_id || db.parent?.block_id;
      } else if (db.object === 'data_source' && db.database_parent) {
        const dp = db.database_parent;
        if (dp.type === 'page_id') parentId = dp.page_id;
        else if (dp.type === 'block_id') parentId = dp.block_id;
      }
      const parentTitle = parentId ? await getPageTitle(token, parentId, cache) : '';
      const label       = parentTitle ? `${parentTitle} › ${title}` : title;
      return { id: databaseIdFromSearchItem(db), title, description, label };
    }));

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
