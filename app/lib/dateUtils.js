/** Calendar date YYYY-MM-DD in the user's local timezone (not UTC). */
export function localDateKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Same as localDateKey, shifted by whole calendar days. */
export function localDateKeyOffset(d = new Date(), deltaDays) {
  const x = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  x.setDate(x.getDate() + deltaDays);
  return localDateKey(x);
}

export function yesterdayStr() {
  return localDateKeyOffset(new Date(), -1);
}
