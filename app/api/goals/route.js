// Goal Tracker DB — pages where status select equals "In progress" (labels from client headers)
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getGoalFields } from '@/app/lib/fields';
import { notionFetch, parseGoal, queryDatabaseAllPages } from '@/app/lib/notion';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

/** Notion `status` vs `select` columns use different query filter shapes. */
function filterForGoalStatus(schemaProps, statusPropName, optionLabel) {
  const p = schemaProps?.[statusPropName];
  const kind = p?.type === 'status' ? 'status' : 'select';
  if (kind === 'status') {
    return { property: statusPropName, status: { equals: optionLabel } };
  }
  return { property: statusPropName, select: { equals: optionLabel } };
}

export async function GET(request) {
  try {
    const { token, dbGoal } = await getCredentials(request);
    if (!token || !dbGoal) {
      return NextResponse.json({ error: 'Missing credentials', goals: [] }, { status: 401, headers: noStore });
    }

    const fields = getGoalFields(request.headers);
    const inProgress = fields.inProgress || 'In progress';

    let schemaProps = {};
    try {
      const db = await notionFetch(token, 'GET', `/databases/${dbGoal}`);
      schemaProps = db?.properties || {};
    } catch {
      schemaProps = {};
    }

    const body = {
      filter: filterForGoalStatus(schemaProps, fields.status, inProgress),
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    };

    const pages = await queryDatabaseAllPages(token, dbGoal, body, { maxPages: 10 });
    const goals = pages.map((p) => parseGoal(p, fields)).filter(Boolean);

    return NextResponse.json({ goals }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'GET /api/goals failed', goals: [] },
      { status: 500, headers: noStore }
    );
  }
}
