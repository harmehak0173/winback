import type { NotificationResponse } from 'expo-notifications';
import { getNotifications } from './notifications';
import {
  analyticsType,
  PRIORITY,
  parseReminderUrl,
  type ReminderAnalyticsType,
  type ReminderKind,
} from './schedule/reminderPlan';

/**
 * Reminder taps, caught at the earliest moment and held until the app can
 * act on them.
 *
 * Two ways a tap arrives:
 *  - Cold start: the app was not running. The OS hands the response over at
 *    launch and getLastNotificationResponse() returns it.
 *  - Warm: the app was in the background. The response listener fires.
 * Both can report the same tap, so taps are de-duplicated by the
 * notification's identifier.
 *
 * Nothing navigates from here. The tap is parked as the pending route, and
 * NotificationRouter (inside AppStateProvider) takes it once state has loaded,
 * the entry gate has redirected and the app lock is out of the way. That is
 * also why this does not use useLastNotificationResponse: a hook would
 * re-deliver the same stale response whenever the tree re-rendered.
 */

export interface PendingRoute {
  /** The notification's identifier (de-duplication). */
  id: string;
  /** Checked against REMINDER_ROUTES; always one of them. */
  url: string;
  /** Coarse type for notification_opened (safe for third-party analytics). */
  type: ReminderAnalyticsType;
  /** Exact reminder kind, first party only. */
  kind: ReminderKind | null;
  /** When the tap was caught. A route left waiting too long is dropped. */
  caughtAt: number;
}

/** A post-game tap more than this long after the push no longer names that game. */
const GAME_TAP_MAX_AGE_MS = 18 * 3_600_000;
/** Remembered tap identifiers, so a response seen twice routes once. */
const MAX_HANDLED = 50;

let pending: PendingRoute | null = null;
const handled: string[] = [];
const listeners = new Set<() => void>();
let started = false;

function emit(): void {
  for (const cb of listeners) cb();
}

function isKind(v: unknown): v is ReminderKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PRIORITY, v);
}

/**
 * A notification's delivery time in epoch milliseconds. iOS reports
 * `notification.date` in SECONDS (timeIntervalSince1970) and Android in
 * milliseconds, and expo-notifications passes both through unchanged. Read as
 * milliseconds, every iOS time looked decades old. Any epoch value under 1e11
 * is seconds: in milliseconds that would be early 1973.
 */
function deliveredMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return NaN;
  return raw < 1e11 ? raw * 1000 : raw;
}

function accept(response: NotificationResponse, defaultAction: string): void {
  // A tap on the notification itself. Dismissals and other actions do nothing.
  if (response.actionIdentifier !== defaultAction) return;
  const request = response.notification.request;
  const id = request.identifier;
  if (!id || handled.includes(id)) return;
  handled.push(id);
  if (handled.length > MAX_HANDLED) handled.shift();

  const data = (request.content.data ?? {}) as Record<string, unknown>;
  const kind = isKind(data.kind) ? data.kind : null;
  let url = typeof data.url === 'string' ? data.url : '/(tabs)';
  // An old post-game tap: close out the day, not a game from yesterday.
  const deliveredAt = deliveredMs(response.notification.date);
  if (kind === 'game-post' && Number.isFinite(deliveredAt) && Date.now() - deliveredAt > GAME_TAP_MAX_AGE_MS) {
    url = '/closeout';
  }
  // Only a known route with well-formed params; anything else opens Home.
  if (!parseReminderUrl(url)) url = '/(tabs)';

  pending = {
    id,
    url,
    type: kind ? analyticsType(kind) : 'morning',
    kind,
    caughtAt: Date.now(),
  };
  emit();
}

/**
 * Start listening for reminder taps. Call once, as early as possible (the
 * root layout's mount effect, outside the lock gate), so a cold-start tap is
 * caught. Idempotent; a no-op where notifications cannot run.
 */
export function initNotificationRouting(): void {
  if (started) return;
  started = true;
  void getNotifications().then((N) => {
    if (!N) return;
    const defaultAction = N.DEFAULT_ACTION_IDENTIFIER;
    // Listen first, then read the launch response: a tap landing in between
    // is caught by one or the other, and the identifier check drops the copy.
    N.addNotificationResponseReceivedListener((r) => accept(r, defaultAction));
    try {
      const last = N.getLastNotificationResponse();
      if (last) accept(last, defaultAction);
    } catch {
      // Not available in this environment.
    }
  });
}

/** The tap waiting to be routed, if any. */
export function getPendingRoute(): PendingRoute | null {
  return pending;
}

/** Called whenever the pending route changes. */
export function subscribePendingRoute(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Take the pending route (it is being navigated to, or dropped). Clears the
 * OS's record of the launch response too, so nothing reads it again.
 */
export function clearPendingRoute(id: string): void {
  if (pending?.id !== id) return;
  pending = null;
  emit();
  void getNotifications().then((N) => {
    try {
      N?.clearLastNotificationResponse();
    } catch {
      // Not available in this environment.
    }
  });
}
