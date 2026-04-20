// app/api/test/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { queryDB } from '@/app/lib/notion';

export async function GET(request) {
  const result = { steps: [], error: null, ok: false };
  try {
    const { token, dbTodo } = getCredentials(request);
    result.steps.push({ step: '1_credentials', tokenPrefix: token ? token.slice(0,8) : null, hasDbTodo: !!dbTodo });
    if (!token) { result.error = 'No token'; return NextResponse.json(result); }
    if (!dbTodo) { result.error = 'No dbTodo'; return NextResponse.json(result); }

    const resp = await queryDB(token, dbTodo, { page_size: 3 });
    result.steps.push({ step: '2_query_ok', count: resp.results.length });

    if (resp.results[0]) {
      const propNames = Object.keys(resp.results[0].properties || {});
      result.steps.push({ step: '3_props', names: propNames });
    }
    result.ok = true;
  } catch (e) {
    result.error   = e?.message || String(e);
    result.errType = e?.constructor?.name;
  }
  return NextResponse.json(result);
}
