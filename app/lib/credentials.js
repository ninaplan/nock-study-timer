// app/lib/credentials.js

export function getCredentials(request) {
  const headers = request.headers;
  const token = headers.get('x-notion-token');
  const dbTodo = headers.get('x-db-todo');
  const dbReport = headers.get('x-db-report');
  return { token, dbTodo, dbReport };
}

export function requireCredentials(request) {
  const creds = getCredentials(request);
  if (!creds.token) {
    throw new Error('Missing Notion token');
  }
  return creds;
}
