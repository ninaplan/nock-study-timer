// app/api/todos/[id]/route.js
import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getTodoFields } from '@/app/lib/fields';
import { getNotionClient } from '@/app/lib/notion';

export async function PATCH(request, { params }) {
  const { token } = getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const fields = getTodoFields(request.headers);
  try {
    const body = await request.json();
    const { accum, done } = body;
    const properties = {};
    if (typeof accum === 'number') properties[fields.accum] = { number: accum };
    if (typeof done === 'boolean') properties[fields.done] = { checkbox: done };

    const notion = getNotionClient(token);
    await notion.pages.update({ page_id: params.id, properties });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { token } = getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  try {
    const notion = getNotionClient(token);
    // Archive the page (Notion's soft delete)
    await notion.pages.update({ page_id: params.id, archived: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
