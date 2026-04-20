// app/api/log/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields } from '@/app/lib/fields';
import { getNotionClient, parseTodo } from '@/app/lib/notion';

export async function POST(request) {
  const { token, dbTodo } = getCredentials(request);
  if (!token || !dbTodo) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const fields = getTodoFields(request.headers);

  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    const notion = getNotionClient(token);

    const allTodos = [];
    let cursor = undefined;

    do {
      const resp = await notion.databases.query({
        database_id: dbTodo,
        filter: {
          and: [
            { property: fields.date, date: { on_or_after: startDate } },
            { property: fields.date, date: { on_or_before: endDate } },
          ],
        },
        sorts: [{ property: fields.date, direction: 'ascending' }],
        page_size: 100,
        start_cursor: cursor,
      });

      allTodos.push(...resp.results.map((p) => parseTodo(p, fields)));
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    return NextResponse.json({ todos: allTodos });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
