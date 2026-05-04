import { getDBProps, queryDatabaseAllPages, plainText, retrievePage } from '@/app/lib/notion';

/**
 * Parse 0–23 from common Notion timeblock row titles (e.g. "📄 06 AM", "6 PM", "14시").
 */
export function parseHourFromTimeblockTitle(raw) {
  const s = String(raw || '')
    .replace(/[\uFE0F\u200d]/g, '')
    .trim();
  const cleaned = s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

  const ampm = cleaned.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)\b/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const mer = ampm[2].toUpperCase();
    if (mer === 'AM') {
      if (h === 12) return 0;
      return h >= 0 && h <= 11 ? h : null;
    }
    if (h === 12) return 12;
    return h >= 1 && h <= 11 ? h + 12 : null;
  }

  const ko = cleaned.match(/(오전|오후)\s*(\d{1,2})\s*시?/);
  if (ko) {
    let h = parseInt(ko[2], 10);
    if (ko[1] === '오전') {
      if (h === 12) return 0;
      return h >= 1 && h <= 11 ? h : h === 0 ? 0 : null;
    }
    if (h === 12) return 12;
    return h >= 1 && h <= 11 ? h + 12 : null;
  }

  const plain = cleaned.match(/^(\d{1,2})(?:\s*시)?$/);
  if (plain) {
    const h = parseInt(plain[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  return null;
}

export function extractTitleFromNotionPage(page) {
  const props = page?.properties || {};
  for (const k of Object.keys(props)) {
    if (props[k]?.type === 'title') {
      return plainText(props[k].title);
    }
  }
  return '';
}

/** @returns {{ kind: 'none' } | { kind: 'rich_text' } | { kind: 'relation', databaseId: string }} */
export async function getTimeBlockingFieldKind(token, dbTodo, fieldName) {
  if (!fieldName || !dbTodo) return { kind: 'none' };
  try {
    const db = await getDBProps(token, dbTodo);
    const p = db?.properties?.[fieldName];
    if (p?.type === 'rich_text') return { kind: 'rich_text' };
    if (p?.type === 'relation') {
      const id = p.relation?.database_id;
      if (id) return { kind: 'relation', databaseId: id };
    }
  } catch {
    /* */
  }
  return { kind: 'rich_text' };
}

/**
 * Map hour (0–23) → Notion page id in the timeboxing database (first title match wins).
 */
export async function buildHourToTimeblockPageIdMap(token, timeboxDatabaseId) {
  const map = new Map();
  if (!timeboxDatabaseId) return map;
  try {
    const pages = await queryDatabaseAllPages(token, timeboxDatabaseId, {}, { maxPages: 8 });
    for (const page of pages) {
      const title = extractTitleFromNotionPage(page);
      const h = parseHourFromTimeblockTitle(title);
      if (h == null) continue;
      if (!map.has(h)) map.set(h, page.id);
    }
  } catch {
    /* */
  }
  return map;
}

export async function buildTimeBlockingNotionProperties(token, dbTodo, fieldName, timeBlockingHours) {
  const arr = Array.isArray(timeBlockingHours) ? timeBlockingHours : [];
  const hrs = [...new Set(arr.map((n) => parseInt(n, 10)))]
    .filter((h) => !Number.isNaN(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b);
  if (!fieldName) return {};

  const kind = await getTimeBlockingFieldKind(token, dbTodo, fieldName);
  if (kind.kind === 'relation' && kind.databaseId) {
    const hourMap = await buildHourToTimeblockPageIdMap(token, kind.databaseId);
    const ids = hrs.map((h) => hourMap.get(h)).filter(Boolean);
    return { [fieldName]: { relation: ids.map((id) => ({ id })) } };
  }
  const txt = hrs.join(',');
  return {
    [fieldName]: txt ? { rich_text: [{ text: { content: txt } }] } : { rich_text: [] },
  };
}

/**
 * Resolve relation targets on each todo to `timeBlockingHours` using linked page titles.
 */
export async function enrichTodosTimeBlockingHoursFromRelations(token, todos) {
  const allIds = new Set();
  for (const t of todos) {
    if (Array.isArray(t.timeBlockingRelationIds)) {
      t.timeBlockingRelationIds.forEach((id) => allIds.add(id));
    }
  }
  if (allIds.size === 0) {
    return todos.map((t) => {
      const { timeBlockingRelationIds: _r, ...rest } = t;
      return rest;
    });
  }

  const idToHour = new Map();
  await Promise.all(
    [...allIds].map(async (id) => {
      try {
        const page = await retrievePage(token, id);
        const title = extractTitleFromNotionPage(page);
        const h = parseHourFromTimeblockTitle(title);
        if (h != null) idToHour.set(id, h);
      } catch {
        /* */
      }
    })
  );

  return todos.map((t) => {
    const { timeBlockingRelationIds, ...rest } = t;
    if (!Array.isArray(timeBlockingRelationIds) || timeBlockingRelationIds.length === 0) {
      return rest;
    }
    const hrs = [...new Set(timeBlockingRelationIds.map((id) => idToHour.get(id)).filter((x) => x != null))].sort(
      (a, b) => a - b
    );
    return { ...rest, timeBlockingHours: hrs };
  });
}
