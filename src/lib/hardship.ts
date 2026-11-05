import { MONTH_NAMES } from '@/components/CloseMark';
import { HARDSHIP_KEY } from './secureAuthStorage';
import { readDeviceValue, writeDeviceValue } from './trial';

/**
 * "Premium is too much right now": a month of Premium on us.
 *
 * The people this app is for are often in debt, and a subscription can be the
 * one bill too many. So anyone who is not subscribed and not in their free
 * week can take 30 days of Premium free: no card, no store, no questions, and
 * nothing to cancel. When it ends there is no paywall, only one quiet note on
 * Home that they can dismiss. A new month can be taken once the last one has
 * ended, at most three in any rolling 365 days.
 *
 * Everything here stays on the device, like the local free-week clock in
 * lib/trial.ts: SecureStore on native, AsyncStorage on the web test build. It
 * is never synced to our server, never shown on a discreet surface (widget,
 * reminders), and wiped by "Erase on this device", account deletion and a
 * reinstall. That makes the limit per device rather than per person, which is
 * the right trade: making it airtight would need the server or device
 * fingerprinting, and a month of Premium is not worth either.
 *
 * Time is read the way the free week reads it: `now` is never earlier than
 * the latest time this device has seen. That alone would let someone wind
 * the date back again and again and keep a month at its start, so while the
 * phone's clock is more than a day behind the latest time seen, a running
 * month is paused (Premium off, the screens say to check the date) and picks
 * up again once the date is right; no month can be started then either.
 * Winding it forward, starting a month and winding it back would freeze that
 * month in place, so a month that starts more than a day after the phone's
 * own clock is not honoured at all (it still counts toward the three).
 */

/** Length of one month on us, in days. */
export const HARDSHIP_DAYS = 30;
/** Most months on us in any rolling window. */
export const HARDSHIP_MAX_PER_YEAR = 3;
/** The rolling window the limit is counted over, in days. */
export const HARDSHIP_WINDOW_DAYS = 365;
/** How long after a month ends its Home note may still show, in days. */
export const HARDSHIP_NOTE_DAYS = 14;

const DAY = 86_400_000;
/** Starts kept on record. The window never holds more than three. */
const MAX_RECORDED = 10;

export interface HardshipRecord {
  /** When each month on us started, in ms, oldest first. */
  grants: number[];
  /** Start of the month whose "it ended" note was dismissed, or null. */
  notedEnd: number | null;
}

export const NO_HARDSHIP: HardshipRecord = { grants: [], notedEnd: null };

export interface HardshipStatus {
  /** A month on us is running now (and not paused, below). */
  active: boolean;
  /**
   * A month would be running, but the phone's clock reads more than a day
   * behind the latest time seen, so it is paused until the date is right.
   */
  paused: boolean;
  /** When the running month ends, or null. */
  endsAt: Date | null;
  /** Months that count against the limit right now. */
  used: number;
  /** Months that could still be taken in this window. */
  remaining: number;
  /** With none remaining: when the next one opens. */
  nextOpensAt: Date | null;
  /** Start of the most recent honoured month, or null. */
  latestStart: number | null;
  /** Any month was ever taken on this device. */
  taken: boolean;
  /**
   * The phone's clock is more than a day behind the latest time seen, so a
   * new month would not run. Starting is refused until the date is right.
   */
  clockBehind: boolean;
  /** The most recent month ended recently and its note is not dismissed. */
  endedNote: boolean;
}

/**
 * Derive the state. `now` is the guarded time (never earlier than the latest
 * time seen), `deviceNow` the phone's own clock. Pure, for tests.
 */
export function hardshipStatus(
  record: HardshipRecord,
  now: number,
  deviceNow: number = now,
): HardshipStatus {
  const grants = record.grants;
  // A start ahead of the phone's own clock is not a start (see above).
  const honoured = grants.filter((at) => at <= deviceNow + DAY);
  const latest = honoured.length ? honoured[honoured.length - 1] : null;
  const windowStart = now - HARDSHIP_WINDOW_DAYS * DAY;
  const counting = grants.filter((at) => at > windowStart);
  const used = counting.length;
  const remaining = Math.max(0, HARDSHIP_MAX_PER_YEAR - used);
  const endMs = latest == null ? null : latest + HARDSHIP_DAYS * DAY;
  const clockBehind = deviceNow < now - DAY;
  const active = endMs != null && now < endMs && !clockBehind;
  const ended = endMs != null && now >= endMs;
  // Measured from the last start on record, honoured or not: a phone set back
  // a year drops that start from `honoured`, and it should read as paused,
  // not as a month that is over.
  const last = grants.length ? grants[grants.length - 1] : null;
  const paused = clockBehind && last != null && now < last + HARDSHIP_DAYS * DAY;
  return {
    active,
    paused,
    endsAt: active && endMs != null ? new Date(endMs) : null,
    used,
    remaining,
    nextOpensAt:
      remaining === 0
        ? new Date(counting[used - HARDSHIP_MAX_PER_YEAR] + HARDSHIP_WINDOW_DAYS * DAY)
        : null,
    latestStart: latest,
    taken: grants.length > 0,
    clockBehind,
    endedNote:
      ended &&
      endMs != null &&
      now - endMs < HARDSHIP_NOTE_DAYS * DAY &&
      record.notedEnd !== latest,
  };
}

/** The record with a new month started at `at`. */
export function addGrant(record: HardshipRecord, at: number): HardshipRecord {
  const grants = [...record.grants, at].sort((a, b) => a - b).slice(-MAX_RECORDED);
  return { ...record, grants };
}

/** "November 4": the day a month on us ends, for "on us until ...". */
export function onUsDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function parseRecord(raw: string | null): HardshipRecord {
  if (!raw) return NO_HARDSHIP;
  try {
    const v = JSON.parse(raw) as { g?: unknown; n?: unknown } | null;
    const ms = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
    const grants = Array.isArray(v?.g)
      ? v.g.filter(ms).sort((a, b) => a - b).slice(-MAX_RECORDED)
      : [];
    return { grants, notedEnd: ms(v?.n) ? v.n : null };
  } catch {
    return NO_HARDSHIP;
  }
}

export async function loadHardship(): Promise<HardshipRecord> {
  return parseRecord(await readDeviceValue(HARDSHIP_KEY));
}

export async function saveHardship(record: HardshipRecord): Promise<void> {
  await writeDeviceValue(HARDSHIP_KEY, JSON.stringify({ g: record.grants, n: record.notedEnd }));
}

/** Erased or deleted: the record goes with everything else on the phone. */
export async function clearHardship(): Promise<void> {
  await writeDeviceValue(HARDSHIP_KEY, null);
}
