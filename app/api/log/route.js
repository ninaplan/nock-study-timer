// app/api/log/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields } from '@/app/lib/fields';
import { queryDB, parseTodo } from '@/app/lib/notion';

const LOG_CACHE_TTL_MS = 30 * 1000;
const LOG_CACHE_MAX = 48;
const logCache = new Map();

function makeCacheKey({ token, dbTodo, startDate, endDate, fields }) {
  return [
    token?.slice(0, 12),
    dbTodo,
    startDate,
    endDate,
    fields?.name,
    fields?.date,
    fields?.done,
    fields?.accum,
    fields?.dailyReport,
  ].join('|');
}

function getCachedTodos(key) {
  const hit = logCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    logCache.delete(key);
    return null;
  }
  return hit.todos;
}

function setCachedTodos(key, todos) {
  if (logCache.size >= LOG_CACHE_MAX) {
    const oldestKey = logCache.keys().next().value;
    if (oldestKey) logCache.delete(oldestKey);
  }
  logCache.set(key, { todos, expiresAt: Date.now() + LOG_CACHE_TTL_MS });
}

export async function POST(request) {
  const { token, dbTodo } = await getCredentials(request);
  if (!token || !dbTodo) return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });

  const fields = getTodoFields(request.headers);
  try {
    const { startDate, endDate, fresh } = await request.json() || {};
    const cacheKey = makeCacheKey({ token, dbTodo, startDate, endDate, fields });
    if (!fresh) {
      const cached = getCachedTodos(cacheKey);
      if (cached) return NextResponse.json({ todos: cached, cached: true });
    }

    const allTodos = [];
    let cursor;
    do {
      const resp = await queryDB(token, dbTodo, {
        filter: {
          and: [
            { property: fields.date, date: { on_or_after:  startDate } },
            { property: fields.date, date: { on_or_before: endDate   } },
          ],
        },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      allTodos.push(...resp.results.map(p => parseTodo(p, fields)).filter(Boolean));
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    setCachedTodos(cacheKey, allTodos);
    return NextResponse.json({ todos: allTodos });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
