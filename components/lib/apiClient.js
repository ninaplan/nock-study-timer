// components/lib/apiClient.js
// NOTE: HTTP headers must be ASCII only.
// Korean field names are encoded via encodeURIComponent before sending.

import { buildFieldHeaders } from '@/app/lib/fields';

const BASE = typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BASE_PATH
  ? String(process.env.NEXT_PUBLIC_BASE_PATH).replace(/\/$/, '')
  : '';

/** Same document origin for /api (avoids HTML 404 when relative path resolves wrong). */
export function resolveApiUrl(path) {
  if (typeof path !== 'string') return path;
  if (path.startsWith('http:') || path.startsWith('https:')) return path;
  if (path.startsWith('/')) {
    if (typeof window === 'undefined') {
      if (BASE) return `${BASE}${path}`;
      return path;
    }
    const origin = window.location?.origin;
    if (!origin) return path;
    if (BASE) return `${origin}${BASE}${path}`;
    return `${origin}${path}`;
  }
  return path;
}

/** Next.js error/404 pages are HTML; never show that blob in UI. */
function describeNonJsonBody(text, status) {
  const t = (text || '').trim();
  if (!t) return `HTTP ${status} (빈 본문)`;
  const lower = t.slice(0, 500).toLowerCase();
  if (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    (lower.includes('<head>') && lower.includes('next-')) ||
    (lower.includes('body{display:none') && lower.includes('next'))
  ) {
    return '서버 라우트 오류(HTML 응답). 이 앱이 뜬 주소·포트와 같은 origin으로 /api/… 를 호출하는지, dev 서버(npm run dev)를 켰는지 확인하세요.';
  }
  return t.replace(/\s+/g, ' ').trim().slice(0, 280);
}

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
  if (opts.keepalive) fetchOptions.keepalive = true;

  const url = resolveApiUrl(path);
  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      throw new Error(
        describeNonJsonBody(text, res.status) || `서버 응답이 JSON이 아님 (HTTP ${res.status})`
      );
    }
    throw new Error(describeNonJsonBody(text, res.status));
  }
  if (!res.ok) {
    const msg = typeof data?.error === 'string'
      ? data.error
      : (typeof data?.message === 'string' ? data.message : JSON.stringify(data?.error ?? data ?? null));
    throw new Error(msg || `API 오류 ${res.status}`);
  }
  // JSON.parse of literal "null" / odd bodies would otherwise crash `data.todos` etc.
  if (data == null) return {};
  if (typeof data !== 'object' || Array.isArray(data)) return { result: data };
  return data;
}
