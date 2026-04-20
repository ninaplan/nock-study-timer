// components/lib/apiClient.js
// NOTE: HTTP headers must be ASCII only.
// Korean field names are encoded via encodeURIComponent before sending.

import { buildFieldHeaders } from '@/app/lib/fields';

export function buildHeaders(creds, settings) {
  try {
    const tf = settings?.todoFields  ?? {};
    const rf = settings?.reportFields ?? {};
    const rawFieldHeaders = buildFieldHeaders(tf, rf);

    // Encode non-ASCII header values so Safari doesn't throw TypeError
    const encodedFieldHeaders = {};
    for (const [key, val] of Object.entries(rawFieldHeaders)) {
      encodedFieldHeaders[key] = val ? encodeURIComponent(val) : '';
    }

    return {
      'Content-Type': 'application/json',
      'x-notion-token': creds?.token  ?? '',
      'x-db-todo':      creds?.dbTodo ?? '',
      'x-db-report':    creds?.dbReport ?? '',
      ...encodedFieldHeaders,
    };
  } catch {
    return {
      'Content-Type': 'application/json',
      'x-notion-token': creds?.token  ?? '',
      'x-db-todo':      creds?.dbTodo ?? '',
      'x-db-report':    creds?.dbReport ?? '',
    };
  }
}

export async function apiFetch(path, options, creds, settings) {
  const opts    = options || {};
  const headers = buildHeaders(creds, settings);

  // Don't pass body for GET (Safari strictness)
  const fetchOptions = {
    method:  opts.method || 'GET',
    headers: headers,
  };
  if (opts.body) fetchOptions.body = opts.body;

  const res = await fetch(path, fetchOptions);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`서버 응답 오류 (${res.status})`);
  }
  if (!res.ok) {
    const msg = typeof data?.error === 'string'
      ? data.error
      : JSON.stringify(data?.error ?? data);
    throw new Error(msg || `API 오류 ${res.status}`);
  }
  return data;
}
