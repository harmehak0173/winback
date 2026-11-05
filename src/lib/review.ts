import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

/**
 * The in-app rating prompt.
 *
 * Store ranking is driven by ratings more than almost anything else we control,
 * but in this app "the user is engaged" and "the user is having a good time"
 * are close to inversely correlated. Peak engagement is the panic screen. So
 * the trigger is chosen deliberately rather than from an engagement heuristic,
 * and most of the code here is about the moments we refuse to ask.
 *
 * Asked at exactly one place: dismissing a milestone celebration of 28 days or
 * more, on a short delay so our modal is fully unmounted first. Google requires
 * its review card be the topmost layer with nothing drawn over it, so showing
 * it under our own modal would be tampering, not just ugly.
 *
 * At most three asks in any 365 days (Apple's own ceiling) and at least 60
 * days apart, so a user who keeps going is asked at 28 days and again at a
 * later milestone (90, 180, a year) rather than once ever. With month-one
 * retention in single digits for this kind of app, one ask at 28 days reached
 * almost nobody. The first ask still waits for 28 days, for the reason below.
 *
 * Deliberately NOT done here:
 * - No sentiment gate. "Enjoying Winback?" -> yes to the store, no to a
 *   feedback form is the single most-enforced violation in this area, and the
 *   stated penalty runs to removal from the Developer Program.
 * - No custom sheet imitating the system one, and no stars of our own.
 * - No incentive. Nothing in the app is unlocked by leaving a review.
 * - No retry. Neither platform tells you whether the sheet appeared, so a
 *   retry loop just burns an invisible quota and trains Play's suppression
 *   against us.
 * - Never from a visible "Rate us" button that calls the API: the OS decides
 *   whether anything appears, so such a button is usually a dead control. A
 *   link built from StoreReview.storeUrl() is the honest way to offer that.
 */

/** Before multi-ask: one timestamp. Still read, so an old ask keeps counting. */
const ASKED_KEY = 'winback.reviewAskedAt';
/** Timestamps (ms) of every ask, newest last. */
const ASKS_KEY = 'winback.reviewAsks';
const URGE_KEY = 'winback.reviewUrgeAt';
const SETBACK_KEY = 'winback.reviewSetbackAt';

/** Apple shows the system sheet at most 3 times a year; asking more is noise. */
const MAX_ASKS_PER_YEAR = 3;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Never two asks close together, even when milestones are. */
const MIN_GAP_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Earliest milestone we will ask at. Not 7, and definitely not 3: the app's own
 * day-3 copy reads "Cravings peak around now", which is the app itself saying
 * the user is at maximum fragility. A month clean is the first milestone where
 * someone can fairly be asked to vouch for this.
 */
const MIN_DAYS = 28;

/**
 * No prompt within two days of an urge session. Surviving a craving feels like
 * a completed task, which makes the panic screen's exit the most tempting
 * trigger in the codebase, and the worst one: the payoff for getting through an
 * urge must not be an ad for the app.
 */
const URGE_COOLDOWN_MS = 48 * 60 * 60 * 1000;

/**
 * No prompt for a month after a relapse or a used streak freeze. Someone who
 * just logged a slip is in shame, and a freeze is a save rather than a win -
 * the user knows the difference even if the counter does not.
 */
const SETBACK_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Lets the celebration finish unmounting before the system card appears. */
const SETTLE_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The latest stamps of this run, kept in memory too. A stamp whose write
// failed read as "never", which would have let the prompt follow a slip or a
// craving straight away: these keep the cooldown for the rest of the run.
const stampedThisRun: Record<string, number> = {};

async function stamp(key: string): Promise<void> {
  const now = Date.now();
  stampedThisRun[key] = now;
  try {
    await AsyncStorage.setItem(key, String(now));
  } catch {
    // Kept in memory above, so the cooldown still holds until the app closes.
  }
}

async function msSince(key: string): Promise<number> {
  const inMemory = key in stampedThisRun ? Date.now() - stampedThisRun[key] : Number.POSITIVE_INFINITY;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return inMemory;
    const t = Number(raw);
    return Math.min(inMemory, Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY);
  } catch {
    // Unreadable means unknown, and unknown must not unlock the prompt.
    return 0;
  }
}

/** Call when the panic screen opens. Starts the urge cooldown. */
export async function noteUrgeSession(): Promise<void> {
  await stamp(URGE_KEY);
}

