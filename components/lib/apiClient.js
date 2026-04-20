// components/lib/apiClient.js
import { buildFieldHeaders } from '@/app/lib/fields';

export function buildHeaders(creds, settings) {
  const base = {
    'Content-Type': 'application/json',
    'x-notion-token': creds?.token || '',
    'x-db-todo': creds?.dbTodo || '',
    'x-db-report': creds?.dbReport || '',
  };
  const fieldHeaders = buildFieldHeaders(
    settings?.todoFields || {},
    settings?.reportFields || {}
  );
  return { ...base, ...fieldHeaders };
}

export async function apiFetch(path, options = {}, creds, settings) {
  const headers = buildHeaders(creds, settings);
  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}
