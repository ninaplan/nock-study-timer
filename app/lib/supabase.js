import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Next.js App Router의 fetch 캐시를 우회하는 fetch 래퍼 */
const noStoreFetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

/** 서버 전용 (service_role) — API Route에서만 사용 */
export function getSupabaseAdmin() {
  if (!url || !serviceKey) throw new Error('Supabase env vars missing');
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}

/** 클라이언트(브라우저) 또는 서버 anon 용 */
export function getSupabaseClient() {
  if (!url || !anonKey) throw new Error('Supabase env vars missing');
  return createClient(url, anonKey);
}
