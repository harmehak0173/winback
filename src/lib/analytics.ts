import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { ensureSession, supabase } from './supabase';

/**
 * Product analytics, two sinks, both fire-and-forget:
 *  1. Supabase `events` table (first party) - every event, when the backend
 *     is configured. This is where health-context events live, if anywhere.
 *  2. PostHog via its HTTP capture API (third party, only when
 *     EXPO_PUBLIC_POSTHOG_KEY is set) - funnels and retention dashboards. It
 *     receives ONLY the event names on the allowlist below, never anything
 *     about slips, urges, panic sessions, triggers, check-ins or money.
 *     No SDK dependency, so this works identically in Expo Go and dev builds.
 * Events never block the UI and failures are silent.
 *
 * Consent, in order:
 *  - Nothing is sent before the user taps "Agree and start" on Welcome. Events
 *    fired before that (the welcome view itself) wait in memory and are sent
 *    only if the user agrees; otherwise they are dropped with the process.
 *  - "Share usage data" (You tab) is a local setting. It defaults ON, except
 *    OFF when the device region is in the EEA, the UK, Switzerland or Canada,
 *    where analytics that are not needed to run the app need an opt-in. When
 *    it is off, track() sends nothing anywhere - not even to our own table.
 */

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

const PREF_KEY = 'winback:analytics';
const CONSENT_KEY = 'winback:consent';
/** Written by an earlier build of this module; only ever removed now. */
const INSTALL_ID_KEY = 'winback:install-id';
const OUTBOX_KEY = 'winback:analytics-outbox';

/**
 * Event names PostHog may receive. Funnel steps, paywall and purchase, restore
 * and sign-in, settings, notifications, foregrounds and screen views - how the
 * product is used, never how the user is doing. Anything not listed (slip,
 * reset, freeze, urge, panic, trigger, checkin, closeout, spend, comeback, rep,
 * plan, line_cut, milestone, daily reads, errors, ...) is first-party only.
 * When adding an event, it is private unless it is added here on purpose.
 */
const POSTHOG_EVENTS = new Set([
  'app_foregrounded',
  'home_viewed',
  'insights_viewed',
  'free_continued',
  'trial_ended',
  'quiz_restarted',
  'share_progress',
  'account_restored',
]);
const POSTHOG_PREFIXES = [
  'funnel_',
  'paywall_',
  'purchase_',
  'restore_',
  'signin_',
  'settings_',
  'notification_',
  'screen_',
];
/** Properties that stay first-party even on an allowlisted event. */
const POSTHOG_BLOCKED_PROPS = new Set([
  'spend_bracket',
  'days',
  'day',
  'seconds',
  'kind',
  'trigger',
  // The days-clean super-prop is recovery progress: a drop from '31-90' to
  // '0-7' gives a slip away. It stays in our own table.
  'days_clean',
]);

/**
 * ISO 3166 regions where analytics default to off: EEA, UK, Switzerland and
 * Canada. Canada because Quebec's Law 25 requires the most private setting by
 * default, and the phone reports only the country, never the province.
 */
const OPT_IN_REGIONS = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'GB', 'CH', 'CA',
  // Territories that report their own region code but sit under EU or UK law.
  'GF', 'GP', 'MQ', 'RE', 'YT', 'MF', 'AX', 'GI', 'IM', 'JE', 'GG',
]);

function regionDefault(): boolean {
  try {
    const regions = getLocales()
      .map((l) => l.regionCode?.toUpperCase())
      .filter(Boolean);
    // Any opt-in region among the user's locales means default off. Erring
    // toward off costs a data point; erring toward on costs a user's trust.
    // So does a phone that reports no region at all: we cannot tell it is
    // outside one.
    if (!regions.length) return false;
    return !regions.some((r) => OPT_IN_REGIONS.has(r!));
  } catch {
    return false;
  }
}

let enabled = regionDefault();
let consented = false;
let loadPromise: Promise<void> | null = null;
/** A failed read is tried once more by the next caller. */
let loadRetried = false;
let userId: string | null = null;
let superProps: Record<string, string | number | boolean> = {};
let consentWaiters: (() => void)[] = [];
const consentListeners = new Set<() => void>();

type Pending = { name: string; props: Record<string, unknown>; at: string };
/** Events fired before consent or before the preference has loaded. */
let preConsent: Pending[] = [];
const PRE_CONSENT_MAX = 50;
const OUTBOX_MAX = 200;
const OUTBOX_MAX_AGE_MS = 7 * 86_400_000;

/**
 * Read the stored preference and consent. Call once at startup; safe to call
 * again (it returns the same promise). Until it resolves, events are held.
 */
export function loadAnalyticsPreference(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [pref, consent] = await Promise.all([
          AsyncStorage.getItem(PREF_KEY),
          AsyncStorage.getItem(CONSENT_KEY),
        ]);
        if (pref === '1' || pref === '0') enabled = pref === '1';
        consented = !!consent;
      } catch {
        // Unreadable is not "never chose": someone who turned usage data off
        // must not have it turned back on by a storage error. Off, and "not
        // consented", until a later call reads it (once).
        enabled = false;
        if (!loadRetried) {
          loadRetried = true;
          loadPromise = null;
        }
      }
      if (consented) settleConsent();
    })();
  }
  return loadPromise;
}

