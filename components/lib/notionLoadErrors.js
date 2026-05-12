/** https://www.notion.so/help/notion-status */
export const NOTION_STATUS_PAGE_URL = 'https://status.notion.so/';

/**
 * Home `/api/todos` 로드 실패 시 사용자에게 보여 줄 카피 (기술 메시지 노출 최소화).
 * @param {unknown} err — apiFetch 등에서 던진 Error (선택적으로 status 부착)
 * @param {Record<string, string>} tr — useT 결과
 */
export function describeTodoFetchFailure(err, tr) {
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const name = err?.name || '';
  const raw = String(err?.message || '').trim();

  if (name === 'AbortError' || /abort/i.test(raw)) {
    return {
      title: tr.notionTodoFetchTimeoutTitle,
      detail: tr.notionTodoFetchTimeoutDetail,
      showStatusLink: true,
    };
  }
  if (status === 429) {
    return {
      title: tr.notionTodoFetchRateLimitTitle,
      detail: tr.notionTodoFetchRateLimitDetail,
      showStatusLink: true,
    };
  }
  if (status != null && status >= 500) {
    return {
      title: tr.notionTodoFetchServerTitle,
      detail: tr.notionTodoFetchServerDetail,
      showStatusLink: true,
    };
  }

  const scrubbed = raw.replace(/^\[[^\]]+\]\s*/, '').slice(0, 280);
  return {
    title: tr.errorLoading,
    detail: scrubbed || tr.notionTodoFetchGenericDetail,
    showStatusLink: status == null || status >= 500 || status === 429,
  };
}
