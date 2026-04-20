// app/api/reports/[id]/route.js
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getCredentials } from '@/app/lib/credentials';
import { getReportFields } from '@/app/lib/fields';
import { updatePage } from '@/app/lib/notion';

export async function PATCH(request, { params }) {
  const { token } = getCredentials(request);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const fields = getReportFields(request.headers);
  try {
    const { review, totalMin } = await request.json();
    const properties = {};
    if (typeof review   === 'string') properties[fields.review]   = { rich_text: [{ text: { content: review } }] };
    if (typeof totalMin === 'number') properties[fields.totalMin] = { number: totalMin };
    await updatePage(token, params.id, { properties });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