/** Call on a relapse or a used streak freeze. Starts the setback cooldown. */
export async function noteSetback(): Promise<void> {
  await stamp(SETBACK_KEY);
}

/**
 * Every ask recorded on this install, oldest first. Null when storage cannot
 * be read: unknown must suppress the prompt, never unlock it.
 */
async function readAsks(): Promise<number[] | null> {
  try {
    const [[, list], [, legacy]] = await AsyncStorage.multiGet([ASKS_KEY, ASKED_KEY]);
    let asks: number[] = [];
    if (list) {
      const parsed: unknown = JSON.parse(list);
      if (Array.isArray(parsed)) asks = parsed.filter((t): t is number => Number.isFinite(t));
    }
    const old = Number(legacy);
    if (legacy && Number.isFinite(old) && !asks.includes(old)) asks.unshift(old);
    return asks.sort((a, b) => a - b);
  } catch {
    return null;
  }
}

/** Whether we have ever asked on this install. */
export async function hasAskedForReview(): Promise<boolean> {
  const asks = await readAsks();
  // If we cannot tell, assume we have. Asking twice is worse than never.
  return asks === null || asks.length > 0;
}

/** Whether the ask budget allows another ask now: 3 a year, 60 days apart. */
async function askAllowed(now: number): Promise<boolean> {
  const asks = await readAsks();
  if (asks === null) return false;
  const lastYear = asks.filter((t) => now - t < YEAR_MS && t <= now);
  if (lastYear.length >= MAX_ASKS_PER_YEAR) return false;
  const last = asks[asks.length - 1];
  // A future timestamp means the clock moved back: treat it as just asked.
  if (last !== undefined && (last > now || now - last < MIN_GAP_MS)) return false;
  return true;
}

async function recordAsk(now: number): Promise<void> {
  try {
    const asks = (await readAsks()) ?? [];
    // Keep only the last year: older asks no longer count against anything.
    const kept = [...asks.filter((t) => now - t < YEAR_MS), now].slice(-MAX_ASKS_PER_YEAR);
    await AsyncStorage.setItem(ASKS_KEY, JSON.stringify(kept));
  } catch {
    // A missed record can only mean one extra ask later. The OS's own yearly
    // limit still caps what the user actually sees.
  }
}

/**
 * Ask for a review if this is a good enough moment. Never throws, and the
 * caller must not await it to decide anything: a resolved promise carries no
 * information about whether a sheet appeared, on either platform.
 */
export async function maybeAskForReview(milestoneDays: number): Promise<boolean> {
  try {
    if (milestoneDays < MIN_DAYS) return false;
    if (!(await askAllowed(Date.now()))) return false;
    if ((await msSince(URGE_KEY)) < URGE_COOLDOWN_MS) return false;
    if ((await msSince(SETBACK_KEY)) < SETBACK_COOLDOWN_MS) return false;

    // isAvailableAsync is the real gate: Play Store present on Android, and
    // not-TestFlight on iOS. hasAction() is only `!!storeUrl() ||
    // isAvailableAsync()`, so now that playStoreUrl is configured it is always
    // true and adds nothing - kept so the guard still holds if Expo ever
    // tightens what it means.
    if (!(await StoreReview.isAvailableAsync())) return false;
    if (!(await StoreReview.hasAction())) return false;

    await sleep(SETTLE_MS);

    // Written BEFORE requesting. The OS gives no callback and may silently
    // decline to show anything, so waiting for "success" would mean asking
    // again at every later milestone. An ask counts whether or not it showed.
    await recordAsk(Date.now());

    // Can reject on iOS if there is no foreground-active scene, e.g. the user
    // backgrounded the app during the settle delay. Caught below.
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

/**
 * Wipe the rating-prompt state. Called on account deletion: reviewUrgeAt is the
 * timestamp of the last panic session and reviewSetbackAt the last relapse, so
 * leaving them behind means the two most sensitive facts about a deleted user
 * stay readable on the device. Also used as a test seam.
 */
export async function clearReviewState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([ASKED_KEY, ASKS_KEY, URGE_KEY, SETBACK_KEY]);
  } catch {
    // Nothing to do; the prompt simply stays suppressed.
  }
}

/** @deprecated use clearReviewState */
export const resetReviewPrompt = clearReviewState;
