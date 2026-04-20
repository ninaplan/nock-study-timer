// app/api/log/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields } from '@/app/lib/fields';
import { queryDB, parseTodo } from '@/app/lib/notion';

export async function POST(request) {
  const { token, dbTodo } = getCredentials(request);
  if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const fields = getTodoFields(request.headers);
  try {
    const { startDate, endDate } = await request.json();

    const allTodos = [];
    let cursor;
    do {
      const resp = await queryDB(token, dbTodo, {
        filter: {
          and: [
            { property: fields.date, date: { on_or_after:  startDate } },
            { property: fields.date, date: { on_or_before: endDate   } },
          ],
        },
        sorts: [{ property: fields.date, direction: 'ascending' }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      allTodos.push(...resp.results.map(p => parseTodo(p, fields)).filter(Boolean));
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    return NextResponse.json({ todos: allTodos });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
