// app/api/todos/[id]/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields } from '@/app/lib/fields';
import { updatePage } from '@/app/lib/notion';

export async function PATCH(request, { params }) {
  const { token } = await getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const fields = getTodoFields(request.headers);
  try {
    const body = await request.json();
    const { accum, done, name, date } = body;
    const properties = {};
    if (typeof accum === 'number') properties[fields.accum] = { number: accum };
    if (typeof done === 'boolean') properties[fields.done] = { checkbox: done };
    if (typeof name === 'string') properties[fields.name] = { title: [{ text: { content: name } }] };
    if (typeof date === 'string') properties[fields.date] = { date: { start: date } };
    await updatePage(token, params.id, { properties });
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
