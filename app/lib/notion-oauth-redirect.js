/**
 * Notion OAuth `redirect_uri` must be identical in /authorize, /token, and Notion app settings.
 * In development, use the request origin so localhost:PORT always matches the browser tab
 * (avoids stale NOTION_OAUTH_REDIRECT_URI pointing at production).
 */
export function getNotionOAuthRedirectUri(request) {
  const fromEnv = process.env.NOTION_OAUTH_REDIRECT_URI;
  let origin;
  try {
    origin = new URL(request.url).origin;
  } catch {
    return fromEnv;
  }
  const isLocalDev =
    process.env.NODE_ENV === 'development' &&
    (origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://[::1]:'));
  if (isLocalDev) {
    return `${origin}/api/auth/callback`;
  }
  return fromEnv;
}
