// app/api/todos/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields, getReportFields } from '@/app/lib/fields';
import { getNotionClient, parseTodo, toDateStr } from '@/app/lib/notion';

export async function GET(request) {
  const { token, dbTodo } = getCredentials(request);
  if (!token || !dbTodo) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());

  const fields = getTodoFields(request.headers);

  try {
    const notion = getNotionClient(token);
    const resp = await notion.databases.query({
      database_id: dbTodo,
      filter: {
        property: fields.date,
        date: { equals: dateStr },
      },
      sorts: [{ property: fields.name, direction: 'ascending' }],
    });

    const todos = resp.results.map((p) => parseTodo(p, fields));
    return NextResponse.json({ todos });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { token, dbTodo, dbReport } = getCredentials(request);
  if (!token || !dbTodo) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const todoFields = getTodoFields(request.headers);
  const reportFields = getReportFields(request.headers);

  try {
    const body = await request.json();
    const { name, date } = body;
    const dateStr = date || toDateStr(new Date());

    const notion = getNotionClient(token);

    // Find or create Daily Report for the date
    let reportId = null;
    if (dbReport) {
      reportId = await findOrCreateReport(notion, dbReport, dateStr, reportFields);
    }

    // Create todo page
    const properties = {
      [todoFields.name]: { title: [{ text: { content: name } }] },
      [todoFields.date]: { date: { start: dateStr } },
      [todoFields.done]: { checkbox: false },
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

async function findOrCreateReport(notion, dbReport, dateStr, reportFields) {
  // Search for existing report
  const existing = await notion.databases.query({
    database_id: dbReport,
    filter: {
      property: reportFields.date,
      date: { equals: dateStr },
    },
  });

  if (existing.results.length > 0) {
    return existing.results[0].id;
  }

  // Create new report
  const page = await notion.pages.create({
    parent: { database_id: dbReport },
    properties: {
      [reportFields.date]: {
        title: [{ text: { content: dateStr } }],
        date: { start: dateStr },
      },
    },
  });

  return page.id;
}
