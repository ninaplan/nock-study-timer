// app/lib/notion.js
import { Client } from '@notionhq/client';

export function getNotionClient(token) {
  return new Client({ auth: token });
}

// Format date as YYYY-MM-DD
export function toDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

// Get today's date string
export function today() {
  return toDateStr(new Date());
}

// Extract plain text from Notion rich text array
export function plainText(richTextArr) {
  if (!richTextArr || !Array.isArray(richTextArr)) return '';
  return richTextArr.map((r) => r.plain_text || '').join('');
}

// Get property value by type
export function getPropValue(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return plainText(prop.title);
    case 'rich_text':
      return plainText(prop.rich_text);
    case 'number':
      return prop.number;
    case 'checkbox':
      return prop.checkbox;
    case 'date':
      return prop.date?.start || null;
    case 'relation':
      return prop.relation?.map((r) => r.id) || [];
    case 'select':
      return prop.select?.name || null;
    default:
      return null;
  }
}

// Parse todo page from Notion
export function parseTodo(page, fields) {
  const props = page.properties;
  return {
    id: page.id,
    name: getPropValue(props[fields.name]) || '(제목 없음)',
    date: getPropValue(props[fields.date]),
    done: getPropValue(props[fields.done]) || false,
    accum: getPropValue(props[fields.accum]) || 0,
    reportIds: getPropValue(props[fields.dailyReport]) || [],
  };
}

// Parse daily report page from Notion
export function parseReport(page, fields) {
  const props = page.properties;
  return {
    id: page.id,
    date: getPropValue(props[fields.date]),
    review: getPropValue(props[fields.review]) || '',
    todoIds: getPropValue(props[fields.todoList]) || [],
    totalMin: getPropValue(props[fields.totalMin]) || 0,
  };
}
