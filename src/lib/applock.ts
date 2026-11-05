import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ensureFreshInstall } from '@/lib/secureAuthStorage';

/**
 * Optional app lock (biometric, falling back to the device passcode).
 *
 * This exists for one specific user. `hideFlag` is set when someone hides
 * their betting from a partner AND it is costing them financially - and for
 * exactly that person, anyone picking up their unlocked phone can open Winback
 * and read the streak, the money counter, and the quiz history. Notification
 * copy is already softened for them, so the app was protecting the lock screen
 * and not the app itself.
 *
 * Deliberately opt-in and off by default: locking someone out of a panic
 * button is far worse than the exposure it prevents. It is offered, not
 * imposed, and biometrics can always fall back to the device passcode so a
 * failed fingerprint never traps a user in a craving.
 *
 * The preference lives in SecureStore rather than AsyncStorage so it cannot be
 * flipped off by editing app storage on a rooted device.
 *
 * Changes are broadcast to subscribers, so LockGate applies a toggle from the
 * You tab immediately rather than on the next cold start.
 */
const LOCK_KEY = 'winback.applock';

type LockListener = (on: boolean) => void;
const listeners = new Set<LockListener>();

/** Hear about the lock being turned on or off. Returns the unsubscribe. */
export function subscribeLock(fn: LockListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// True while an authenticateAsync prompt is on screen, whoever asked for it.
// The system sheet itself moves the app to 'inactive' (iOS) or even to
// 'background' (the Android 9-10 device-credential activity), so LockGate has
// to ignore app-state changes that the prompt causes - otherwise every unlock
// schedules the next one, forever.
let authInFlight = false;

export function isAuthenticating(): boolean {
  return authInFlight;
}

export async function isLockSupported(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function isLockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    // The keychain survives an iOS uninstall. Let the fresh-install wipe run
    // first, or a reinstall would read the old lock flag and prompt once.
    await ensureFreshInstall();
    return (await SecureStore.getItemAsync(LOCK_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Resolves to what is actually stored, so the caller never shows a lock that is not there. */
export async function setLockEnabled(on: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return on;
  let stored = on;
  try {
    if (on) await SecureStore.setItemAsync(LOCK_KEY, '1');
    else await SecureStore.deleteItemAsync(LOCK_KEY);
  } catch {
    // Keep the listeners in step with what is actually stored.
    stored = await isLockEnabled();
  }
  for (const fn of listeners) fn(stored);
  return stored;
}

/**
 * Prompt for unlock. Returns true when the app should open.
 *
 * Fails OPEN on anything unexpected - no hardware, no enrolment, a thrown
 * error. A recovery tool that refuses to open because a sensor misbehaved is
 * a worse outcome than one that opens.
 */
export async function requestUnlock(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  // A second prompt on top of one already showing can only fail or loop.
  // Report "not unlocked"; the prompt already on screen will answer.
  if (authInFlight) return false;
  authInFlight = true;
  try {
    if (!(await isLockSupported())) return true;
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Winback',
      // false = allow the device passcode after failed biometrics, so a wet
      // thumb never stands between someone and the panic button.
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
    return res.success;
  } catch {
    return true;
  } finally {
    authInFlight = false;
  }
}
