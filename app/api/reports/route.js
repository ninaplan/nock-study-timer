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
    let report = null;
    for (const filter of [
      { property: fields.date, title: { equals: dateStr } },
      { property: fields.date, date: { equals: dateStr } },
    ]) {
      try {
        const resp = await queryDB(token, dbReport, { filter, page_size: 1 });
        if (resp.results.length > 0) { report = parseReport(resp.results[0], fields); break; }
      } catch {}
    }
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

    for (const filter of [
      { property: fields.date, title: { equals: dateStr } },
      { property: fields.date, date: { equals: dateStr } },
    ]) {
      try {
        const existing = await queryDB(token, dbReport, { filter, page_size: 1 });
        if (existing.results.length > 0) {
          return NextResponse.json({ report: parseReport(existing.results[0], fields) });
        }
      } catch {}
    }

    let page;
    try {
      page = await createPage(token, {
        parent: { database_id: dbReport },
        properties: { [fields.date]: { title: [{ text: { content: dateStr } }] } },
      });
    } catch {
      page = await createPage(token, {
        parent: { database_id: dbReport },
        properties: { [fields.date]: { date: { start: dateStr } } },
      });
    }

    return NextResponse.json({ report: { id: page.id, date: dateStr, review: '', totalMin: 0, todoIds: [] } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
