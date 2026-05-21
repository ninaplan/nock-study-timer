export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';

const NOTION_VERSION = '2022-06-28';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

/** "09:00 ~ 10:00" 형식의 title에서 plain_text 추출 */
function parseTitleText(titleArr) {
  if (!Array.isArray(titleArr)) return '';
  return titleArr.map((b) => b.plain_text || '').join('');
}

/** date property에서 YYYY-MM-DD 추출 */
function parseDateStr(dateProp) {
  return dateProp?.date?.start?.slice(0, 10) ?? null;
}

/** relation 배열에서 id 목록 추출 */
function parseRelationIds(relationArr) {
  if (!Array.isArray(relationArr)) return [];
  return relationArr.map((r) => r.id).filter(Boolean);
}

/**
 * rollup/checkbox/formula 중 완료 여부 추출.
 * 실제 Notion DB 구조에 따라 완료 rollup이 없을 수 있으므로 안전하게 처리.
 */
function parseCompleted(prop) {
  if (!prop) return false;
  if (prop.type === 'checkbox') return Boolean(prop.checkbox);
  if (prop.type === 'rollup') {
    const rv = prop.rollup;
    if (rv?.type === 'number') return (rv.number ?? 0) > 0;
    if (rv?.type === 'array') return rv.array?.some((v) => v?.checkbox === true) ?? false;
  }
  if (prop.type === 'formula') {
    const fv = prop.formula;
    if (fv?.type === 'boolean') return Boolean(fv.boolean);
    if (fv?.type === 'number') return (fv.number ?? 0) > 0;
  }
  return false;
}

function parsePage(page) {
  const props = page.properties || {};
  const 시간Prop = props['시간'] ?? props['Time'] ?? props['제목'] ?? props['Name'] ?? null;
  const 날짜Prop = props['날짜'] ?? props['Date'] ?? null;
  const 몰입Prop = props['몰입할일'] ?? props['몰입할 일'] ?? props['Todo'] ?? null;
  const 완료Prop = props['완료'] ?? props['Done'] ?? props['Completed'] ?? null;

  return {
    id: page.id,
    시간: parseTitleText(시간Prop?.title ?? 시간Prop?.rich_text ?? []),
    날짜: parseDateStr(날짜Prop),
    몰입할일: parseRelationIds(몰입Prop?.relation ?? []),
    완료: parseCompleted(완료Prop),
  };
}

/**
 * GET /api/timetable?date=YYYY-MM-DD
 * 해당 날짜의 Notion Timetable 블록 목록 반환.
 */
export async function GET(request) {
  const { token, dbTimetable } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401, headers: noStore });
  if (!dbTimetable) return NextResponse.json({ error: 'Missing timetable DB' }, { status: 400, headers: noStore });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date');
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400, headers: noStore });
  }

  const body = {
    filter: {
      and: [
        { property: '날짜', date: { on_or_after: dateStr } },
        { property: '날짜', date: { on_or_before: dateStr } },
      ],
    },
    sorts: [{ property: '날짜', direction: 'ascending' }],
  };

  const res = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(dbTimetable)}/query`, {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: err?.message || 'Notion query failed' }, { status: res.status, headers: noStore });
  }

  const data = await res.json();
  const blocks = (data?.results ?? []).map(parsePage);

  return NextResponse.json({ blocks }, { headers: noStore });
}

/**
 * POST /api/timetable
 * Body: { date, startTime, endTime, todoId? }
 * Notion Timetable DB에 새 페이지(블록) 생성.
 */
export async function POST(request) {
  const { token, dbTimetable } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  if (!dbTimetable) return NextResponse.json({ error: 'Missing timetable DB' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { date, startTime, endTime, todoId } = body || {};
  if (!date || !startTime || !endTime) {
    return NextResponse.json({ error: 'Missing date, startTime or endTime' }, { status: 400 });
  }

  const timeTitle = `${startTime} ~ ${endTime}`;

  const properties = {
    시간: {
      title: [{ type: 'text', text: { content: timeTitle } }],
    },
    날짜: {
      date: { start: date },
    },
    ...(todoId ? { '몰입할 일': { relation: [{ id: todoId }] } } : {}),
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({ parent: { database_id: dbTimetable }, properties }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: err?.message || 'Notion create failed' }, { status: res.status });
  }

  const page = await res.json();
  return NextResponse.json({ block: parsePage(page) });
}
