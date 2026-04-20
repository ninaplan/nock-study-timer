// app/api/databases/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getNotionClient } from '@/app/lib/notion';

export async function GET(request) {
  const { token } = getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

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

    // Fetch parent page titles for path info
    const pageIds = [...new Set(
      results
        .filter((db) => db.parent?.type === 'page_id')
        .map((db) => db.parent.page_id)
    )];

    const pageTitles = {};
    await Promise.all(
      pageIds.map(async (pageId) => {
        try {
          const page = await notion.pages.retrieve({ page_id: pageId });
          const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
          const title = titleProp?.title?.map((t) => t.plain_text).join('') || '';
          pageTitles[pageId] = title;
        } catch {}
      })
    );

    const dbs = results.map((db) => {
      const dbTitle = db.title?.map((t) => t.plain_text).join('') || '(제목 없음)';
      let parentTitle = '';
      if (db.parent?.type === 'page_id') {
        parentTitle = pageTitles[db.parent.page_id] || '';
      } else if (db.parent?.type === 'workspace') {
        parentTitle = 'Workspace';
      } else if (db.parent?.type === 'block_id') {
        parentTitle = '(하위 블록)';
      }
      return {
        id: db.id,
        title: dbTitle,
        parentTitle,
        path: parentTitle ? `${parentTitle} / ${dbTitle}` : dbTitle,
      };
    });

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
