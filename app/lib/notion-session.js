/**
 * Encrypted httpOnly session cookie (AES-256-GCM) for Notion OAuth tokens.
 * Edge-compatible (Web Crypto).
 */
const COOKIE = 'nock_notion_s';
const STATE_COOKIE = 'nock_notion_o';
/** OAuth 콜백 후 `/?...` 경로(온보딩 vs 설정>노션) 구분용, 짧은 수명 */
const OAUTH_INTENT_COOKIE = 'nock_notion_or';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();
const dec = new TextDecoder();

function u8ToB64u(buf) {
  const bin = String.fromCharCode(...buf);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToU8(s) {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(pad) : '');
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getAesKey() {
  const sec = process.env.SESSION_SECRET || 'dev-unsafe-set-SESSION_SECRET-in-prod-32+chars';
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(sec));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function sealSession({ access_token, refresh_token, workspace_id, bot_id, workspace_name }) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(
    JSON.stringify({ access_token, refresh_token, workspace_id, bot_id, workspace_name })
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return u8ToB64u(out);
}
export async function unsealSession(b64) {
  if (!b64) return null;
  try {
    const key = await getAesKey();
    const all = b64uToU8(b64);
    if (all.length < 13) return null;
    const iv = all.slice(0, 12);
    const ciph = all.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciph);
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}
function getCookieValue(request, name) {
  if (request.cookies && typeof request.cookies.get === 'function') {
    return request.cookies.get(name)?.value || null;
  }
  const h = request.headers?.get('cookie') || '';
  const m = h.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1].trim()) : null;
}
export async function getNotionTokenFromCookie(request) {
  const v = getCookieValue(request, COOKIE);
  if (!v) return null;
  const s = await unsealSession(v);
  if (!s?.access_token) return null;
  return s.access_token;
}

/** Full session payload (for /api/auth/session: workspace name, etc.). */
export async function getNotionSessionFromCookie(request) {
  const v = getCookieValue(request, COOKIE);
  if (!v) return null;
  return unsealSession(v);
}
export { COOKIE, STATE_COOKIE, OAUTH_INTENT_COOKIE, MAX_AGE };
export const SESSION_COOKIE = COOKIE;