/** Whether "Share usage data" is on. Sync, from the cache loaded at startup. */
export function getAnalyticsEnabled(): boolean {
  return enabled;
}

/**
 * Turn "Share usage data" on or off. Off stops every sink immediately.
 * Resolves false when the choice could not be saved (after one retry): it
 * holds until the app closes, and the caller says so.
 */
export async function setAnalyticsEnabled(on: boolean): Promise<boolean> {
  enabled = on;
  if (!on) {
    preConsent = [];
    await clearOutbox();
  }
  const write = () => AsyncStorage.setItem(PREF_KEY, on ? '1' : '0').then(() => true, () => false);
  const saved = (await write()) || (await write());
  if (on) track('settings_usage_data', { on: true });
  return saved;
}

/**
 * Coarse properties added to every event: days-clean bucket, premium, free
 * week, discreet. Never answer values, labels or exact figures.
 */
export function setSuperProps(p: Record<string, string | number | boolean>): void {
  superProps = { ...superProps, ...p };
}

/** True once the user has agreed on Welcome (or agreed in an earlier build). */
export function hasConsented(): boolean {
  return consented;
}

/** Resolves once the stored preference has loaded; true if the user has agreed. */
export async function consentKnown(): Promise<boolean> {
  await loadAnalyticsPreference();
  return consented;
}

/** Resolves when the user agrees. Never rejects; may never resolve. */
export function whenConsented(): Promise<void> {
  if (consented) return Promise.resolve();
  return new Promise((resolve) => consentWaiters.push(resolve));
}

/**
 * Call `cb` every time consent is settled: at load for a returning user, and
 * on each "Agree and start" - including the second one in the same process,
 * after "Erase on this device" reset it, which whenConsented() (resolved
 * once) cannot report. Returns an unsubscribe function.
 */
export function onConsentGiven(cb: () => void): () => void {
  consentListeners.add(cb);
  return () => {
    consentListeners.delete(cb);
  };
}

/** The user tapped "Agree and start" (or signed in from Welcome). */
export async function recordConsent(): Promise<void> {
  await loadAnalyticsPreference();
  if (consented) return;
  consented = true;
  await AsyncStorage.setItem(CONSENT_KEY, new Date().toISOString()).catch(() => {});
  settleConsent();
}

function settleConsent(): void {
  const waiters = consentWaiters;
  consentWaiters = [];
  waiters.forEach((w) => w());
  consentListeners.forEach((l) => l());
  const held = preConsent;
  preConsent = [];
  if (enabled) held.forEach((e) => send(e));
}

/**
 * Account erased: the next person to open the app starts from Welcome and is
 * asked again, with the preference back at the region default.
 */
export async function resetAnalyticsPreference(): Promise<void> {
  consented = false;
  enabled = regionDefault();
  preConsent = [];
  superProps = {};
  await AsyncStorage.multiRemove([PREF_KEY, CONSENT_KEY, INSTALL_ID_KEY]).catch(() => {});
  await clearOutbox();
}

/**
 * Drop every event not yet sent: the offline outbox and anything held before
 * the preference loaded. For a sign-in that switches accounts - queued events
 * carry no user id and are inserted as whoever is signed in at flush time, so
 * the previous account's would be attributed to the new one.
 */
export async function clearAnalyticsQueue(): Promise<void> {
  preConsent = [];
  await clearOutbox();
}

/**
 * Forget the cached user id. Must be called on account deletion and sign-in:
 * otherwise every later event is attributed to a user row that no longer
 * matches the session, the insert fails RLS, and analytics stay dead for the
 * whole session.
 */
export function resetAnalyticsIdentity(): void {
  userId = null;
}

export function track(name: string, props: Record<string, unknown> = {}): void {
  const event: Pending = { name, props, at: new Date().toISOString() };
  if (!loadPromise || !consented) {
    // Not loaded yet, or not agreed yet: hold it. Loading flushes it if the
    // user had already agreed; recordConsent flushes it if they agree now.
    if (preConsent.length < PRE_CONSENT_MAX) preConsent.push(event);
    void loadAnalyticsPreference();
    return;
  }
  if (!enabled) return;
  send(event);
}

function send(event: Pending): void {
  void (async () => {
    try {
      const props = { ...event.props, ...superProps };
      // Asked every time rather than cached: ensureSession is memoized, and
      // it is the one place that knows when the session has changed (a
      // sign-in, a sign-out, an account the server has since removed).
      userId = await ensureSession();
      await sendFirstParty({ ...event, props });
      // PostHog only ever sees the account id, because that is the id account
      // deletion erases there. No session, no PostHog copy of this event.
      if (POSTHOG_KEY && userId && isPostHogSafe(event.name)) {
        void sendPostHog({ ...event, props }, userId);
      }
    } catch {
      // Analytics must never break the product.
    }
  })();
}

