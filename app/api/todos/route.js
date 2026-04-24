// app/api/todos/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields, getReportFields } from '@/app/lib/fields';
import { queryDB, createPage, updatePage, parseTodo, toDateStr, notionFetch } from '@/app/lib/notion';

const TODO_PAGE_ICON_EMOJI = '🔘';

export async function GET(request) {
  const { token, dbTodo } = getCredentials(request);
  if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());
  const fields  = getTodoFields(request.headers);

  try {
    const resp = await queryDB(token, dbTodo, {
      filter: { property: fields.date, date: { equals: dateStr } },
      sorts:  [{ timestamp: 'created_time', direction: 'ascending' }],
      page_size: 100,
    });
    const todos = resp.results.map(p => parseTodo(p, fields)).filter(Boolean);
    return NextResponse.json({ todos });
  } catch (err) {
    // Fallback: no filter
    try {
      const resp = await queryDB(token, dbTodo, { page_size: 100 });
      const todos = resp.results
        .map(p => parseTodo(p, fields))
        .filter(Boolean)
        .filter(t => t.date === dateStr);
      return NextResponse.json({ todos, fallback: true });
    } catch (err2) {
      return NextResponse.json({ error: err2.message }, { status: 500 });
    }
  }
}

export async function POST(request) {
  const { token, dbTodo, dbReport } = getCredentials(request);
  if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const todoFields   = getTodoFields(request.headers);
  const reportFields = getReportFields(request.headers);

  try {
    const { name, date } = await request.json();
    const dateStr = date || toDateStr(new Date());

    const coreProps = {
      [todoFields.name]:  { title: [{ text: { content: name } }] },
      [todoFields.date]:  { date:  { start: dateStr } },
      [todoFields.done]:  { checkbox: false },
      [todoFields.accum]: { number: 0 },
    };

    const page = await createPage(token, {
      parent: { database_id: dbTodo },
      icon: { type: 'emoji', emoji: TODO_PAGE_ICON_EMOJI },
      properties: coreProps,
    });

    // Link to daily report (best-effort)
    if (dbReport && todoFields.dailyReport) {
      try {
        const rid = await findOrCreateReport(token, dbReport, dateStr, reportFields);
        if (rid) {
          await updatePage(token, page.id, {
            properties: { [todoFields.dailyReport]: { relation: [{ id: rid }] } },
          });
          if (reportFields.todoList) {
            let mergedTodoIds = [page.id];
            try {
              const reportPage = await notionFetch(token, 'GET', `/pages/${rid}`);
              const rel = reportPage?.properties?.[reportFields.todoList]?.relation || [];
              mergedTodoIds = Array.from(new Set([...rel.map((r) => r.id), page.id]));
            } catch {}
            await updatePage(token, rid, {
              properties: { [reportFields.todoList]: { relation: mergedTodoIds.map((id) => ({ id })) } },
            });
          }
        }
      } catch {}
    }

    return NextResponse.json({ todo: { id: page.id, name, date: dateStr, done: false, accum: 0 } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function findOrCreateReport(token, dbReport, dateStr, fields) {
  try {
    // Try both title and date property filters because users configure this field differently.
    const filters = [
      { property: fields.date, title: { equals: dateStr } },
      { property: fields.date, date: { equals: dateStr } },
    ];

    for (const filter of filters) {
      try {
        const res = await queryDB(token, dbReport, { filter, page_size: 1 });
        if (res.results.length > 0) return res.results[0].id;
      } catch {}
    }

    try {
      const p = await createPage(token, {
        parent: { database_id: dbReport },
        properties: { [fields.date]: { title: [{ text: { content: dateStr } }] } },
      });
      return p.id;
    } catch {
      const p = await createPage(token, {
        parent: { database_id: dbReport },
        properties: { [fields.date]: { date: { start: dateStr } } },
      });
      return p.id;
    }
  } catch { return null; }
}
