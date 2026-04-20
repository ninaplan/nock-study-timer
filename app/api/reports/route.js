// app/api/reports/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getReportFields, getTodoFields } from '@/app/lib/fields';
import { getNotionClient, parseReport, toDateStr } from '@/app/lib/notion';

export async function GET(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());

  const reportFields = getReportFields(request.headers);

  try {
    const notion = getNotionClient(token);
    const resp = await notion.databases.query({
      database_id: dbReport,
      filter: {
        property: reportFields.date,
        date: { equals: dateStr },
      },
    });

    const report = resp.results.length > 0
      ? parseReport(resp.results[0], reportFields)
      : null;

    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET range of reports for log view
export async function POST(request) {
  const { token, dbReport } = getCredentials(request);
  if (!token || !dbReport) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const reportFields = getReportFields(request.headers);

  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    const notion = getNotionClient(token);
    const resp = await notion.databases.query({
      database_id: dbReport,
      filter: {
        and: [
          { property: reportFields.date, date: { on_or_after: startDate } },
          { property: reportFields.date, date: { on_or_before: endDate } },
        ],
      },
      sorts: [{ property: reportFields.date, direction: 'ascending' }],
    });

    const reports = resp.results.map((p) => parseReport(p, reportFields));
    return NextResponse.json({ reports });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
