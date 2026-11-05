import { type Href, router, useSegments } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { useLockCover } from '@/components/LockGate';
import { track } from '@/lib/analytics';
import { clearPendingRoute, getPendingRoute, subscribePendingRoute } from '@/lib/notificationRouting';
import { useOverlayOpen } from '@/lib/overlayHold';
import { parseReminderUrl } from '@/lib/schedule/reminderPlan';
import { useAppState } from '@/state/AppState';

export { initNotificationRouting } from '@/lib/notificationRouting';

/**
 * A tap that waits longer than this (the app stuck on the lock screen, a long
 * panic session) is dropped rather than opening a screen out of nowhere.
 */
const PENDING_MAX_AGE_MS = 30 * 60_000;

/** Screens a reminder never interrupts. The route waits until they close. */
const DO_NOT_INTERRUPT = new Set(['panic', 'slip', 'lights-out']);

/**
 * Opens the screen a tapped reminder names. Renders nothing.
 *
 * Mount it once inside AppStateProvider (it reads state and the lock cover),
 * next to the root Stack. initNotificationRouting() must also run from the
 * root layout's mount effect so a cold-start tap is caught before this
 * mounts.
 *
 * It waits until:
 *  - state has loaded and the user has committed (a tap during onboarding,
 *    after "redo the quiz", is stale and is dropped);
 *  - the entry gate has redirected (pushing before its Redirect ran would be
 *    replaced by it);
 *  - the app lock is out of the way: the lock overlay no longer unmounts the
 *    tree, so the route opens under nothing and the user lands on it after
 *    unlocking, rather than a panic screen starting behind Face ID;
 *  - no panic, slip or lights-out screen is open;
 *  - no in-screen overlay (the milestone celebration, the quick urge sheet)
 *    is showing: on iOS the pushed modal would close it natively, behind its
 *    back (see lib/overlayHold).
 */
export function NotificationRouter() {
  const { ready, quitDate } = useAppState();
  const { covered } = useLockCover();
  const overlayOpen = useOverlayOpen();
  const segments = useSegments();
  const pending = useSyncExternalStore(subscribePendingRoute, getPendingRoute, getPendingRoute);
  const top = segments[0] as string | undefined;

  useEffect(() => {
    if (!pending || !ready) return;
    if (!quitDate || Date.now() - pending.caughtAt > PENDING_MAX_AGE_MS) {
      clearPendingRoute(pending.id);
      return;
    }
    if (covered || overlayOpen || !top || top === 'onboarding' || DO_NOT_INTERRUPT.has(top)) return;

    const route = parseReminderUrl(pending.url);
    clearPendingRoute(pending.id);
    // Coarse type only: this event may reach PostHog. The exact kind is
    // first party - except 'goal', reported as 'milestone'. Goal pushes are
    // only scheduled when discreet mode is off, so next to the `discreet`
    // super-prop a 'goal' open would tell the server how the secrecy answer
    // (which sets that default) was answered.
    track('notification_opened', { type: pending.type });
    if (pending.kind) {
      track('reminder_opened', { kind: pending.kind === 'goal' ? 'milestone' : pending.kind });
    }
    if (!route) return;

    const href = { pathname: route.pathname, params: route.params } as unknown as Href;
    if (route.pathname.startsWith('/(tabs)')) {
      // A tab: close whatever is open over the tabs, then switch to it,
      // rather than stacking a second copy of the tab navigator.
      if (router.canDismiss()) router.dismissAll();
      router.navigate(href);
      return;
    }
    // Already on that screen: carry the new params over instead of stacking a copy.
    if (top === route.pathname.slice(1)) {
      if (Object.keys(route.params).length) router.setParams(route.params);
      return;
    }
    router.push(href);
  }, [pending, ready, quitDate, covered, overlayOpen, top]);

  return null;
}
