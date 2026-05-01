// app/api/todos/[id]/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields, getReportFields } from '@/app/lib/fields';
import { updatePage } from '@/app/lib/notion';
import { linkTodoToReportForDate, shouldLinkTodoToDailyReport } from '@/app/lib/todoReportLink';

export async function PATCH(request, { params }) {
  const { token, dbReport } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const fields = getTodoFields(request.headers);
  try {
    const body = await request.json();
    const { accum, done, name, date, goalPageId, timeBlockingHours } = body;
    const properties = {};
    if (typeof accum === 'number') properties[fields.accum] = { number: accum };
    if (typeof done === 'boolean') properties[fields.done] = { checkbox: done };
    if (typeof name === 'string') properties[fields.name] = { title: [{ text: { content: name } }] };
    if (typeof date === 'string') properties[fields.date] = { date: { start: date } };
    if (fields.goal && goalPageId !== undefined) {
      properties[fields.goal] = goalPageId
        ? { relation: [{ id: String(goalPageId).trim() }] }
        : { relation: [] };
    }
    if (fields.timeBlocking && timeBlockingHours !== undefined) {
      const arr = Array.isArray(timeBlockingHours) ? timeBlockingHours : [];
      const hrs = [...new Set(arr.map((n) => parseInt(n, 10)))].filter((h) => !Number.isNaN(h) && h >= 0 && h <= 23).sort((a, b) => a - b);
      const txt = hrs.join(',');
      properties[fields.timeBlocking] = txt
        ? { rich_text: [{ text: { content: txt } }] }
        : { rich_text: [] };
    }
    await updatePage(token, params.id, { properties });
    if (typeof date === 'string' && dbReport) {
      try {
        const reportFields = getReportFields(request.headers);
        if (shouldLinkTodoToDailyReport(date)) {
          await linkTodoToReportForDate(token, dbReport, params.id, date, fields, reportFields);
        } else if (fields.dailyReport) {
          await updatePage(token, params.id, {
            properties: { [fields.dailyReport]: { relation: [] } },
          });
        }
      } catch {}
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { token } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  try {
    await updatePage(token, params.id, { archived: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
