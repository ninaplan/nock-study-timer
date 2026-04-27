import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 서버 전용 (service_role) — API Route에서만 사용 */
export function getSupabaseAdmin() {
  if (!url || !serviceKey) throw new Error('Supabase env vars missing');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** 클라이언트(브라우저) 또는 서버 anon 용 */
export function getSupabaseClient() {
  if (!url || !anonKey) throw new Error('Supabase env vars missing');
  return createClient(url, anonKey);
}
