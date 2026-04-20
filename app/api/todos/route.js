// app/api/todos/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields, getReportFields } from '@/app/lib/fields';
import { getNotionClient, parseTodo, toDateStr } from '@/app/lib/notion';

export async function GET(request) {
  const { token, dbTodo } = getCredentials(request);
  if (!token || !dbTodo) {
    return NextResponse.json({ error: 'Missing credentials: token or dbTodo' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || toDateStr(new Date());
  const fields  = getTodoFields(request.headers);

  try {
    const notion = getNotionClient(token);

    // 1차: date 필터로 조회
    try {
      const resp = await notion.databases.query({
        database_id: dbTodo,
        filter: { property: fields.date, date: { equals: dateStr } },
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        page_size: 50,
      });
      const todos = resp.results.map(p => parseTodo(p, fields));
      return NextResponse.json({ todos });
    } catch (filterErr) {
      // date 필터 실패 시(속성명 불일치 등) → 전체 조회 후 클라이언트 필터
      console.warn('Date filter failed, falling back:', filterErr.message);
      const resp = await notion.databases.query({
        database_id: dbTodo,
        page_size: 100,
      });
      const todos = resp.results
        .map(p => parseTodo(p, fields))
        .filter(t => t.date === dateStr);
      return NextResponse.json({ todos, fallback: true, filterError: filterErr.message });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message, detail: 'DB query failed' }, { status: 500 });
  }
}

export async function POST(request) {
  const { token, dbTodo, dbReport } = getCredentials(request);
  if (!token || !dbTodo) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const todoFields   = getTodoFields(request.headers);
  const reportFields = getReportFields(request.headers);

  try {
    const { name, date } = await request.json();
    const dateStr = date || toDateStr(new Date());
    const notion  = getNotionClient(token);

    // ─ 핵심 속성만으로 todo 생성 (관계형 제외) ─
    const coreProps = {
      [todoFields.name]: { title: [{ text: { content: name } }] },
    };

    // 날짜 속성 추가 (실패해도 계속)
    if (todoFields.date) {
      try { coreProps[todoFields.date] = { date: { start: dateStr } }; } catch {}
    }
    // 완료 속성 추가
    if (todoFields.done) {
      try { coreProps[todoFields.done] = { checkbox: false }; } catch {}
    }
    // 누적 속성 추가
    if (todoFields.accum) {
      try { coreProps[todoFields.accum] = { number: 0 }; } catch {}
    }

    // 1단계: 핵심 속성으로 페이지 생성
    const page = await notion.pages.create({
      parent: { database_id: dbTodo },
      properties: coreProps,
    });

    // 2단계: 관계형 연결 (실패해도 무시)
    if (dbReport && todoFields.dailyReport) {
      try {
        const reportId = await findOrCreateReport(notion, dbReport, dateStr, reportFields);
        if (reportId) {
          await notion.pages.update({
            page_id: page.id,
            properties: {
              [todoFields.dailyReport]: { relation: [{ id: reportId }] },
            },
          });
        }
      } catch (e) {
        console.warn('Relation link skipped:', e.message);
      }
    }

    return NextResponse.json({ todo: { id: page.id, name, date: dateStr, done: false, accum: 0 } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function findOrCreateReport(notion, dbReport, dateStr, reportFields) {
  try {
    const existing = await notion.databases.query({
      database_id: dbReport,
      filter: { property: reportFields.date, title: { equals: dateStr } },
    });
    if (existing.results.length > 0) return existing.results[0].id;

    const page = await notion.pages.create({
      parent: { database_id: dbReport },
      properties: {
        [reportFields.date]: { title: [{ text: { content: dateStr } }] },
      },
    });
    return page.id;
  } catch (e) {
    console.warn('findOrCreateReport failed:', e.message);
    return null;
  }
}
