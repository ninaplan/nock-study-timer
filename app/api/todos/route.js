// app/api/todos/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields, getReportFields } from '@/app/lib/fields';
import {
  queryDatabaseAllPages,
  createPage,
  createPageWithDefaultTemplate,
  getDataSourceIdForDatabase,
  parseTodo,
  toDateStr,
} from '@/app/lib/notion';
import { linkTodoToReportForDate } from '@/app/lib/todoReportLink';

const TODO_PAGE_ICON_EMOJI = '🔘';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
/** Inclusive cal-day range — more reliable than `equals` (datetime / timezone / range cells). */
function dateInCalendarDayFilter(datePropertyName, dateStr) {
  return {
    and: [
      { property: datePropertyName, date: { on_or_after: dateStr } },
      { property: datePropertyName, date: { on_or_before: dateStr } },
    ],
  };
}

function mapAndFilterByDate(pages, fields, dateStr) {
  return pages
    .map(p => parseTodo(p, fields))
    .filter(Boolean)
    .filter(t => t.date === dateStr);
}

export async function GET(request) {
  try {
    const { token, dbTodo } = await getCredentials(request);
    if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') || toDateStr(new Date());
    const fields  = getTodoFields(request.headers);

    const primaryBody = {
      filter: dateInCalendarDayFilter(fields.date, dateStr),
      sorts:  [{ timestamp: 'created_time', direction: 'ascending' }],
    };

    const runFallback = async (reason) => {
      // Recent pages first, then in-memory by calendar date (Notion can’t filter some formula date columns)
      const pages = await queryDatabaseAllPages(
        token,
        dbTodo,
        {
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        },
        { maxPages: 30 }
      );
      return {
        todos: mapAndFilterByDate(pages, fields, dateStr),
        fallback: true,
        fallbackReason: reason,
      };
    };

    try {
      const results = await queryDatabaseAllPages(token, dbTodo, primaryBody);
      let todos = mapAndFilterByDate(results, fields, dateStr);
      let fallback = false;
      let fallbackReason;
      // Primary 0 rows: may be truly empty, or a filter/API quirk; scan recent pages by last_edited
      if (todos.length === 0 && results.length === 0) {
        const again = await runFallback('empty_primary');
        if (again.todos.length > 0) {
          todos = again.todos;
          fallback = true;
          fallbackReason = again.fallbackReason;
        }
      }
      return NextResponse.json(
        { todos, ...(fallback ? { fallback, fallbackReason } : {}) },
        { headers: noStore }
      );
    } catch (err) {
      try {
        const { todos, fallback, fallbackReason } = await runFallback(String(err?.message || err));
        return NextResponse.json(
          { todos, fallback, fallbackReason },
          { headers: noStore }
        );
      } catch (err2) {
        return NextResponse.json({ error: err2?.message || String(err2) }, { status: 500 });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'GET /api/todos failed' }, { status: 500 });
  }
}

export async function POST(request) {
  const { token, dbTodo, dbReport } = await getCredentials(request);
  if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const todoFields   = getTodoFields(request.headers);
  const reportFields = getReportFields(request.headers);

  try {
    const { name, date, accum } = await request.json();
    const dateStr = date || toDateStr(new Date());
    const accumNum = typeof accum === 'number' && !Number.isNaN(accum) ? accum : 0;

    const coreProps = {
      [todoFields.name]:  { title: [{ text: { content: name } }] },
      [todoFields.date]:  { date:  { start: dateStr } },
      [todoFields.done]:  { checkbox: false },
      [todoFields.accum]: { number: accumNum },
    };

    let page;
    try {
      const dataSourceId = await getDataSourceIdForDatabase(token, dbTodo);
      if (dataSourceId) {
        page = await createPageWithDefaultTemplate(token, {
          parent: { type: 'data_source_id', data_source_id: dataSourceId },
          properties: coreProps,
          template: { type: 'default' },
        });
      } else {
        throw new Error('no_data_source');
      }
    } catch {
      page = await createPage(token, {
        parent: { database_id: dbTodo },
        icon: { type: 'emoji', emoji: TODO_PAGE_ICON_EMOJI },
        properties: coreProps,
      });
    }

    if (dbReport && todoFields.dailyReport) {
      try {
        await linkTodoToReportForDate(token, dbReport, page.id, dateStr, todoFields, reportFields);
      } catch {}
    }

    return NextResponse.json({ todo: { id: page.id, name, date: dateStr, done: false, accum: accumNum } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
