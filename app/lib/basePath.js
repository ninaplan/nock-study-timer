/**
 * When the app is served under a subpath, set `NEXT_PUBLIC_BASE_PATH` (e.g. `/nock`)
 * and the same value in `next.config` as `basePath` so routes and `/public` assets align.
 */
export function getPublicBasePath() {
  const b = process.env.NEXT_PUBLIC_BASE_PATH;
  if (!b) return '';
  let s = String(b).replace(/\/$/, '');
  if (s && !s.startsWith('/')) s = `/${s}`;
  return s;
}
