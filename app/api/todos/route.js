// app/api/todos/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields, getReportFields } from '@/app/lib/fields';
import { getNotionClient, parseTodo, toDateStr } from '@/app/lib/notion';

export async function GET(request) {
  const { token, dbTodo } = getCredentials(request);
  if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());
  const fields  = getTodoFields(request.headers);

  try {
    const notion = getNotionClient(token);
    const resp = await notion.databases.query({
      database_id: dbTodo,
      filter: { property: fields.date, date: { equals: dateStr } },
      sorts:  [{ property: fields.name, direction: 'ascending' }],
    });
    return NextResponse.json({ todos: resp.results.map(p => parseTodo(p, fields)) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    const notion  = getNotionClient(token);

    // Find or create report (optional)
    let reportId = null;
    if (dbReport) {
      try { reportId = await findOrCreateReport(notion, dbReport, dateStr, reportFields); }
      catch (e) { console.error('Report link failed:', e.message); }
    }

    const properties = {
      [todoFields.name]:  { title: [{ text: { content: name } }] },
      [todoFields.date]:  { date:  { start: dateStr } },
      [todoFields.done]:  { checkbox: false },
      [todoFields.accum]: { number: 0 },
    };
    if (reportId && todoFields.dailyReport) {
      properties[todoFields.dailyReport] = { relation: [{ id: reportId }] };
    }

    const page = await notion.pages.create({
      parent: { database_id: dbTodo },
      properties,
    });

    return NextResponse.json({ todo: { id: page.id, name, date: dateStr, done: false, accum: 0 } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// The Daily Report DB's 날짜 field is a TITLE property (not date type).
// So we search by title, not by date filter.
async function findOrCreateReport(notion, dbReport, dateStr, reportFields) {
  const existing = await notion.databases.query({
    database_id: dbReport,
    filter: {
      property: reportFields.date,
      title: { equals: dateStr },
    },
  });
  if (existing.results.length > 0) return existing.results[0].id;

  // Create — only set the title property
  const page = await notion.pages.create({
    parent: { database_id: dbReport },
    properties: {
      [reportFields.date]: { title: [{ text: { content: dateStr } }] },
    },
  });
  return page.id;
}
