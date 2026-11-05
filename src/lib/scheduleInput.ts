import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DayKey } from './day';
import type { League, Team } from './schedule/ScheduleProvider';
import type { AnswerMap } from '@/state/quiz-data';

/**
 * The contract between app state and the reminder engine.
 *
 * AppState builds one ScheduleInput from everything the schedule depends on
 * and hands it to refreshNotificationSchedule. The engine reads nothing else:
 * no AsyncStorage, no context, no clock-derived state it would have to keep in
 * step itself. That is what lets a check-in, a discreet-mode switch or a new
 * reminder time rewrite the queued schedule straight away - the stale-closure
 * bug where tonight's "Still clean?" survived a check-in came from the engine
 * being fed half its inputs.
 *
 * Also home to the games cache, the one piece of engine output the rest of the
 * app reads back (Home's play context, offline).
 */

/** A saved team for game-day mode. The existing schedule Team shape. */
export type SavedTeam = Team;

export interface TimeOfDay {
  /** 0-23, local. */
  hour: number;
  /** 0-59. */
  minute: number;
}

/** Every reminder type the user can switch off on its own. */
export interface ReminderTypes {
  /** Morning and evening rhythm (the evening close-out). */
  rhythm: boolean;
  /** Milestone eve and morning. */
  milestones: boolean;
  /** 1st and 15th payday play. */
  payday: boolean;
  /** Lights out, for users who picked the late-night trigger. */
  lateNight: boolean;
  /** Pre-game, halftime and post-game for saved teams (Premium). */
  gameDay: boolean;
  /** Comeback-week mornings after a slip. */
  comeback: boolean;
  /** Sunday recap and the weekly game-day nudge. */
  weekly: boolean;
  /** "Still past it?" after a long panic session. Opt-in. */
  followUp: boolean;
  /** Lights out on Friday and Saturday nights too (only matters with lateNight on). */
  lateNightWeekends: boolean;
}

export type ReminderType = keyof ReminderTypes;

export interface ReminderPrefs {
  morning: TimeOfDay;
  evening: TimeOfDay;
  lateNight: TimeOfDay;
  types: ReminderTypes;
}

/** A partial update: any time, and any subset of the type switches. */
export interface ReminderPrefsPatch {
  morning?: TimeOfDay;
  evening?: TimeOfDay;
  lateNight?: TimeOfDay;
  types?: Partial<ReminderTypes>;
}

