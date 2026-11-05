import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Storage adapter for the Supabase auth session on native. The session
 * contains the refresh token - the full bearer credential for the account -
 * so it belongs in the hardware-backed keychain/keystore, not plaintext
 * AsyncStorage (which is included in device/cloud backups).
 *
 * SecureStore caps a single value at ~2KB and a Supabase session can exceed
 * that, so values are split into 2000-byte chunks across SecureStore keys,
 * with a small marker under the base key. Keys are sanitized to SecureStore's
 * allowed character set.
 *
 * Any SecureStore failure falls back to AsyncStorage so a keychain hiccup can
 * never lock a user out of their own account. The rule that keeps the two
 * copies straight: an AsyncStorage copy only exists while it is the NEWEST
 * value. Every successful SecureStore write deletes it, so a read that finds
 * one prefers it and moves it back into the keychain. The old code did the
 * opposite - it read SecureStore first - so a token refresh that landed in the
 * fallback (iOS keychain writes fail while the device is locked) lost to the
 * stale keychain copy on the next launch, the revoked refresh token was
 * replayed, and the anonymous account was gone for good.
 */
const CHUNK = 2000;
/** Stored in place of an empty string, which SecureStore rejects. */
const EMPTY = ' empty';
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * Marker under the base key for a chunked value: "<count>:<generation>".
 * Chunks live at `<base>.<generation>.<i>`, and each write goes to the other
 * generation and flips the marker LAST. A write that fails halfway therefore
 * leaves the previous value fully intact instead of a marker pointing at a mix
 * of old and new chunks (corrupt JSON, which signs the user out).
 *
 * Older builds wrote a bare "<count>" with chunks at `<base>.<i>`; that layout
 * is still read and cleaned up.
 */
type Layout =
  | { kind: 'none' }
  | { kind: 'inline'; value: string }
  | { kind: 'legacy'; count: number }
  | { kind: 'chunked'; count: number; gen: 'a' | 'b' };

function parseMarker(marker: string | null): Layout {
  if (marker == null) return { kind: 'none' };
  const gen = /^(\d+):([ab])$/.exec(marker);
  if (gen) return { kind: 'chunked', count: Number(gen[1]), gen: gen[2] as 'a' | 'b' };
  if (/^\d+$/.test(marker) && Number(marker) > 1) return { kind: 'legacy', count: Number(marker) };
  return { kind: 'inline', value: marker === EMPTY ? '' : marker };
}

function chunkKeys(base: string, layout: Layout): string[] {
  if (layout.kind === 'legacy') {
    return Array.from({ length: layout.count }, (_, i) => `${base}.${i}`);
  }
  if (layout.kind === 'chunked') {
    return Array.from({ length: layout.count }, (_, i) => `${base}.${layout.gen}.${i}`);
  }
  return [];
}

async function readSecure(base: string): Promise<string | null> {
  const layout = parseMarker(await SecureStore.getItemAsync(base));
  if (layout.kind === 'none') return null;
  if (layout.kind === 'inline') return layout.value;
  let out = '';
  for (const k of chunkKeys(base, layout)) {
    const part = await SecureStore.getItemAsync(k);
    // A missing chunk means the value is unreadable. Say so rather than
    // hand supabase-js half a JSON document.
    if (part == null) return null;
    out += part;
  }
  return out;
}

/** Throws if the keychain write fails - callers decide on the fallback. */
async function writeSecure(base: string, value: string): Promise<void> {
  const previous = parseMarker(await SecureStore.getItemAsync(base));
  if (value.length <= CHUNK) {
    await SecureStore.setItemAsync(base, value.length === 0 ? EMPTY : value);
  } else {
    const gen = previous.kind === 'chunked' && previous.gen === 'a' ? 'b' : 'a';
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${base}.${gen}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(base, `${count}:${gen}`);
  }
  // Only now is the new value live; the old chunks are garbage.
  for (const k of chunkKeys(base, previous)) {
    await SecureStore.deleteItemAsync(k).catch(() => {});
  }
}

