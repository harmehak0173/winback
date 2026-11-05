import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';
import {
  analyticsType,
  GAME_LOOKAHEAD_DAYS,
  planReminders,
  type ReminderChannel,
} from './schedule/reminderPlan';
import { track } from './analytics';
import { type Game, getScheduleProvider, type UpcomingGames } from './schedule/ScheduleProvider';
import {
  type CachedGame,
  clearCachedGames,
  readCachedGames,
  type ScheduleInput,
  writeCachedGames,
} from './scheduleInput';

/**
 * Local reminders: permission, Android channels, and the schedule itself.
 *
 * Everything is local. There is no push token and no server that sends
 * anything: every reminder is queued on the device from the ScheduleInput
 * AppState builds, with copy from lineBank.ts and timing from
 * schedule/reminderPlan.ts. Nothing about the user leaves the phone here -
 * the one network call is the saved teams' public game schedule (Premium).
 *
 * expo-notifications must be loaded lazily: since SDK 53, importing it inside
 * Expo Go on Android throws (push support was removed from Expo Go). In that
 * environment, and on web, every function here quietly no-ops; a development
 * build restores full functionality.
 */
type NotificationsModule = typeof import('expo-notifications');

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cached: NotificationsModule | null = null;
let loading: Promise<NotificationsModule | null> | null = null;

/** The notifications module, or null where it cannot run. Shared with notificationRouting.ts. */
export function getNotifications(): Promise<NotificationsModule | null> {
  if (loading) return loading;
  loading = (async () => {
    if (Platform.OS === 'web') return null;
    if (Platform.OS === 'android' && isExpoGo) return null;
    try {
      const mod = await import('expo-notifications');
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      cached = mod;
    } catch (e) {
      console.warn('[notifications] unavailable in this environment:', e);
      cached = null;
    }
    return cached;
  })();
  return loading;
}

// ---------------------------------------------------------------------------
// Android channels
// ---------------------------------------------------------------------------

/**
 * Named channels, so each shows up in the phone's settings as what it is and
 * can be silenced on its own. Without a channelId, Android files everything
 * under Expo's fallback "Miscellaneous" channel at high importance, and the
 * channel the old code created stayed empty.
 */
const CHANNELS: Record<ReminderChannel, { name: string; description: string }> = {
  reminders: {
    name: 'Reminders',
    description: 'Morning check-ins, evening close-outs and milestones.',
  },
  'game-day': {
    name: 'Game day',
    description: 'Before, during and after the games you follow.',
  },
};

let channelsReady: Promise<void> | null = null;

function ensureChannels(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelsReady) {
    channelsReady = (async () => {
      for (const [id, c] of Object.entries(CHANNELS)) {
        await N.setNotificationChannelAsync(id, {
          name: c.name,
          description: c.description,
          importance: N.AndroidImportance.DEFAULT,
        });
      }
      // The channel earlier builds created and never used.
      await N.deleteNotificationChannelAsync('default').catch(() => {});
    })().catch((e) => {
      channelsReady = null;
      console.warn('[notifications] channel setup failed:', e);
    });
  }
  return channelsReady;
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

/**
 * 'undetermined' = the OS will still show its prompt; 'denied' = only the
 * phone's settings can turn reminders on; 'unavailable' = this build or
 * platform has no local notifications (web, Expo Go on Android).
 */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function getReminderPermission(): Promise<ReminderPermission> {
  const N = await getNotifications();
  if (!N) return 'unavailable';
  try {
    const p = await N.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * Show the OS permission prompt (from the reminders priming screen, or the
 * You tab). Resolves to whether reminders can now be delivered. Never asks
 * again once the OS has said the answer is final.
 *
 * Simulators and emulators are fine: local notifications work there, and the
 * old device-only check meant reminders could never be tested on one.
 */
export async function requestReminderPermission(): Promise<boolean> {
  const N = await getNotifications();
  if (!N) return false;
  try {
    // Android 13+ shows the prompt only once a channel exists.
    await ensureChannels(N);
    const existing = await N.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const asked = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return asked.granted;
  } catch (e) {
    console.warn('[notifications] permission request failed:', e);
    return false;
  }
}

/** Open this app's notification settings (Android), or its settings page (iOS). */
export async function openNotificationSettings(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    const pkg = Constants.expoConfig?.android?.package ?? 'com.winback.app';
    try {
      await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: pkg },
      ]);
      return;
    } catch {
      // Some launchers block the direct intent; the app's settings page has it one tap in.
    }
  }
  await Linking.openSettings().catch(() => {});
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

/**
 * Every schedule change runs through one chain, in call order: a rebuild is
 * "cancel everything, then queue", and two running at once would each cancel
 * first and then both queue, doubling every reminder. Only the newest request
 * does any work; a rebuild superseded while it waits (or while it fetches
 * games) steps aside for the one after it.
 */
let chain: Promise<void> = Promise.resolve();
let generation = 0;