export const REMINDER_TYPES: readonly ReminderType[] = [
  'rhythm',
  'milestones',
  'payday',
  'lateNight',
  'gameDay',
  'comeback',
  'weekly',
  'followUp',
  'lateNightWeekends',
];

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  morning: { hour: 9, minute: 0 },
  evening: { hour: 21, minute: 0 },
  lateNight: { hour: 22, minute: 30 },
  types: {
    rhythm: true,
    milestones: true,
    payday: true,
    lateNight: true,
    gameDay: true,
    comeback: true,
    weekly: true,
    // A push after a craving is only welcome if they asked for it.
    followUp: false,
    lateNightWeekends: true,
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function asTime(v: unknown, fallback: TimeOfDay): TimeOfDay {
  if (!isRecord(v)) return fallback;
  const { hour, minute } = v;
  return typeof hour === 'number' &&
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    typeof minute === 'number' &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 59
    ? { hour, minute }
    : fallback;
}

/**
 * Apply an update (or rebuild stored prefs) field by field. Anything malformed
 * keeps the base value, so a bad write costs that one setting, never the rest.
 */
export function mergeReminderPrefs(base: ReminderPrefs, patch: unknown): ReminderPrefs {
  if (!isRecord(patch)) return base;
  const types = { ...base.types };
  if (isRecord(patch.types)) {
    for (const t of REMINDER_TYPES) {
      const v = patch.types[t];
      if (typeof v === 'boolean') types[t] = v;
    }
  }
  return {
    morning: asTime(patch.morning, base.morning),
    evening: asTime(patch.evening, base.evening),
    lateNight: asTime(patch.lateNight, base.lateNight),
    types,
  };
}

/**
 * Everything the reminder engine needs, and nothing it may not show.
 *
 * `keptNow`, `dailyRate` and the goal target are there so the engine can work
 * out WHEN a goal checkpoint falls. They must never appear in notification
 * copy: no money on any lock screen, in any mode.
 */
export type ScheduleInput = {
  /** ISO commit time of the current run; day numbers are floored from it. */
  quitDate: string | null;
  answers: AnswerMap;
  /** Effective discreet flag: neutral copy on every lock-screen surface. */
  discreet: boolean;
  /** Game-day automation is Premium (D10). */
  isPremium: boolean;
  /** Today already has a close-out (clean, close call or a logged slip). */
  closedToday: boolean;
  /** Tonight's lights out is already done (nightsClosed includes today). */
  nightClosedToday: boolean;
  prefs: ReminderPrefs;
  teams: SavedTeam[];
  /** Highest milestone (days) already celebrated in this run. */
  lastMilestoneSeen: number;
  /** Comeback week start (the day of the slip), or null. */
  comebackStartedDay: DayKey | null;
  /** Today's play has been picked. */
  todayPlanSet: boolean;
  /** The primary goal, or null. Named in a checkpoint push only when !discreet. */
  goal: { name: string; target: number | null } | null;
  /** Estimated money kept so far, as of the moment this input was built. */
  keptNow: number;
  /** Estimated money kept per day. */
  dailyRate: number;
  /** The user picked the late-night trigger in the quiz. */
  lateNightUser: boolean;
  /** Future ISO time for the opt-in "Still past it?" push, or null. */
  urgeFollowUpAt: string | null;
  /** Cut-the-lines tasks neither done nor skipped. */
  cutLinesRemaining: number;
};

// ---------------------------------------------------------------------------
// Games cache
// ---------------------------------------------------------------------------

/** AsyncStorage key the engine writes fetched games to. */
export const GAMES_CACHE_KEY = 'winback.games';
/** More than a week of games is never needed and only grows the cache. */
const MAX_CACHED_GAMES = 60;

/**
 * A saved team's upcoming game, as persisted by the engine after a fetch so
 * Home can know "there is a game today" offline. ISO strings, not Dates, so it
 * round-trips through JSON.
 */
export interface CachedGame {
  id: string;
  league: League;
  /** ISO start time. */
  startsAt: string;
  /** ISO, when the league has a halftime. */
  estimatedHalftimeAt?: string | null;
  /** ISO, best-effort end of the game. */
  estimatedEndAt?: string | null;
  homeName: string;
  awayName: string;
}

const gameListeners = new Set<(games: CachedGame[]) => void>();

function validGame(v: unknown): v is CachedGame {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.league === 'string' &&
    typeof v.startsAt === 'string' &&
    Number.isFinite(Date.parse(v.startsAt)) &&
    typeof v.homeName === 'string' &&
    typeof v.awayName === 'string'
  );
}

/** The cached games, validated. Never throws; empty when absent or unreadable. */
export async function readCachedGames(): Promise<CachedGame[]> {
  try {
    const raw = await AsyncStorage.getItem(GAMES_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validGame).slice(0, MAX_CACHED_GAMES) : [];
  } catch {
    return [];
  }
}

/**
 * Replace the cache after a successful fetch. Called by the engine only; a
 * failed fetch must not call this, or an offline rebuild would wipe the games
 * Home is relying on.
 */
export async function writeCachedGames(games: CachedGame[]): Promise<void> {
  const clean = games.filter(validGame).slice(0, MAX_CACHED_GAMES);
  try {
    await AsyncStorage.setItem(GAMES_CACHE_KEY, JSON.stringify(clean));
  } catch {
    // A missed cache write only costs Home its game context until next time.
  }
  for (const cb of gameListeners) cb(clean);
}

/** Wipe, for account deletion and team removal. */
export async function clearCachedGames(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GAMES_CACHE_KEY);
  } catch {}
  for (const cb of gameListeners) cb([]);
}

/** Called with the new list whenever the cache is written or cleared. */
export function subscribeCachedGames(cb: (games: CachedGame[]) => void): () => void {
  gameListeners.add(cb);
  return () => {
    gameListeners.delete(cb);
  };
}
