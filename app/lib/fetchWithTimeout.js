/**
 * fetch with max wait — avoids indefinite hang when dev 서버/프록시가 응답 없을 때
 * (온보딩 sessionInfoReady, 앱 셸 세션 재시도 등).
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { signal } = init;

  const onParentAbort = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    signal.addEventListener('abort', onParentAbort);
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }
}
