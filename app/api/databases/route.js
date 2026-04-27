// app/api/databases/route.js
// Notion search는 호출·페이징이 길 수 있어 edge 제한(실행/CPU)에 걸리지 않게 node 사용
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { databaseIdFromSearchItem, searchAllDatabasesForPicker } from '@/app/lib/notion';

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

    // 부모 페이지 제목은 UI(DbPicker)에 쓰지 않으며, N회 추가 Notion API 호출만 유발 → 생략
    const dbs = unique.map((db) => {
      const title = db.title?.map((t) => t.plain_text).join('') || '(제목 없음)';
      const description = db.description?.map((t) => t.plain_text).join('') || '';
      return { id: databaseIdFromSearchItem(db), title, description, label: title };
    });

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
