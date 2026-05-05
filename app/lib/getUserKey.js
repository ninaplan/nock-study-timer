import { isLocalMode } from './credsMode';
import { getLocalCustomerKey } from './localCustomerKey';

/**
 * 현재 유저의 customerKey를 반환.
 * - 로컬모드: localStorage UUID (nock-local-{uuid})
 * - Notion OAuth: nock-{workspaceId}
 *
 * 서버에서 세션 쿠키로 독자 계산하지 않고, 클라이언트가 이 값을 API에 항상 전달한다.
 */
export function getUserKey(creds) {
  if (!creds) return null;
  if (isLocalMode(creds)) return getLocalCustomerKey();
  if (creds.workspaceId) return `nock-${creds.workspaceId}`;
  return null;
}
