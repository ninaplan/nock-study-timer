import { getPublicBasePath } from '@/app/lib/basePath';

/**
 * Notion OAuth `redirect_uri` must be identical in /authorize and /token.
 * Use request origin by default so active host(main/preview/custom domain) stays in sync.
 * Keep NOTION_OAUTH_REDIRECT_URI as a fallback when request URL is unavailable.
 */
export function getNotionOAuthRedirectUri(request) {
  const fromEnv = process.env.NOTION_OAUTH_REDIRECT_URI;
  let origin = null;
  try {
    origin = new URL(request.url).origin;
  } catch {
    origin = null;
  }
  const base = getPublicBasePath();
  if (origin) {
    return `${origin}${base}/api/auth/callback`;
  }
  return fromEnv;
}
