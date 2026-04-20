// app/api/reports/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getReportFields } from '@/app/lib/fields';
import { getNotionClient, parseReport, toDateStr } from '@/app/lib/notion';

export async function GET(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());
  const fields  = getReportFields(request.headers);

  try {
    const notion = getNotionClient(token);
    // Daily Report의 날짜 필드는 title 타입 — title 필터 사용
    const resp = await notion.databases.query({
      database_id: dbReport,
      filter: {
        property: fields.date,
        title: { equals: dateStr },
      },
    });
    const report = resp.results.length > 0
      ? parseReport(resp.results[0], fields)
      : null;
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: create a new report for a given date
export async function POST(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const fields = getReportFields(request.headers);

  try {
    const { date } = await request.json();
    const dateStr  = date || toDateStr(new Date());
    const notion   = getNotionClient(token);

    // Check if already exists
    const existing = await notion.databases.query({
      database_id: dbReport,
      filter: { property: fields.date, title: { equals: dateStr } },
    });
    if (existing.results.length > 0) {
      return NextResponse.json({ report: parseReport(existing.results[0], fields) });
    }

    // Create
    const page = await notion.pages.create({
      parent: { database_id: dbReport },
      properties: {
        [fields.date]: { title: [{ text: { content: dateStr } }] },
      },
    });
    return NextResponse.json({ report: { id: page.id, date: dateStr, review: '', totalMin: 0, todoIds: [] } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST with body { startDate, endDate } for log range — use separate endpoint-ish handling
// Actually keep this as a named route via query param
export async function PUT(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const fields = getReportFields(request.headers);
  try {
    const { startDate, endDate } = await request.json();
    const notion = getNotionClient(token);
    const resp = await notion.databases.query({
      database_id: dbReport,
      filter: {
        and: [
          { property: fields.date, title: { on_or_after: startDate } },
          { property: fields.date, title: { on_or_before: endDate } },
        ],
      },
      sorts: [{ property: fields.date, direction: 'ascending' }],
    });
    return NextResponse.json({ reports: resp.results.map(p => parseReport(p, fields)) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
