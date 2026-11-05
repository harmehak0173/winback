import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { createClient, isAuthRetryableFetchError, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import {
  clearStoredSession,
  ensureFreshInstall,
  readStoredUserId,
  secureAuthStorage,
  sessionReadFailed,
} from './secureAuthStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The app is offline-first: every feature works without a backend.
 * When Supabase env vars are absent (local dev before the project exists),
 * `supabase` is null and all sync calls become no-ops.
 *
 * Auth session storage:
 *  - Native: SecureStore-backed adapter, so the refresh token (the account's
 *    bearer credential) lives in the hardware keychain/keystore, not plaintext.
 *    The adapter wipes a previous install's keychain entries before its first
 *    read (see ensureFreshInstall), so a reinstall never resumes an old account.
 *  - Web: supabase-js's default (SSR-safe) storage. The native adapter can't
 *    run during static export (no window / no SecureStore), and web is a
 *    dev/testing artifact, not a shipped product.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          ...(Platform.OS === 'web' ? {} : { storage: secureAuthStorage }),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Start the install check now rather than on the first auth read, so it is
// already settled by the time anything else asks.
void ensureFreshInstall();

// On native, supabase-js cannot tell whether the app is in the foreground, so
// it would keep refreshing tokens in the background - where iOS keychain
// writes fail while the phone is locked. Refresh only while the app is in
// use, as the Supabase React Native guide recommends. Registered once, at
// module scope. The browser build handles this itself via page visibility.
if (supabase && Platform.OS !== 'web') {
  const client = supabase;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
}

/** Resolve to `fallback` if `p` has not settled in `ms` - nothing here may hang the app. */
export function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Anonymous-first auth: users must be able to use a gambling-recovery app
 * without creating an account. Requires "Allow anonymous sign-ins" to be
 * enabled in the Supabase dashboard (Authentication -> Providers).
 *
 * CAPTCHA must stay OFF for this project. The client never sends a
 * captchaToken, so turning on Supabase's CAPTCHA protection would fail every
 * anonymous sign-in. Abuse is bounded by Supabase's per-IP rate limits and by
 * the backoff below.
 */
let sessionPromise: Promise<string | null> | null = null;

/**
 * Failure backoff. Supabase allows a limited number of anonymous sign-ins per
 * IP per hour, and analytics, sync and the purchases alias all call
 * ensureSession. Without a backoff, a device that got one 429 (or is offline)
 * re-hit the endpoint on every single event - burning the budget for everyone
 * behind the same carrier NAT. After a failure: 30s, doubling to 10 minutes.
 * Any success resets it.
 */
const BACKOFF_MIN_MS = 30_000;
const BACKOFF_MAX_MS = 10 * 60_000;
const SESSION_TIMEOUT_MS = 10_000;
let backoffMs = 0;
let retryAfter = 0;
/** Set while forgetSession() runs; ensureSession waits for it. */
let forgetting: Promise<void> | null = null;

export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  await dropUnfinishedSignIn();
  // Never read (or re-save) the session that is being erased.
  if (forgetting) await forgetting;
  // Startup fires several of these at once (state hydration, analytics, the
  // purchases alias). Without this in-flight dedupe each caller races into its
  // own signInAnonymously(), minting orphan users and leaving callers holding
  // a user id that no longer matches the persisted session's JWT - so their
  // RLS-checked writes fail.
  if (sessionPromise) return sessionPromise;
  if (Date.now() < retryAfter) return null;
  const client = supabase;
  sessionPromise = withTimeout(
    (async () => {
      try {
        const { data, error: sessionError } = await client.auth.getSession();
        if (data.session) return data.session.user.id;
        // A session that could not be refreshed just now (no network) is
        // still this phone's account: supabase-js keeps it stored and reports
        // the refresh error here. That is not "no session", so nothing new is
        // minted; the next call retries after the backoff. A refresh the
        // server rejected outright is not retryable, and gets a new account.
        if (sessionError && isAuthRetryableFetchError(sessionError)) return null;
        // Nor is a keychain that could not be read: leave the account alone
        // for this launch rather than replace it.
        if (sessionReadFailed()) return null;
        const { data: anon, error } = await client.auth.signInAnonymously();
        if (error) {
          console.warn('[supabase] anonymous sign-in failed:', error.message);
          return null;
        }
        return anon.user?.id ?? null;
      } catch (e) {
        console.warn('[supabase] ensureSession error:', e);
        return null;
      }
    })(),
    SESSION_TIMEOUT_MS,
    null,
  );
  const id = await sessionPromise;
  if (id == null) {
    // Only cache a success: a failure is retryable, just not immediately.
    sessionPromise = null;
    backoffMs = backoffMs ? Math.min(BACKOFF_MAX_MS, backoffMs * 2) : BACKOFF_MIN_MS;
    retryAfter = Date.now() + backoffMs;
  } else {
    backoffMs = 0;
    retryAfter = 0;
    rememberAccount(id);
  }
  return id;
}

