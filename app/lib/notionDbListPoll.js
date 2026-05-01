/**
 * Notion /search can briefly return no databases right after OAuth/indexing.
 * Poll until we see at least one DB or attempts are exhausted (empty-but-OK is not "done" for UX).
 */

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * @param {{
 *   fetchOnce: () => Promise<{ res: Response, data: any }>,
 *   signal?: AbortSignal,
 *   maxAttempts?: number,
 *   delayMs?: number,
 *   delayGrowth?: number,
 * }} opts
 * @returns {Promise<{ databases: any[], lastOk: boolean }>}
 */
export async function pollDatabaseListUntilNonEmpty(opts) {
  const {
    fetchOnce,
    signal,
    maxAttempts = 12,
    delayMs = 720,
    delayGrowth = 1.18,
  } = opts || {};

  let databases = [];
  let lastOk = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      throw e;
    }

    const { res, data } = await fetchOnce();
    lastOk = !!res?.ok;

    if (!res.ok) {
      const msg = typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    databases = Array.isArray(data?.databases) ? data.databases : [];
    if (databases.length > 0) break;

    if (attempt >= maxAttempts) break;

    let wait = delayMs * delayGrowth ** (attempt - 1);
    if (!Number.isFinite(wait) || wait < 0) wait = delayMs;
    wait = Math.min(wait, 2600);
    await sleep(wait, signal);
  }

  return { databases, lastOk };
}