/**
 * Record a fatal error so it survives the crash that follows.
 *
 * track() is asynchronous all the way down (session, then a network insert),
 * and a fatal JS error in a release build becomes a native crash moments
 * later, so the event never got out. This writes it straight to the offline
 * outbox instead, which the next launch sends. Same rules as every event:
 * nothing before consent, nothing when "Share usage data" is off, first party
 * only. Resolves when the write has settled; callers cap the wait.
 */
export async function recordFatal(name: string, props: Record<string, unknown>): Promise<void> {
  try {
    if (!supabase) return;
    await loadAnalyticsPreference();
    if (!consented || !enabled) return;
    await enqueue([{ name, props: { ...props, ...superProps }, at: new Date().toISOString() }]);
  } catch {
    // Reporting must never be the second crash.
  }
}

function isPostHogSafe(name: string): boolean {
  return POSTHOG_EVENTS.has(name) || POSTHOG_PREFIXES.some((p) => name.startsWith(p));
}

// ---------------------------------------------------------------------------
// First party, with an offline outbox
// ---------------------------------------------------------------------------

let flushing = false;

async function sendFirstParty(event: Pending): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  if (!userId) {
    // Offline, or sign-in backing off. Keep it for later instead of losing
    // exactly the events from the moments the network was worst.
    await enqueue([event]);
    return;
  }
  const { error } = await sb
    .from('events')
    .insert({ user_id: userId, name: event.name, props: event.props, created_at: event.at });
  if (error) {
    if (!error.message.includes('does not exist')) await enqueue([event]);
    return;
  }
  void flushOutbox();
}

async function readOutbox(): Promise<Pending[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Pending[]) : [];
  } catch {
    return [];
  }
}

/**
 * Every read-modify-write of the outbox runs one at a time. Events are sent in
 * parallel, and two unserialized enqueues each read the same list and each
 * wrote back only their own addition - the offline queue kept one event of
 * every burst (the consent step, a commit) and silently dropped the rest.
 */
let outboxChain: Promise<unknown> = Promise.resolve();
function withOutbox<T>(fn: () => Promise<T>): Promise<T> {
  const run = outboxChain.then(fn, fn);
  outboxChain = run.catch(() => {});
  return run;
}

function enqueue(events: Pending[]): Promise<void> {
  return withOutbox(async () => {
    const cutoff = Date.now() - OUTBOX_MAX_AGE_MS;
    const next = [...(await readOutbox()), ...events]
      .filter((e) => e && typeof e.name === 'string' && Date.parse(e.at) > cutoff)
      .slice(-OUTBOX_MAX);
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next)).catch(() => {});
  });
}

function clearOutbox(): Promise<void> {
  return withOutbox(() => AsyncStorage.removeItem(OUTBOX_KEY).catch(() => {}));
}

/** Send whatever the outbox holds. Called after any successful send. */
export async function flushOutbox(): Promise<void> {
  const sb = supabase;
  if (!sb || flushing || !consented || !enabled) return;
  flushing = true;
  try {
    userId = await ensureSession();
    if (!userId) return;
    // Take the whole queue in one step, so an event enqueued meanwhile is
    // either in this batch or left for the next, never lost between them.
    const queued = await withOutbox(async () => {
      const q = await readOutbox();
      if (q.length) await AsyncStorage.removeItem(OUTBOX_KEY);
      return q;
    });
    // The privacy policy says events older than a week are dropped, not sent
    // late: a queue that waited offline that long is filtered here too, not
    // only when something new is added to it.
    const cutoff = Date.now() - OUTBOX_MAX_AGE_MS;
    const fresh = queued.filter((e) => e && typeof e.name === 'string' && Date.parse(e.at) > cutoff);
    if (!fresh.length) return;
    const { error } = await sb.from('events').insert(
      fresh.map((e) => ({ user_id: userId, name: e.name, props: e.props ?? {}, created_at: e.at })),
    );
    if (error && !error.message.includes('does not exist')) await enqueue(fresh);
  } catch {
    // Try again next time.
  } finally {
    flushing = false;
  }
}

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------

async function sendPostHog(event: Pending, distinctId: string): Promise<void> {
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event.props)) {
    if (!POSTHOG_BLOCKED_PROPS.has(k)) properties[k] = v;
  }
  await fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event: event.name,
      distinct_id: distinctId,
      timestamp: event.at,
      properties: {
        ...properties,
        app: 'winback',
        // `environment` lets preview/dev traffic be filtered out of the
        // funnel dashboards instead of polluting the real numbers.
        environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
        // No location: skip GeoIP enrichment of the request IP. (The IP
        // itself is dropped by the project's "Discard client IP data"
        // setting, which must be on - see HANDOFF.md section 4.)
        $geoip_disable: true,
        // A person profile IS processed, holding nothing but the random
        // account id as its distinct id and no properties of its own. Without
        // one, PostHog's per-person deletion (what delete-account calls) finds
        // nothing to delete, and "deleted when you delete your account" would
        // be untrue.
      },
    }),
  }).catch(() => {});
}
