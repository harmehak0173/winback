/**
 * Day/month keys in the user's LOCAL timezone.
 *
 * `new Date().toISOString().slice(0, 10)` looks equivalent but is UTC, so for
 * anyone west of Greenwich the "day" rolls over in the afternoon or evening:
 * a US Eastern user checking in at 8pm files the check-in under tomorrow, the
 * button goes dead, and the next morning it is still dead. The daily check-in
 * is the app's core ritual, so it has to follow the user's own midnight.
 *
 * Day arithmetic below works on calendar days, never on +24h: across a
 * daylight-saving change a local day is 23 or 25 hours long, and adding
 * 86,400,000 ms to 00:30 lands on the wrong date twice a year.
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" in local time. */
export type DayKey = string;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" in local time. */
export function localDayKey(d: Date = new Date()): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM" in local time. */
export function localMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** A well-formed, real calendar date key (rejects "2026-02-31"). */
export function isDayKey(v: unknown): v is DayKey {
  if (typeof v !== 'string') return false;
  const m = DAY_KEY_RE.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return localDayKey(d) === v;
}

/** Local midnight at the start of a day key. Invalid keys give an invalid Date. */
export function dayKeyToDate(key: DayKey): Date {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** The day key `n` calendar days after (or before, for negative n) `key`. */
export function addDays(key: DayKey, n: number): DayKey {
  const d = dayKeyToDate(key);
  d.setDate(d.getDate() + n);
  return localDayKey(d);
}

/**
 * Whole calendar days from `from` to `to` (positive when `to` is later).
 * Noon-anchored so a DST shift inside the range cannot round it off by one.
 */
export function daysBetween(from: DayKey, to: DayKey): number {
  const a = dayKeyToDate(from);
  const b = dayKeyToDate(to);
  a.setHours(12, 0, 0, 0);
  b.setHours(12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Monday-first weekday index for a key: 0 = Mon ... 6 = Sun. */
export function weekdayIndex(key: DayKey): number {
  return (dayKeyToDate(key).getDay() + 6) % 7;
}

/** The Monday that starts the week containing `key`. */
export function weekStartKey(key: DayKey): DayKey {
  return addDays(key, -weekdayIndex(key));
}
