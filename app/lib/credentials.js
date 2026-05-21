// app/lib/credentials.js
import { getNotionTokenFromCookie } from './notion-session';

/**
 * @returns {Promise<{ token: string|null, dbTodo: string|null, dbReport: string|null, dbGoal: string|null }>}
 */
export async function getCredentials(request) {
  const fromCookie = await getNotionTokenFromCookie(request);
  const header = request.headers.get('x-notion-token');
  const token =
    fromCookie && fromCookie.length > 0
      ? fromCookie
      : header && header.length > 0
        ? header
        : null;
  const dbTodo = request.headers.get('x-db-todo');
  const dbReport = request.headers.get('x-db-report');
  const dbGoal = request.headers.get('x-db-goal');
  const dbTimetable = request.headers.get('x-db-timetable');
  return { token, dbTodo, dbReport, dbGoal, dbTimetable };
}

export async function requireCredentials(request) {
  const creds = await getCredentials(request);
  if (!creds.token) {
    throw new Error('Missing Notion token');
  }
  return creds;
}