/**
 * The last account id this phone had a session for, kept in plain app storage
 * (it is a random id, not a credential). It outlives a bundle that has lost
 * its backend configuration - an OTA update published without the EAS env
 * variables - which cannot read the stored session (it does not even know the
 * storage key). Deletion in such a bundle must not report "nothing ever left
 * the phone" when an account on our servers still exists.
 */
const LAST_ACCOUNT_KEY = 'winback:last-account-id';
let rememberedAccount: string | null = null;

function rememberAccount(id: string): void {
  if (rememberedAccount === id) return;
  rememberedAccount = id;
  void AsyncStorage.setItem(LAST_ACCOUNT_KEY, id).catch(() => {});
}

/** See LAST_ACCOUNT_KEY. Null when this phone never had a server account. */
export async function lastKnownAccountId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

// A session can end without us asking: signOut elsewhere, or a refresh the
// server refuses because the account no longer exists (abandoned anonymous
// accounts are deleted after 12 months). supabase-js drops the stored session
// and emits SIGNED_OUT; forget the cached id too, so the next call signs in
// afresh instead of handing out an id every RLS check will reject.
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') sessionPromise = null;
});

/** Drop the cached session (and any backoff) after sign-in, sign-out or deletion. */
export function resetSessionCache(): void {
  sessionPromise = null;
  backoffMs = 0;
  retryAfter = 0;
}

const SIGN_OUT_TIMEOUT_MS = 5_000;

/**
 * Sign out AND make sure no session survives on this device, online or not.
 * For "Erase on this device" and account deletion: the next ensureSession()
 * must mint a genuinely new anonymous user.
 *
 * signOut() alone is not enough. Offline with an expired access token it
 * returns an error before removing anything, and the refresh token stayed in
 * the keychain - so the "fresh start" resumed the old account (same id, new
 * onboarding answers uploaded into it) as soon as the phone was back online.
 * So the stored session is removed directly afterwards, whatever signOut said.
 * Online, signOut still runs first so the server revokes the refresh token.
 *
 * `scope: 'local'` ends only this phone's session. A sign-in that is backed
 * out of (see SIGNIN_PENDING_KEY) uses it, so the account's other phones stay
 * signed in.
 */
export function forgetSession(scope: 'global' | 'local' = 'global'): Promise<void> {
  // The erased phone keeps no trace of the account, its id included.
  rememberedAccount = null;
  void AsyncStorage.removeItem(LAST_ACCOUNT_KEY).catch(() => {});
  if (!supabase) return Promise.resolve();
  if (forgetting) return forgetting;
  const client = supabase;
  resetSessionCache();
  forgetting = (async () => {
    await withTimeout(
      client.auth.signOut({ scope }).then(() => undefined),
      SIGN_OUT_TIMEOUT_MS,
      undefined,
    );
    await clearStoredSession();
  })().finally(() => {
    forgetting = null;
    resetSessionCache();
  });
  return forgetting;
}

