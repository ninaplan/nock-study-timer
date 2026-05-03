import { hasNotionAuth } from '@/app/lib/hasNotionAuth';

/** 기기만 — 노션 미연동 */
export function isLocalMode(creds) {
  return creds?.authMode === 'local';
}

/** 할 일 목록을 노션 DB와 동기화할 수 있는지 */
export function usesNotionTodoApi(creds) {
  return hasNotionAuth(creds) && Boolean(String(creds?.dbTodo || '').trim());
}
