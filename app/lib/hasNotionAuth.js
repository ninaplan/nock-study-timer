/** Whether we can call Notion API: OAuth session or legacy `secret_` in creds. */
export function hasNotionAuth(creds) {
  if (!creds) return false;
  if (creds.authMode === 'oauth') return true;
  return typeof creds.token === 'string' && creds.token.length > 0;
}
