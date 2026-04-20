// app/lib/notion.js — Edge Runtime compatible (no @notionhq/client)

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ── Core fetch wrapper ────────────────────────────────────────
export async function notionFetch(token, method, path, body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Notion API error ${res.status}`);
  }
  return data;
}

// ── DB helpers ────────────────────────────────────────────────
export function queryDB(token, dbId, body) {
  return notionFetch(token, 'POST', `/databases/${dbId}/query`, body);
}
export function createPage(token, body) {
  return notionFetch(token, 'POST', '/pages', body);
}
export function updatePage(token, pageId, body) {
  return notionFetch(token, 'PATCH', `/pages/${pageId}`, body);
}
export function searchDBs(token, cursor) {
  return notionFetch(token, 'POST', '/search', {
    filter: { value: 'database', property: 'object' },
    page_size: 100,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
}
export function getDBProps(token, dbId) {
  return notionFetch(token, 'GET', `/databases/${dbId}`);
}

// ── Date helpers ──────────────────────────────────────────────
export function toDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}
export function today() { return toDateStr(new Date()); }

// ── Parsing helpers ───────────────────────────────────────────
export function plainText(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map(r => r.plain_text || '').join('');
}

export function getPropValue(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':      return plainText(prop.title);
    case 'rich_text':  return plainText(prop.rich_text);
    case 'number':     return prop.number;
    case 'checkbox':   return prop.checkbox;
    case 'date':       return prop.date?.start || null;
    case 'relation':   return prop.relation?.map(r => r.id) || [];
    case 'select':     return prop.select?.name || null;
    default:           return null;
  }
}

export function parseTodo(page, fields) {
  if (!page?.properties) return null;
  const p = page.properties;
  return {
    id:        page.id,
    name:      getPropValue(p[fields.name])  || '(제목 없음)',
    date:      getPropValue(p[fields.date]),
    done:      getPropValue(p[fields.done])  || false,
    accum:     getPropValue(p[fields.accum]) || 0,
    reportIds: getPropValue(p[fields.dailyReport]) || [],
  };
}

export function parseReport(page, fields) {
  if (!page?.properties) return null;
  const p = page.properties;
  return {
    id:       page.id,
    date:     getPropValue(p[fields.date]),
    review:   getPropValue(p[fields.review])   || '',
    todoIds:  getPropValue(p[fields.todoList]) || [],
    totalMin: getPropValue(p[fields.totalMin]) || 0,
  };
}
