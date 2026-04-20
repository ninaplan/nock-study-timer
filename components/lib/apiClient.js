// components/lib/apiClient.js
import { buildFieldHeaders } from '@/app/lib/fields';

export function buildHeaders(creds, settings) {
  try {
    const base = {
      'Content-Type': 'application/json',
      'x-notion-token': creds?.token ?? '',
      'x-db-todo':      creds?.dbTodo ?? '',
      'x-db-report':    creds?.dbReport ?? '',
    };
    const tf = settings?.todoFields  ?? {};
    const rf = settings?.reportFields ?? {};
    const fieldHeaders = buildFieldHeaders(tf, rf);
    return { ...base, ...fieldHeaders };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

export async function apiFetch(path, options, creds, settings) {
  const opts = options || {};
  const headers = buildHeaders(creds, settings);
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body || undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`서버 응답 오류 (${res.status})`);
  }
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? data);
    throw new Error(msg || `API 오류 ${res.status}`);
  }
  return data;
}
