// components/lib/apiClient.js
import { buildFieldHeaders } from '@/app/lib/fields';

export function buildHeaders(creds, settings) {
  const base = {
    'Content-Type': 'application/json',
    'x-notion-token': creds?.token || '',
    'x-db-todo':      creds?.dbTodo || '',
    'x-db-report':    creds?.dbReport || '',
  };
  const fieldHeaders = buildFieldHeaders(
    settings?.todoFields  || {},
    settings?.reportFields || {}
  );
  return { ...base, ...fieldHeaders };
}

// fetch with 10-second timeout
async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('요청 시간 초과 (10초). 네트워크나 노션 연결을 확인하세요.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(path, options = {}, creds, settings) {
  const headers = buildHeaders(creds, settings);
  const res = await fetchWithTimeout(path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}