function enqueue(work: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
  const mine = ++generation;
  const isCurrent = () => mine === generation;
  chain = chain
    .then(() => (isCurrent() ? work(isCurrent) : undefined))
    .catch((e) => console.warn('[notifications] scheduling failed:', e));
  return chain;
}

/** Cancel everything queued (account deletion, a sign-in wipe, redoing the quiz). */
export function cancelAllNotifications(): Promise<void> {
  return enqueue(async () => {
    const N = await getNotifications();
    await N?.cancelAllScheduledNotificationsAsync();
  });
}

/**
 * Rebuild the whole local schedule from `input`. Idempotent and cheap to call
 * often: AppState calls it on launch, on commit, when any input changes, and
 * on every foreground (the dated window has to be topped up or it runs out).
 * With no quit date it clears the schedule instead.
 */
export function refreshNotificationSchedule(input: ScheduleInput): Promise<void> {
  return enqueue((isCurrent) => doRefresh(input, isCurrent));
}

async function doRefresh(input: ScheduleInput, isCurrent: () => boolean): Promise<void> {
  const N = await getNotifications();
  if (!N) return;
  if (!input.quitDate) {
    await N.cancelAllScheduledNotificationsAsync();
    return;
  }
  const permission = await N.getPermissionsAsync();
  if (!permission.granted) return;
  await ensureChannels(N);

  // The only network wait, done before anything is cancelled so the queue is
  // never left empty while a request is out.
  const games = await gamesFor(input);
  if (!isCurrent()) return;

  const plan = planReminders(input, games, new Date());
  await N.cancelAllScheduledNotificationsAsync();
  // One reminder the OS refuses must not cost the rest of the plan: the old
  // schedule is already gone, and the plan is in time order, so stopping at
  // the first failure left every later day empty.
  let failed = 0;
  for (const r of plan) {
    try {
      await N.scheduleNotificationAsync({
        content: {
          title: r.title,
          body: r.body,
          // What the tap opens (notificationRouting.ts). `type` is coarse and
          // may reach analytics; `kind` is the exact reminder, first party only.
          data: { url: r.url, type: analyticsType(r.kind), kind: r.kind },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: r.at,
          channelId: r.channel,
        },
      });
    } catch {
      failed += 1;
    }
  }
  // Counts only, so a pattern of refusals is visible without any content.
  if (failed) track('reminders_not_scheduled', { failed, planned: plan.length });
}

const GAME_STALE_MS = 4 * 3_600_000;

function toCached(g: Game): CachedGame {
  return {
    id: g.id,
    league: g.league,
    startsAt: g.startsAt.toISOString(),
    estimatedHalftimeAt: g.estimatedHalftimeAt?.toISOString() ?? null,
    estimatedEndAt: g.estimatedEndAt?.toISOString() ?? null,
    homeName: g.homeTeam.name,
    awayName: g.awayTeam.name,
  };
}

/**
 * Saved teams' games for the reminders (and for Home's "game today", through
 * the cache). Game-day automation is Premium, so nothing is fetched for
 * anyone else. Offline, or with the source down, the last good fetch is used
 * - an offline rebuild must not silently drop tonight's game.
 */
async function gamesFor(input: ScheduleInput): Promise<CachedGame[]> {
  if (!input.teams.length) {
    if ((await readCachedGames()).length) await clearCachedGames();
    return [];
  }
  if (!input.isPremium) return [];

  const names = new Set(input.teams.map((t) => t.name));
  const cutoff = Date.now() - GAME_STALE_MS;
  const known = (await readCachedGames()).filter(
    (g) => (names.has(g.homeName) || names.has(g.awayName)) && Date.parse(g.startsAt) > cutoff,
  );

  let fetched: UpcomingGames | null;
  try {
    fetched = await getScheduleProvider().getUpcomingGames(input.teams, GAME_LOOKAHEAD_DAYS);
  } catch {
    fetched = null;
  }
  if (!fetched || !fetched.anyOk) return known;

  const fresh = fetched.games.map(toCached);
  const ids = new Set(fresh.map((g) => g.id));
  // A game already under way stays until it ends. The "next events" feed
  // may stop listing a game once it starts, and a rebuild mid-game (tapping
  // the halftime push is a foreground) would otherwise drop its halftime and
  // post-game reminders - the post-game one standing in for tonight's
  // close-out.
  const now = Date.now();
  const underway = known.filter(
    (g) =>
      !ids.has(g.id) &&
      Date.parse(g.startsAt) <= now &&
      // No end estimate: `known` already stops at four hours after the start.
      (!g.estimatedEndAt || Date.parse(g.estimatedEndAt) + 30 * 60_000 > now),
  );
  if (fetched.complete) {
    const games = [...underway, ...fresh];
    await writeCachedGames(games);
    return games;
  }
  // Some teams answered, some did not: keep what was known for the rest.
  const merged = [...fresh, ...known.filter((g) => !ids.has(g.id))];
  await writeCachedGames(merged);
  return merged;
}
