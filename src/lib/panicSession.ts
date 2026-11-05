import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * When the panic screen was last open.
 *
 * Nothing that sells may appear within minutes of a craving. The Home screen
 * sits mounted under the panic screen, so without this the end-of-free-week
 * paywall could land the moment someone closes panic, still shaky, and the
 * payoff for getting through an urge would be a price list.
 *
 * Kept in memory for the running session and mirrored to storage, so a panic
 * session just before the app was killed still counts on the next launch.
 */

const KEY = 'winback.panicAt';

let lastPanicAt: number | null = null;

/** Call when the panic screen opens AND when it closes: the window runs from the close. */
export function markPanicSession(): void {
  lastPanicAt = Date.now();
  AsyncStorage.setItem(KEY, String(lastPanicAt)).catch(() => {});
}

/**
 * Milliseconds since the panic screen was last opened or closed, or Infinity when it
 * never has been. An unreadable store answers 0: unknown must hold the
 * paywall back, never let it through.
 */
export async function msSincePanic(): Promise<number> {
  if (lastPanicAt !== null) return Math.max(0, Date.now() - lastPanicAt);
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return Number.POSITIVE_INFINITY;
    const t = Number(raw);
    if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
    lastPanicAt = t;
    return Math.max(0, Date.now() - t);
  } catch {
    return 0;
  }
}

/**
 * Forget the last panic session. Only for an erase: the next person to use
 * this phone is a new account, and the previous one's session must not hold
 * back anything of theirs. A sign-in keeps it - it is still the same person
 * holding the phone, minutes after a craving.
 */
export async function clearPanicSession(): Promise<void> {
  lastPanicAt = null;
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