/**
 * The account this device is signed in as, from the stored session only: no
 * network and no sign-in backoff. ensureSession() returns null while its
 * failure backoff runs, which made a sign-in on a flaky connection look like
 * "there was no previous account" and merged that account's local data into
 * the one signed into. Null when nothing is stored (or no backend).
 */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  await dropUnfinishedSignIn();
  if (forgetting) await forgetting;
  return readStoredUserId();
}

/**
 * A sign-in whose account has not been read yet: set once the code is
 * verified, cleared once restore has read the account or the person backs
 * out. If the app is closed in between, the first session use on the next
 * launch drops that session (this phone only) before anything is uploaded
 * into it. Otherwise this phone's onboarding could upload a fresh quit date
 * over the account's real one, which nobody had been able to read.
 */
const SIGNIN_PENDING_KEY = 'winback:signin-pending';
let pendingChecked: Promise<void> | null = null;
/** A clear of the marker that has not landed yet. */
let clearOwed = false;

/**
 * Set or clear the marker; resolves true once the write landed. One retry,
 * because a clear that is lost signs the person out of the account they just
 * restored at the next launch (and mints a new anonymous one in its place).
 * A clear that still fails is retried when the app goes to the background.
 */
export async function setSignInPending(pending: boolean): Promise<boolean> {
  // This launch is past its check: a sign-in in progress must not be dropped.
  pendingChecked = Promise.resolve();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (pending) await AsyncStorage.setItem(SIGNIN_PENDING_KEY, '1');
      else await AsyncStorage.removeItem(SIGNIN_PENDING_KEY);
      if (!pending) clearOwed = false;
      return true;
    } catch {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  if (!pending) clearOwed = true;
  return false;
}

// Before the next launch can read a marker whose clear was lost.
AppState.addEventListener('change', (state) => {
  if (state !== 'active' && clearOwed) void setSignInPending(false);
});

function dropUnfinishedSignIn(): Promise<void> {
  pendingChecked ??= (async () => {
    try {
      if (!(await AsyncStorage.getItem(SIGNIN_PENDING_KEY))) return;
      await forgetSession('local');
      await AsyncStorage.removeItem(SIGNIN_PENDING_KEY);
    } catch {
      // Unreadable storage: nothing to act on.
    }
  })();
  return pendingChecked;
}

/**
 * Upgrade the anonymous user to a permanent email account later
 * (Settings → "Save my progress"). Supabase converts the anonymous user
 * in place, so all quiz data / streak history is preserved.
 *
 * Security: the Supabase project MUST have "Secure email change" enabled
 * (Auth → Providers → Email) so changing to an address requires confirmation
 * from BOTH the old and new address - otherwise an anonymous session could
 * claim an email that already belongs to a real account. We also normalize
 * the address and return Supabase's own error (e.g. "email already registered")
 * verbatim so the collision case surfaces to the user rather than silently
 * merging identities.
 */
export async function upgradeToEmail(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Backend not configured' };
  const normalized = email.trim().toLowerCase();
  const { error } = await supabase.auth.updateUser({ email: normalized });
  return { error: error?.message ?? null };
}

const DELETE_TIMEOUT_MS = 20_000;

/**
 * Full account deletion via the delete-account edge function (service role
 * lives server-side). Signs out afterwards; caller clears local state.
 */
export async function deleteAccount(): Promise<{ error: string | null; thirdPartyIncomplete?: boolean }> {
  if (!supabase) return { error: 'Backend not configured' };
  try {
    // Bounded like every other backend call: on a stalled connection the
    // caller must reach its "erase on this device" fallback, not spin forever.
    // A request that completes late still deletes the account, and the
    // fallback copy already says the server copy may still exist.
    const { data, error } = await withTimeout(
      supabase.functions.invoke('delete-account', { body: {} }),
      DELETE_TIMEOUT_MS,
      { data: null, error: new Error('timeout') },
    );
    if (error || !data?.ok) return { error: error?.message ?? 'Deletion failed' };
    // Bounded too: the account is already gone, and a stalled sign-out used
    // to leave "Deleting..." spinning before this phone's copy was erased.
    await forgetSession();
    // Caller clears local state (AppState.eraseAllLocalData), which also
    // resets the cached analytics identity.
    resetSessionCache();
    // The purchase record and the usage events live with third parties. If
    // either did not confirm (it errored, or its secret is not set on the
    // server), the person is told, with a way to have it finished by hand.
    const cleanup = (data as { cleanup?: Record<string, string> }).cleanup ?? {};
    const thirdPartyIncomplete = Object.values(cleanup).some((s) => s === 'failed' || s === 'skipped');
    return { error: null, thirdPartyIncomplete };
  } catch (e) {
    return { error: String(e) };
  }
}

