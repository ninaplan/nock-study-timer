// app/lib/notion.js — Edge Runtime compatible (no @notionhq/client)

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
/** Minimum version for data sources + “default” DB template on create page. */
const NOTION_VERSION_DATA_SOURCES = '2025-09-03';

// ── Core fetch wrapper ────────────────────────────────────────
export async function notionFetch(token, method, path, body, notionVersion = NOTION_VERSION) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': notionVersion,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data = {};
  try {
    if (raw) data = JSON.parse(raw);
  } catch {
    throw new Error(
      res.ok
        ? 'Notion 응답을 해석할 수 없습니다'
        : `Notion ${res.status}: ${String(raw).slice(0, 240)}`
    );
  }
  if (!res.ok) {
    const msg = data?.message || data?.code || `Notion API error ${res.status}`;
    throw new Error(msg);
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

/**
 * First data source id for a database (Notion 2025+). Used for template apply on create.
 * Returns null if not present.
 */
export async function getDataSourceIdForDatabase(token, databaseId) {
  const db = await notionFetch(token, 'GET', `/databases/${databaseId}`, undefined, NOTION_VERSION_DATA_SOURCES);
  const list = db?.data_sources;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0].id || null;
}

/**
 * Create a row in a database using the data source’s default template (icon/blocks from the template in Notion).
 * Requires a default template to be set on that database in the Notion app.
 * Uses NOTION_VERSION_DATA_SOURCES — do not set icon/children; template applies asynchronously.
 */
export function createPageWithDefaultTemplate(token, body) {
  return notionFetch(token, 'POST', '/pages', body, NOTION_VERSION_DATA_SOURCES);
}
export function updatePage(token, pageId, body) {
  return notionFetch(token, 'PATCH', `/pages/${pageId}`, body);
}
/** @deprecated for newer workspaces — use searchDataSources; kept for API merge. */
export function searchDBs(token, cursor) {
  return notionFetch(token, 'POST', '/search', {
    filter: { value: 'database', property: 'object' },
    page_size: 100,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
}

/**
 * Newer Notion search only allows `data_source` (not `database`) as object filter.
 * @see https://developers.notion.com/reference/post-search
 */
export function searchDataSources(token, cursor) {
  return notionFetch(token, 'POST', '/search', {
    filter: { value: 'data_source', property: 'object' },
    page_size: 100,
    ...(cursor ? { start_cursor: cursor } : {}),
  }, NOTION_VERSION_DATA_SOURCES);
}

/**
 * Picker + `/databases/*` use Notion "database" ids. /search can return `database` (legacy) or
 * `data_source` items — map both to a database_id.
 */
export function databaseIdFromSearchItem(item) {
  if (!item?.object) return null;
  if (item.object === 'database') return item.id;
  if (item.object === 'data_source') {
    const p = item.parent;
    if (p?.type === 'database_id' && p.database_id) return p.database_id;
    if (p?.type === 'data_source_id' && p.database_id) return p.database_id;
  }
  return null;
}

export async function searchAllDatabasesForPicker(token) {
  const collect = async (searchFn) => {
    const out = [];
    let cursor;
    do {
      const resp = await searchFn(token, cursor);
      out.push(...(resp?.results || []));
      cursor = resp?.has_more ? resp.next_cursor : undefined;
    } while (cursor);
    return out;
  };
  const legacy = await collect((t, c) => searchDBs(t, c)).catch(() => []);
  const fromDataSources = await collect((t, c) => searchDataSources(t, c)).catch(() => []);
  return { legacy, fromDataSources };
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
