// app/api/databases/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getNotionClient } from '@/app/lib/notion';

// Recursively resolve parent path up to 4 levels
async function resolveParentPath(notion, parentType, parentId, cache, depth = 0) {
  if (depth > 4 || !parentId) return [];
  if (parentType === 'workspace') return ['Workspace'];

  const cacheKey = parentId;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    if (parentType === 'page_id' || parentType === 'block_id') {
      const page = await notion.pages.retrieve({ page_id: parentId });
      const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
      const title = titleProp?.title?.map(t => t.plain_text).join('') || '(페이지)';

      // Recurse upward
      const parentPath = await resolveParentPath(
        notion,
        page.parent?.type,
        page.parent?.page_id || page.parent?.block_id,
        cache,
        depth + 1
      );
      const result = [...parentPath, title];
      cache[cacheKey] = result;
      return result;
    }
  } catch {}
  return [];
}

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

    // Resolve paths with shared cache
    const pathCache = {};
    const dbs = await Promise.all(
      results.map(async (db) => {
        const dbTitle = db.title?.map(t => t.plain_text).join('') || '(제목 없음)';
        const parentType = db.parent?.type;
        const parentId   = db.parent?.page_id || db.parent?.block_id;

        const parentSegments = await resolveParentPath(notion, parentType, parentId, pathCache);
        const fullPath = [...parentSegments, dbTitle].join(' › ');

        return {
          id:       db.id,
          title:    dbTitle,
          path:     fullPath,
          segments: [...parentSegments, dbTitle],
        };
      })
    );

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