async function removeSecure(base: string): Promise<void> {
  try {
    const layout = parseMarker(await SecureStore.getItemAsync(base));
    for (const k of chunkKeys(base, layout)) {
      await SecureStore.deleteItemAsync(k).catch(() => {});
    }
    await SecureStore.deleteItemAsync(base);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Fresh-install wipe
// ---------------------------------------------------------------------------

/** AsyncStorage marker that this install has already run once. */
const INSTALL_MARKER = 'winback:installed';

/**
 * SecureStore keys owned by other modules that must not outlive an uninstall.
 * Mirrors PARTNER_KEY in state/AppState.tsx, LOCK_KEY in lib/applock.ts, the
 * free-week keys in lib/trial.ts, the month-on-us record in lib/hardship.ts
 * and the user's own reasons in lib/reasons.ts.
 */
export const PARTNER_KEY = 'winback.partner';
/** STORAGE_KEY in state/AppState.tsx. */
const APP_STATE_KEY = 'winback:v1';
const APP_LOCK_KEY = 'winback.applock';
export const FREE_WEEK_START_KEY = 'winback.freeweek.start';
export const FREE_WEEK_CLOCK_KEY = 'winback.freeweek.clock';
/** Months of Premium on us: when each started. Device-only, never synced. */
export const HARDSHIP_KEY = 'winback.hardship';
/** The user's own reasons, in their words. Device-only, never synced. */
export const MY_REASONS_KEY = 'winback.reasons';

/** The keys supabase-js uses by default (`sb-<project-ref>-auth-token`). */
function supabaseAuthKeys(): string[] {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const ref = new URL(url).hostname.split('.')[0];
    const key = `sb-${ref}-auth-token`;
    return [key, `${key}-code-verifier`, `${key}-user`];
  } catch {
    return [];
  }
}

let freshInstallCheck: Promise<void> | null = null;

/**
 * On iOS the keychain survives an uninstall, AsyncStorage does not. Without
 * this, a reinstall silently resumed the OLD anonymous account: onboarding ran
 * again on an empty device, overwrote that account's server history, and met
 * a free week that had expired months ago. The partner's name and number and
 * the app-lock flag came back from the dead too.
 *
 * So the first launch of an install (no AsyncStorage marker) wipes every
 * keychain entry we own before anything reads one. A reinstall is then a
 * clean anonymous start, and old progress comes back only through email
 * sign-in, which is the one path where the user actually asked for it.
 *
 * An upgrade from a build that predates the marker is not a fresh install:
 * its AsyncStorage still holds data, so it only gets the marker.
 *
 * Every read in this adapter awaits this, which guarantees the ordering even
 * though the Supabase client is created (and starts reading) at import time.
 * Other SecureStore readers (partner, app lock, free week) await it too.
 */
export function ensureFreshInstall(): Promise<void> {
  if (!freshInstallCheck) {
    freshInstallCheck = (async () => {
      if (Platform.OS === 'web') return;
      try {
        if (await AsyncStorage.getItem(INSTALL_MARKER)) return;
        // The app state blob is written on every launch that gets past
        // hydration, so any install that has ever run has it. Checking for
        // that one key (not "is AsyncStorage empty") means a module that
        // writes something early cannot disguise a reinstall as an upgrade.
        const upgraded = await AsyncStorage.getItem(APP_STATE_KEY);
        if (upgraded == null) {
          const keys = [
            ...supabaseAuthKeys(),
            PARTNER_KEY,
            APP_LOCK_KEY,
            FREE_WEEK_START_KEY,
            FREE_WEEK_CLOCK_KEY,
            HARDSHIP_KEY,
            MY_REASONS_KEY,
          ];
          for (const k of keys) await removeSecure(safeKey(k));
        }
        await AsyncStorage.setItem(INSTALL_MARKER, new Date().toISOString());
      } catch {
        // Never block launch on this. Worst case is the pre-fix behaviour.
      }
    })();
  }
  return freshInstallCheck;
}

// ---------------------------------------------------------------------------
// Direct session access, for the two places supabase-js cannot be trusted to do it
// ---------------------------------------------------------------------------

/** supabase-js's own storage on the web (its default), where there is one. */
function webStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Remove the stored Supabase session from this device, whatever supabase-js
 * thinks. Offline with an expired access token, `auth.signOut()` returns its
 * error BEFORE it removes the session, and a failed refresh keeps the refresh
 * token for a retry - so an "erase on this device" that relied on signOut
 * alone could leave the old account's refresh token behind, and the fresh
 * start would quietly resume that account once the phone was back online.
 */
export async function clearStoredSession(): Promise<void> {
  const keys = supabaseAuthKeys();
  if (Platform.OS === 'web') {
    const store = webStorage();
    for (const k of keys) {
      try {
        store?.removeItem(k);
      } catch {
        // nothing stored, or storage blocked: nothing to remove
      }
    }
    return;
  }
  for (const k of keys) await secureAuthStorage.removeItem(k).catch(() => {});
}

/**
 * The user id of the session stored on this device, read straight from
 * storage: no network, no refresh, no sign-in backoff. Null when there is no
 * stored session or it cannot be read.
 */
export async function readStoredUserId(): Promise<string | null> {
  const [key] = supabaseAuthKeys();
  if (!key) return null;
  try {
    const raw =
      Platform.OS === 'web' ? (webStorage()?.getItem(key) ?? null) : await secureAuthStorage.getItem(key);
    if (!raw) return null;
    const id = (JSON.parse(raw) as { user?: { id?: unknown } } | null)?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Keys whose last keychain read threw - not "no value", but a read that
 * failed, for example a keychain that is not available yet. supabase-js only
 * hears null either way, and ensureSession used to take that null as leave to
 * start a new anonymous account, orphaning the real one and overwriting its
 * stored session. ensureSession asks sessionReadFailed() first now.
 */
const failedReads = new Set<string>();

/** True when the stored session's last keychain read failed (not merely empty). */
export function sessionReadFailed(): boolean {
  const [key] = supabaseAuthKeys();
  return !!key && failedReads.has(key);
}

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    await ensureFreshInstall();
    const base = safeKey(key);
    // A fallback copy (or a value from an old AsyncStorage-based build) is by
    // construction newer than the keychain. Use it, and try to move it back.
    const fallback = await AsyncStorage.getItem(key).catch(() => null);
    if (fallback != null) {
      failedReads.delete(key);
      await secureAuthStorage.setItem(key, fallback);
      return fallback;
    }
    // One retry: a keychain that is busy for a moment usually answers.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await readSecure(base);
        failedReads.delete(key);
        return value;
      } catch {
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    failedReads.add(key);
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    await ensureFreshInstall();
    const base = safeKey(key);
    try {
      await writeSecure(base, value);
    } catch {
      // Keep the value where the next read will prefer it, and try to drop
      // the stale keychain copy so it can never be mistaken for current.
      await AsyncStorage.setItem(key, value);
      await removeSecure(base);
      return;
    }
    // The keychain holds the newest value; any fallback copy is now stale
    // (and plaintext), so it goes. Only after a confirmed write.
    await AsyncStorage.removeItem(key).catch(() => {});
  },

  async removeItem(key: string): Promise<void> {
    await ensureFreshInstall();
    await removeSecure(safeKey(key));
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};
