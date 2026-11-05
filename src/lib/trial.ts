import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  ensureFreshInstall,
  FREE_WEEK_CLOCK_KEY,
  FREE_WEEK_START_KEY,
} from './secureAuthStorage';

/**
 * The free week of Premium.
 *
 * Everyone gets full Premium for a week with no card and no paywall. The
 * stores cannot express this: an App Store / Play free trial is an
 * introductory offer on a subscription, and both require payment details on
 * file before it starts. So the week is ours, granted app-side, disclosed on
 * the commit screen before it starts, and the store is only involved when the
 * user actually decides to pay. User-facing copy calls it the "free week of
 * Premium", never a "trial" - it is not a store trial and must not read as one.
 *
 * The clock lives on the server (`profiles.trial_started_at`). Keeping it off
 * the device is the whole point: local state can be edited on a rooted phone
 * and is wiped by a reinstall, either of which would hand out an unlimited
 * week.
 *
 * The column is enforced by a database trigger (`profiles_lock_trial`), not
 * just a DEFAULT and not just by this app declining to write it. RLS lets a
 * user write their own profile row, so a client holding the public anon key
 * can POST or PATCH the column directly - that was verified against the live
 * database, and it worked, until the trigger was added. The trigger sets the
 * value on insert and freezes it on update, so no client path can move it.
 *
 * The week is per account. A reinstall wipes the keychain (see
 * ensureFreshInstall) and starts a new anonymous account, and that account
 * gets its own week; the Terms say so. Closing that would need device-level
 * fingerprinting, which is not worth the privacy cost in an app whose pitch is
 * that it does not track you.
 *
 * Two local values back up the server clock, because the server is not
 * always reachable:
 *  - the first-commit time, stamped once and never reset by redoing the quiz,
 *    so "we could not reach the server" is benefit of the doubt for at most
 *    the week that was promised, not forever;
 *  - the latest time this device has ever seen, so winding the phone's clock
 *    back cannot rewind the week either.
 */
export const TRIAL_DAYS = 7;

const DAY = 86_400_000;

export interface TrialStatus {
  /** Server has not answered yet - treat as "unknown", never as "expired". */
  known: boolean;
  active: boolean;
  /** Whole days left, rounded up, so the last partial day still reads "1 day left". */
  daysLeft: number;
  endsAt: Date | null;
}

export const UNKNOWN_TRIAL: TrialStatus = {
  known: false,
  active: false,
  daysLeft: 0,
  endsAt: null,
};

/** Derive the free-week state from the server timestamp. `now` is injectable for tests. */
export function trialStatus(startedAtIso: string | null, now: number = Date.now()): TrialStatus {
  if (!startedAtIso) return UNKNOWN_TRIAL;
  const started = new Date(startedAtIso).getTime();
  if (Number.isNaN(started)) return UNKNOWN_TRIAL;
  const endsMs = started + TRIAL_DAYS * DAY;
  const remaining = endsMs - now;
  // Clamped to TRIAL_DAYS: the start is stamped by the database, so a server
  // clock a second ahead of the device makes `remaining` a hair over 7 days,
  // and ceil() would advertise "8 days left" on a 7-day week. Never promise
  // more than was offered.
  const daysLeft = remaining > 0 ? Math.min(TRIAL_DAYS, Math.ceil(remaining / DAY)) : 0;
  return {
    known: true,
    active: remaining > 0,
    daysLeft,
    endsAt: new Date(endsMs),
  };
}

/**
 * Whether the locally stamped week is still running. Used only while the
 * server clock is unknown; a missing stamp means the week never started here.
 */
export function localWeekActive(firstCommitAt: number | null, now: number): boolean {
  if (firstCommitAt == null) return false;
  return now - firstCommitAt < TRIAL_DAYS * DAY;
}

/** "6 days left" / "Last day" - for the Home banner. */
export function trialLabel(status: TrialStatus): string {
  if (!status.active) return 'Your free week of Premium has ended';
  if (status.daysLeft <= 1) return 'Last day of your free week of Premium';
  return `${status.daysLeft} days left in your free week of Premium`;
}

// ---------------------------------------------------------------------------
// Local clock (first commit + latest time seen)
// ---------------------------------------------------------------------------

/**
 * SecureStore on native so the values cannot be flipped by editing app
 * storage; web has no SecureStore, and the web build is a testing artifact,
 * so AsyncStorage there. Shared with the month on us (lib/hardship.ts), which
 * is device-only for the same reasons.
 */
export async function readDeviceValue(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return await AsyncStorage.getItem(key);
    await ensureFreshInstall();
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writeDeviceValue(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value == null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, value);
      return;
    }
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {}
}

const parseMs = (raw: string | null): number | null => {
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface TrialClock {
  /** When this device first committed, in ms. null = never. */
  firstCommitAt: number | null;
  /** The latest wall-clock time this device has seen, in ms. */
  latestSeen: number;
}

export async function loadTrialClock(): Promise<TrialClock> {
  const [start, seen] = await Promise.all([
    readDeviceValue(FREE_WEEK_START_KEY),
    readDeviceValue(FREE_WEEK_CLOCK_KEY),
  ]);
  return { firstCommitAt: parseMs(start), latestSeen: parseMs(seen) ?? 0 };
}

/** Stamp the first commit. A no-op if a stamp already exists. */
export async function stampFirstCommit(at: number): Promise<number> {
  const existing = parseMs(await readDeviceValue(FREE_WEEK_START_KEY));
  if (existing != null) return existing;
  await writeDeviceValue(FREE_WEEK_START_KEY, String(at));
  return at;
}

/** Persist the latest time seen. Callers only pass values that moved forward. */
export async function saveLatestSeen(at: number): Promise<void> {
  await writeDeviceValue(FREE_WEEK_CLOCK_KEY, String(at));
}

/** Account erased: the next account is a new account with its own week. */
export async function clearTrialClock(): Promise<void> {
  await Promise.all([
    writeDeviceValue(FREE_WEEK_START_KEY, null),
    writeDeviceValue(FREE_WEEK_CLOCK_KEY, null),
  ]);
}
