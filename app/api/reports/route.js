// app/api/reports/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getReportFields } from '@/app/lib/fields';
import { queryDB, createPage, parseReport, toDateStr } from '@/app/lib/notion';

export async function GET(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());
  const fields  = getReportFields(request.headers);

  try {
    const resp = await queryDB(token, dbReport, {
      filter: { property: fields.date, title: { equals: dateStr } },
      page_size: 1,
    });
    const report = resp.results.length > 0 ? parseReport(resp.results[0], fields) : null;
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const fields = getReportFields(request.headers);
  try {
    const { date } = await request.json();
    const dateStr = date || toDateStr(new Date());

    const existing = await queryDB(token, dbReport, {
      filter: { property: fields.date, title: { equals: dateStr } },
      page_size: 1,
    });
    if (existing.results.length > 0) {
      return NextResponse.json({ report: parseReport(existing.results[0], fields) });
    }
    const page = await createPage(token, {
      parent: { database_id: dbReport },
      properties: { [fields.date]: { title: [{ text: { content: dateStr } }] } },
    });
    return NextResponse.json({ report: { id: page.id, date: dateStr, review: '', totalMin: 0, todoIds: [] } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
