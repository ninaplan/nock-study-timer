const KEY = 'nock_local_customer_key';

/** 로컬 모드 유저용 기기 고유 customer key.
 *  처음 호출 시 UUID를 생성해 localStorage에 저장하고 이후엔 재사용. */
export function getLocalCustomerKey() {
  if (typeof window === 'undefined') return null;
  let k = localStorage.getItem(KEY);
  if (!k) {
    k = `nock-local-${crypto.randomUUID()}`;
    localStorage.setItem(KEY, k);
  }
  return k;
}