export interface ProfileRow {
  monthly_spend: number | null;
  sports: string[];
  triggers: string[];
  goal: string | null;
  baseline_streak: string | null;
  quit_at: string | null;
  plan: 'yearly' | 'monthly' | 'free' | null;
  /** Money kept during streaks that have already ended. */
  money_kept_before: number;
  /** Daily reads completed, so the curriculum resumes where it was on a new phone. */
  daily_index: number;
  /** Longest clean streak ever reached, in days. */
  best_streak_days: number;
  /** Read-only to the client - stamped by the database on insert. */
  trial_started_at?: string;
}

/**
 * Profile upsert; failures only warn (offline-first). Resolves true only when
 * the row was written, so a caller that must not lose a write (the commit)
 * can keep it pending and try again. No backend configured counts as done:
 * there is nothing to retry against.
 */
export async function syncProfile(partial: Partial<ProfileRow>): Promise<boolean> {
  if (!supabase) return true;
  const userId = await ensureSession();
  if (!userId) return false;
  // trial_started_at is deliberately never sent: the database stamps it on
  // insert, so no client write can restart or extend the free week.
  const { trial_started_at: _ignored, ...safe } = partial;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...safe, updated_at: new Date().toISOString() });
  if (error) {
    console.warn('[supabase] profile sync failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Read the server-stamped trial start. Returns null when the backend is
 * unreachable or the profile does not exist yet - callers must treat null as
 * "unknown", never as "expired", or a flaky network would lock a paying-age
 * user out of features they still have.
 */
export async function fetchTrialStart(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const userId = await ensureSession();
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('trial_started_at')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return (data.trial_started_at as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a one-time sign-in code to an email that already belongs to an account.
 *
 * `shouldCreateUser: false` matters: this is a RESTORE path, not a signup. If
 * it created users, anyone could type any address and be handed a fresh empty
 * account, and a typo would silently strand someone in a new account rather
 * than telling them the address is unknown.
 */
export async function requestSignInCode(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Backend not configured' };
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  return { error: error?.message ?? null };
}

/** Exchange the emailed code for a session as the original user. */
export async function verifySignInCode(
  email: string,
  token: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Backend not configured' };
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (!error) resetSessionCache();
  return { error: error?.message ?? null };
}

/**
 * Persist raw quiz answers (question id + selected option labels).
 *
 * `secrecy` never leaves the device, and that is enforced HERE, not only by
 * callers. Whether someone hides their betting from the people around them is
 * the answer most capable of harming them, and nothing server-side needs it.
 * An earlier build filtered it at one call site and forgot the other, and the
 * privacy policy, data map and store privacy answers were all wrong as a
 * result. The database also rejects the row.
 */
export async function syncQuizAnswers(
  rows: { question_id: string; answer: string[] }[],
): Promise<boolean> {
  if (!supabase) return true;
  const safe = rows.filter((r) => r.question_id !== 'secrecy');
  if (!safe.length) return true;
  const userId = await ensureSession();
  if (!userId) return false;
  const { error } = await supabase.from('quiz_answers').upsert(
    safe.map((r) => ({
      user_id: userId,
      question_id: r.question_id,
      answer: r.answer,
      answered_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id,question_id' },
  );
  if (error) {
    console.warn('[supabase] quiz sync failed:', error.message);
    return false;
  }
  return true;
}
