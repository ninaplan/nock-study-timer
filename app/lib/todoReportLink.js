// app/lib/todoReportLink.js — link a to-do page to Daily Report (same behavior as POST /api/todos)
import { queryDB, createPage, updatePage, notionFetch } from './notion';

export async function findOrCreateReport(token, dbReport, dateStr, fields) {
  try {
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
  } catch {
    return null;
  }
}

/**
 * Set to-do’s dailyReport relation to the report for dateStr, and append this to-do on the report’s list.
 */
export async function linkTodoToReportForDate(token, dbReport, todoPageId, dateStr, todoFields, reportFields) {
  if (!dbReport || !todoFields.dailyReport) return;
  const rid = await findOrCreateReport(token, dbReport, dateStr, reportFields);
  if (!rid) return;
  await updatePage(token, todoPageId, {
    properties: { [todoFields.dailyReport]: { relation: [{ id: rid }] } },
  });
  if (reportFields.todoList) {
    let mergedTodoIds = [todoPageId];
    try {
      const reportPage = await notionFetch(token, 'GET', `/pages/${rid}`);
      const rel = reportPage?.properties?.[reportFields.todoList]?.relation || [];
      mergedTodoIds = Array.from(new Set([...rel.map((r) => r.id), todoPageId]));
    } catch {}
    await updatePage(token, rid, {
      properties: { [reportFields.todoList]: { relation: mergedTodoIds.map((id) => ({ id })) } },
    });
  }
}
