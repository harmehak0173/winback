import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import { useNow } from '@/hooks/useNow';
import {
  clearAnalyticsQueue,
  consentKnown,
  recordConsent,
  resetAnalyticsIdentity,
  resetAnalyticsPreference,
  setSuperProps,
  track,
  whenConsented,
} from '@/lib/analytics';
import {
  addDays,
  daysBetween,
  type DayKey,
  dayKeyToDate,
  isDayKey,
  localDayKey,
  localMonthKey,
} from '@/lib/day';
import {
  checkPremium,
  forgetPurchasesIdentity,
  identifyPurchases,
  onPremiumChange,
  SIMULATED_PURCHASES,
} from '@/lib/purchases';
import { setLockEnabled } from '@/lib/applock';
import { cancelAllNotifications, refreshNotificationSchedule } from '@/lib/notifications';
import {
  addGrant,
  clearHardship,
  hardshipStatus,
  type HardshipRecord,
  type HardshipStatus,
  loadHardship,
  NO_HARDSHIP,
  saveHardship,
} from '@/lib/hardship';
import { clearPanicSession } from '@/lib/panicSession';
import type { League, Team } from '@/lib/schedule/ScheduleProvider';
import {
  type CachedGame,
  clearCachedGames,
  DEFAULT_REMINDER_PREFS,
  mergeReminderPrefs,
  readCachedGames,
  type ReminderPrefs,
  type ReminderPrefsPatch,
  type ScheduleInput,
  subscribeCachedGames,
} from '@/lib/scheduleInput';
import {
  supabase,
  ensureSession,
  fetchTrialStart,
  forgetSession,
  setSignInPending,
  syncProfile,
  syncQuizAnswers,
} from '@/lib/supabase';
import { CLOSEOUT_WINDOW_DAYS, restoreFromServer } from '@/lib/restore';
import { clearReviewState, noteSetback } from '@/lib/review';
import {
  clearTriggerLog,
  logTrigger,
  readTriggerLog,
  subscribeTriggerLog,
  topLoggedTrigger,
  type TriggerEntry,
  TRIGGER_OPTIONS,
} from '@/lib/triggers';
import { advanceProgress, todaysMove, type TodaysMove } from '@/lib/daily';
import { clearReasons, loadReasons } from '@/lib/reasons';
import { ensureFreshInstall, PARTNER_KEY } from '@/lib/secureAuthStorage';
import { pickPlays, type PlayContextInput, type TodaysPlays } from '@/lib/todaysPlay';
import { clearUrgeLog } from '@/lib/urgeLog';
import {
  clearUrgeWins,
  logUrgeWin as storeUrgeWin,
  readUrgeWins,
  subscribeUrgeWins,
  type UrgeWinSource,
  type UrgeWinStore,
} from '@/lib/urgeWins';
import { computeWeek, type CloseoutMark, type PlanOutcome, type WeekSummary } from '@/lib/weekly';
import { activeBigEvent, type ActiveBigEvent } from '@/state/bigEvents';
import { CUT_LINE_IDS, CUT_LINES, type CutLine } from '@/state/cutLines';
import { DAILY_READS } from '@/state/dailyReads';
import { milestonesThrough, nextMilestoneAfter } from '@/state/milestones';
import { type IfThenPlan, planById } from '@/state/plans';
import { type PatternId, type Rep, repForDay } from '@/state/reps';
import {
  clearTrialClock,
  loadTrialClock,
  localWeekActive,
  saveLatestSeen,
  stampFirstCommit,
  TrialClock,
  trialStatus,
  TrialStatus,
  UNKNOWN_TRIAL,
} from '@/lib/trial';
import { clearStreakWidget, updateStreakWidget } from '@/widgets/update';
import {
  AnswerMap,
  COST_SAVINGS_OR_DEBT,
  estimateMonthlySpend,
  GOAL_REVEAL,
  QUESTIONS,
  QuestionId,
  SECRECY_SOMETIMES,
  SECRECY_YES,
  SPEND_BRACKETS,
  TRIGGER_LATE_NIGHT,
} from './quiz-data';

export type AnswerValue = number | number[];
export type Answers = AnswerMap;
/** Subscription tier. Not to be confused with an if-then plan (IfThenPlan). */
export type Plan = 'yearly' | 'monthly' | 'free';
export type { CloseoutMark, DayKey, PlanOutcome, ReminderPrefs, ReminderPrefsPatch, ScheduleInput };

/** What the user reports when closing out a day. */
export type CloseoutKind = 'clean' | 'close' | 'slip';
/** 1 rough, 2 okay, 3 good. */
export type SleepRating = 1 | 2 | 3;
/** What a sign-in found: history, an empty account, or nothing readable. */
export type RestoreOutcome = 'restored' | 'empty' | 'failed';
export type GoalCheckpoint = 0 | 25 | 50 | 75 | 100;

/** A named destination for the money kept. Local only, never synced. */
export interface Goal {
  id: string;
  name: string;
  /** Dollars, or null for "no target, just a name". */
  target: number | null;
}

/** A real transfer the user says they made. Local only, never synced. */
export interface MovedEntry {
  /** ISO time it was logged. */
  at: string;
  /** Dollars, positive. */
  amount: number;
}

export interface CleanGame {
  /** Engine game id, or `manual-<day>` for the free "watched a game clean" chip. */
  gameId: string;
  day: DayKey;
  /** Skipping it counts exactly the same as watching it clean. */
  outcome: 'watched' | 'skipped';
}

/**
 * Lifetime totals that only ever go up. Kept as counters rather than derived
 * from the day records, because the records are trimmed to a window and a
 * slip can overwrite a day's mark - neither may make a lifetime number drop.
 */
export interface LifetimeTally {
  cleanDays: number;
  closeCalls: number;
  plansHeld: number;
  gamesClean: number;
  nightsClosed: number;
}

/** The wins column. Every number here only goes up; none resets on a slip. */
export interface Lifetime {
  cleanDaysLogged: number;
  closeCallsBeaten: number;
  urgesRiddenOut: number;
  linesCut: number;
  plansHeld: number;
  gamesWatchedClean: number;
  nightsClosed: number;
  repsDone: number;
}

export interface NextMilestone {
  days: number;
  title: string;
  /** Whole days from now (1 on the eve). */
  inDays: number;
}

export interface GoalProgressItem {
  goal: Goal;
  /** Estimated dollars allocated to this goal (goals fill in order). */
  amount: number;
  /** 0-1, or null when the goal has no target. */
  fraction: number | null;
  filled: boolean;
  /** Highest checkpoint crossed. */
  checkpoint: GoalCheckpoint;
}

export interface GoalProgress {
  /** Estimated money kept, lifetime (same figure as Home's counter). */
  kept: number;
  /** Sum of "I moved it" entries - real transfers, shown separately. */
  moved: number;
  /** The goals in play: all for Premium, the first only for free. */
  goals: GoalProgressItem[];
  /** A checkpoint crossed but not yet celebrated, first goal first. */
  pendingCheckpoint: { goalId: string; checkpoint: GoalCheckpoint } | null;
}

interface PersistedState {
  answers: Answers;
  /** ISO timestamp set at commitment - source of both live counters. */
  quitDate: string | null;
  plan: Plan | null;
  /** YYYY-MM-DD of the last "I stayed clean today" tap. */
  lastCheckIn: string | null;
  /**
   * Monthly figure restored from the server after signing in on a new phone,
   * so the money counter keeps the rate it had. null = use the heuristic.
   * Cleared whenever the answers change, because then the heuristic is right.
   */
  monthlySpendOverride: number | null;
  /** Accountability partner, reachable in one tap from the panic screen. */
  partner: { name: string; phone: string } | null;
  /** Saved teams for game-day mode (pre-game check-in notifications). */
  teams: Team[];
  /** ISO timestamps of slips absorbed by a streak freeze (streak preserved). */
  slips: string[];
  /** Longest clean streak ever reached, in days (for the relapse flow). */
  bestStreakDays: number;
  /**
   * Money kept during streaks that have already ended, in dollars.
   *
   * The counter used to be derived purely from the current quit date, so a
   * relapse zeroed it: someone 60 days clean watched "$1,708 won back" drop to
   * $0.00 over one slip. Those days did not un-happen. Worse, that is a
   * designed abstinence-violation trigger - the all-or-nothing belief that one
   * slip has erased everything is the single biggest predictor of a slip
   * becoming a full relapse, and the app was staging it as a feature.
   *
   * The streak still resets, because that is what a streak means. The money
   * does not, because it is a fact about the past rather than a status.
   */
  moneyKeptBefore: number;
  /** The end-of-trial paywall has been shown once. Prompt, not nag. */
  trialPromptShown: boolean;
  /** Daily reads completed, ever. Its own counter: a relapse resets the
   *  streak, never the curriculum. */
  dailyIndex: number;
  /** Local day key of the most recent daily read, for the one-per-day rule. */
  dailyLastReadDay: string | null;
  /**
   * Explicit user choice for discreet notification copy. null = infer from the
   * quiz. An inferred flag was fine while the quiz answer was always present,
   * but `secrecy` is no longer uploaded, so a restored account cannot infer it
   * - and the wrong guess puts "Still clean?" on the lock screen of someone
   * hiding their betting. An explicit switch is also simply better: people can
   * change their minds without redoing the quiz.
   */
  discreetOverride: boolean | null;
  /** Highest milestone (in days) already celebrated, so it fires once. */
  lastMilestoneSeen: number;
  /**
   * Cache of the server-stamped trial start. The server is still the source of
   * truth and overwrites this on every successful read; this exists so the free
   * week survives a launch with no network. Without it the app is offline-first
   * everywhere except the one thing every new user is relying on.
   */
  trialStartedAt: string | null;
  /**
   * The commit has not reached the server yet. The profile and quiz upload at
   * commit used to be fire-and-forget: a commit made offline, during a sign-in
   * backoff or on a timeout never arrived at all - no quit date, no spend, no
   * free-week stamp at commit time, nothing to restore by email. It is now
   * retried on every foreground until the server takes it.
   */
  profileSyncPending: boolean;

  // --- Close the day (hook 2) -------------------------------------------
  /**
   * One mark per local day: 0 clean, 1 close call beaten, 2 slip. Blank days
   * have no key and are never "missed". Kept for CLOSEOUT_WINDOW_DAYS; the
   * lifetime totals live in `tally` so trimming never lowers them.
   * `lastCheckIn` is kept in step: the most recent clean or close-call day.
   */
  closeouts: Record<DayKey, CloseoutMark>;
  /** Lifetime counters that only go up. */
  tally: LifetimeTally;

  // --- Reminders (hook 1) -----------------------------------------------
  reminderPrefs: ReminderPrefs;
  /** The reminders priming screen has been shown (it asks for permission). */
  remindersPrimed: boolean;

  // --- Cut the lines (hook 6) -------------------------------------------
  cutLinesDone: string[];
  cutLinesSkipped: string[];
  /** Day a task was last marked, for "one a day" on Home. */
  cutLinesLastDay: DayKey | null;

  // --- Today's play (hook 5) --------------------------------------------
  todayPlan: { day: DayKey; planId: string } | null;
  /** 0 held, 1 didn't come up, 2 not today. None of them is a failure. */
  planOutcomes: Record<DayKey, PlanOutcome>;

  // --- Goal jar (hook 9). Local only, never synced. ---------------------
  goals: Goal[];
  /** Highest checkpoint already celebrated, per goal id. */
  goalCheckpointsSeen: Record<string, GoalCheckpoint>;
  moved: MovedEntry[];

  // --- Comeback week (hook 12) ------------------------------------------
  /** The day comeback week started (the day of the slip), or null. */
  comebackStartedDay: DayKey | null;
  /** Comeback days whose item was completed. */
  comebackDone: DayKey[];

  // --- Lights out (hook 11). Local only, never synced. ------------------
  nightsClosed: DayKey[];
  /** Keyed by the night's day key: how that night's sleep went. */
  sleep: Record<DayKey, SleepRating>;

  // --- Daily reps (hook 14) ---------------------------------------------
  repsDone: number;
  lastRepDay: DayKey | null;
  /** The breathing pattern the panic screen opens on ("Your go-to"). */
  favouritePattern: PatternId | null;

  // --- Watched it clean (hook 10) ---------------------------------------
  cleanGames: CleanGame[];

  // --- Urge follow-up (hook 7) ------------------------------------------
  /** Opt-in "Still past it?" push time (ISO), or null. */
  urgeFollowUpAt: string | null;
}

interface AppState extends PersistedState {
  /** Hydration finished - safe to route. */
  ready: boolean;
  /**
   * Saved state could not be READ (a storage error, not an empty store).
   * `ready` stays false, so nothing acts on defaults; the entry gate shows a
   * retry screen instead of onboarding.
   */
  loadFailed: boolean;
  /** Try reading saved state again after `loadFailed`. */
  retryLoad: () => void;
  setAnswer: (id: QuestionId, value: AnswerValue) => void;
  /** Sets quit date to now, persists everything, syncs to Supabase. */
  commit: () => void;
  choosePlan: (plan: Plan) => void;
  /** Close today out clean. Thin wrapper over closeDay('clean'). */
  checkInToday: () => void;
  /** Relapse reset, no shame: quit date restarts now; answers are kept. */
  resetStreak: () => void;
  /** Absorb a slip with a streak freeze: streak is preserved, slip is logged. */
  freezeStreak: () => void;
  /** Clears answers + quit date so onboarding runs again from the top. */
  restartOnboarding: () => void;
  /** Full local wipe (account deletion): every field, SecureStore, schedules. */
  eraseAllLocalData: () => void;
  /** Resolves false when this phone's secure storage did not keep it. */
  setPartner: (partner: { name: string; phone: string } | null) => Promise<boolean>;
  setTeams: (teams: Team[]) => void;
  // Derived
  monthlySpend: number;
  dailyRate: number;
  yearlyLoss: number;
  spendIndex: number;
  goalIndex: number;
  /** Q7 includes "Savings or debt" AND Q8 = Yes. Drives the safety screen and
   *  app-lock copy. Never surfaced to the user as a label. */
  hideFlag: boolean;
  sportsLabels: string[];
  costLabels: string[];
  triggerLabels: string[];
  /** A streak freeze is available this calendar month (one per month, free). */
  freezeAvailable: boolean;
  /** Current clean-streak length in days (floor of elapsed since quit date). */
  currentStreakDays: number;
  /**
   * Whether paid features are unlocked: a live store-verified subscription, an
   * active free week of Premium, or a month on us. Never read the persisted
   * `plan` field for gating - it lives in AsyncStorage and a rooted device can
   * edit it.
   */
  isPremium: boolean;
  /** Re-check entitlement with the store (after a purchase or restore). */
  refreshPremium: () => void;
  /**
   * A real, store-verified paid subscription - distinct from `isPremium`,
   * which is also true during the free week. UI that says anything about
   * billing must use this, or a trial user gets told they are subscribed.
   */
  subscribed: boolean;
  /**
   * The store has answered at least once this launch. Until then `subscribed`
   * is only a default, so nothing that tells a user they are NOT subscribed
   * (the ended-week banner) should show.
   */
  storeChecked: boolean;
  /** Server-clocked free-week state. */
  trial: TrialStatus;
  /** True once the free week has ended and no subscription replaced it. */
  trialExpired: boolean;
  /**
   * Premium is being granted on trust because the server clock could not be
   * read. Bounded: at most the promised week from this device's first commit.
   */
  trialUnverified: boolean;
  /** The free week has already started for this device or account. */
  freeWeekStarted: boolean;
  /** Record that the end-of-free-week paywall has been shown. */
  markTrialPromptShown: () => void;
  /** Free week running (server-clocked, or unverified on trust). */
  inFreeWeek: boolean;
  /** "Premium is too much right now": a month of Premium on us (lib/hardship). */
  hardship: HardshipStatus;
  /**
   * The offer is open: the store has answered and says not subscribed, not in
   * the free week, no month running. The link shows then, even with none
   * left, so the screen can say so.
   */
  hardshipOffered: boolean;
  /** Start a month on us. False (and nothing changes) when one cannot start. */
  startHardship: () => boolean;
  /** Home's one quiet "your 30 days on us ended" note is showing. */
  hardshipNote: boolean;
  dismissHardshipNote: () => void;
  /** Record that a milestone celebration has been shown. */
  markMilestoneSeen: (days: number) => void;
  /** Complete today's daily read. Idempotent within a local day. */
  markDailyRead: () => void;
  /** Whether notification copy should avoid naming betting or recovery. */
  discreetNotifications: boolean;
  setDiscreetNotifications: (on: boolean) => void;
  /**
   * Pull this account's history down after signing in. Pass the user id the
   * device had BEFORE the sign-in so an identity change can be detected.
   * 'failed' means the account could not be read: nothing on this phone has
   * changed or been sent to it, and the caller retries or calls
   * abandonSignIn.
   */
  restoreAccount: (previousUserId?: string | null) => Promise<RestoreOutcome>;
  /**
   * Back out of a sign-in whose account could not be read: this phone signs
   * out of it (only this phone) and carries on as before, under a fresh
   * anonymous account.
   */
  abandonSignIn: () => Promise<void>;

  // --- Wave B actions ---------------------------------------------------
  /**
   * Close out today. 'clean' and 'close' are the check-in (close also logs
   * an urge ridden out, source 'closeout'); `triggers` are TRIGGER_OPTIONS
   * indexes logged as urge tags. 'slip' records nothing here - the UI sends
   * the user to /slip, where freezeStreak/resetStreak mark the day.
   * A day already marked as a slip is never overwritten.
   * `day` closes that day instead of today; only today or yesterday are
   * accepted (see closeoutDay: before 4am the close-out is still last night's).
   */
  closeDay: (kind: CloseoutKind, opts?: { triggers?: number[]; day?: DayKey }) => void;
  /** Log an urge ridden out (panic "I'm past it", Home quick log). */
  logUrgeWin: (source: UrgeWinSource, startedAt?: string) => void;
  setReminderPrefs: (patch: ReminderPrefsPatch) => void;
  /** The priming screen was shown. Also rebuilds the schedule, since permission may just have changed. */
  markPrimed: () => void;
  /** Rebuild the reminder schedule now (e.g. after the OS permission changed). */
  refreshReminders: () => void;
  setLineCut: (id: string, status: 'done' | 'skip' | null) => void;
  /** Pin one of today's plans for today. */
  pickPlan: (planId: string) => void;
  /** Answer "Did the play hold?" for a day within the last week. */
  setPlanOutcome: (day: DayKey, outcome: PlanOutcome) => void;
  /** Add or update a goal. Free users have one goal: a new one replaces it. */
  setGoal: (goal: { id?: string; name: string; target: number | null }) => void;
  removeGoal: (id: string) => void;
  markGoalCheckpointSeen: (goalId: string, checkpoint: GoalCheckpoint) => void;
  /** Log a real transfer the user made. Never synced, never tracked with the amount. */
  logMoved: (amount: number) => void;
  /** Start comeback week today (after a slip). */
  startComeback: () => void;
  /** Mark a comeback day's item done. */
  markComebackDay: (day: DayKey) => void;
  /**
   * Lights out: records the night and closes the day clean if it is still
   * open (before 4am this counts as the previous night). `sleep` rates the
   * PREVIOUS night.
   */
  closeNight: (opts?: { sleep?: SleepRating }) => void;
  /** Rate how a night's sleep went (keyed by that night's day). */
  rateSleep: (night: DayKey, rating: SleepRating) => void;
  /** A daily rep was completed. A breathing rep's pattern becomes the go-to if none is set. */
  logRep: (patternId?: PatternId | null, repId?: string) => void;
  setFavouritePattern: (id: PatternId | null) => void;
  /**
   * "Watched it clean" / "Skipped it". gameId null = the manual chip for the
   * day (today, or `day` when it is yesterday - see closeoutDay).
   */
  logCleanGame: (gameId: string | null, outcome: 'watched' | 'skipped', day?: DayKey) => void;
  /** Opt-in follow-up push time (future ISO) or null to cancel. */
  setUrgeFollowUp: (at: string | null) => void;

  // --- Wave B derived ---------------------------------------------------
  /** Local day key, refreshed every minute. */
  todayKey: DayKey;
  /** Today has a close-out mark (clean, close call or slip). */
  closedToday: boolean;
  /** Today's close-out mark, or null. */
  todayMark: CloseoutMark | null;
  lifetime: Lifetime;
  /** Next milestone in this run, or null before commit. */
  nextMilestone: NextMilestone | null;
  week: WeekSummary;
  todaysMove: TodaysMove | null;
  /** Automatic context: saved teams' games count only for Premium. */
  todaysPlays: TodaysPlays;
  /** The input behind todaysPlays, for a manual "game today" re-pick on /plan. */
  playContext: PlayContextInput;
  /** Today's pinned plan, or null. */
  todayPlanItem: IfThenPlan | null;
  /** 1-7 during comeback week (day N = N calendar days after the start); null otherwise, including the start day itself. */
  comebackDay: number | null;
  goalProgress: GoalProgress;
  /** Goal name suggested from the quiz goal answer. */
  suggestedGoalName: string;
  /** Estimated money kept, lifetime, to the minute. */
  keptNow: number;
  /** First Cut-the-lines task neither done nor skipped, or null when all are. */
  nextCutLine: CutLine | null;
  cutLinesRemaining: number;
  /** A task was marked today (Home shows "next one tomorrow"). */
  cutLineMarkedToday: boolean;
  todaysRep: Rep;
  repDoneToday: boolean;
  /** Relevant big-event window today, or null. */
  bigEvent: ActiveBigEvent | null;
  /** The last three rated nights were all rough: point to a doctor or helpline. */
  sleepConcern: boolean;
  /** What the reminder engine is fed. Rebuilt whenever any field changes. */
  scheduleInput: ScheduleInput;
}

const STORAGE_KEY = 'winback:v1';
/** Waits before each attempt to read saved state at launch. */
const LOAD_RETRY_MS = [0, 300, 1000];

type Partner = { name: string; phone: string } | null;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function asPartner(v: unknown): Partner {
  return isRecord(v) && typeof v.name === 'string' && typeof v.phone === 'string'
    ? { name: v.name, phone: v.phone }
    : null;
}

/**
 * The accountability partner is third-party PII (someone else's name and
 * phone number), so it lives in the OS keychain/keystore via SecureStore,
 * not in AsyncStorage with the rest of the state. Web has no SecureStore -
 * the web build is a dev/testing artifact, so partner simply stays unset.
 *
 * The keychain survives an uninstall on iOS, so this waits for the
 * fresh-install wipe first; otherwise a reinstall could read the previous
 * user's partner before the wipe got to it.
 */
async function loadStoredPartner(): Promise<Partner> {
  if (Platform.OS === 'web') return null;
  try {
    await ensureFreshInstall();
    const raw = await SecureStore.getItemAsync(PARTNER_KEY);
    return raw ? asPartner(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Resolves false when the keychain/keystore did not take the write. */
async function storePartner(partner: Partner): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    if (partner) await SecureStore.setItemAsync(PARTNER_KEY, JSON.stringify(partner));
    else await SecureStore.deleteItemAsync(PARTNER_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Most goals a Premium user can keep. Free keeps one. */
const MAX_GOALS = 5;
/**
 * Teams saved for game-day check-ins. Each costs one schedule request per
 * rebuild, and every other list here has a cap; this one had none.
 */
export const MAX_TEAMS = 8;
const MAX_CLEAN_GAMES = 500;
const MAX_MOVED = 500;
/** Largest dollar figure accepted for a goal target or a transfer. */
const MAX_DOLLARS = 100_000_000;
const NO_TALLY: LifetimeTally = { cleanDays: 0, closeCalls: 0, plansHeld: 0, gamesClean: 0, nightsClosed: 0 };
const PATTERN_IDS: readonly PatternId[] = ['calm', '478', 'box'];

/** Day keys the device keeps records for: the window, plus a day of clock/travel slack. */
function inWindow(key: DayKey, today: DayKey): boolean {
  return key >= addDays(today, -(CLOSEOUT_WINDOW_DAYS - 1)) && key <= addDays(today, 1);
}

/** Keep only keys inside the window. */
function trimDays<T>(rec: Record<DayKey, T>, today: DayKey): Record<DayKey, T> {
  const out: Record<DayKey, T> = {};
  for (const [k, v] of Object.entries(rec)) if (inWindow(k, today)) out[k] = v;
  return out;
}

/** The most recent day with any mark (0, 1 or 2), or null. */
function latestDay(closeouts: Record<DayKey, CloseoutMark>): DayKey | null {
  let best: DayKey | null = null;
  for (const k of Object.keys(closeouts)) if (best == null || k > best) best = k;
  return best;
}

/** Most recent clean or close-call day, or null. */
function lastCleanDay(closeouts: Record<DayKey, CloseoutMark>): DayKey | null {
  let best: DayKey | null = null;
  for (const [k, v] of Object.entries(closeouts)) if (v !== 2 && (best == null || k > best)) best = k;
  return best;
}

/**
 * Write one day's mark. Pure. A slip day is never overwritten by a later
 * clean mark (the calendar stays honest), a close call is never downgraded to
 * plain clean, and the lifetime counters only ever go up: a day counts once
 * the first time it is closed, and a slip later that day does not un-count it.
 */
function applyCloseout(s: PersistedState, day: DayKey, mark: CloseoutMark): PersistedState {
  const prev = s.closeouts[day];
  if (prev === 2) return s;
  const next: CloseoutMark = mark === 0 && prev === 1 ? 1 : mark;
  if (prev === next) return s;
  const closeouts = trimDays({ ...s.closeouts, [day]: next }, localDayKey());
  const tally = { ...s.tally };
  if (next !== 2) {
    if (prev === undefined) tally.cleanDays += 1;
    if (next === 1) tally.closeCalls += 1;
  }
  return { ...s, closeouts, tally, lastCheckIn: lastCleanDay(closeouts) };
}

/** Goals fill in order from the estimated money kept. */
function allocateGoals(goals: Goal[], kept: number): GoalProgressItem[] {
  let left = Math.max(0, kept);
  return goals.map((goal) => {
    if (goal.target == null || goal.target <= 0) {
      return { goal, amount: 0, fraction: null, filled: false, checkpoint: 0 };
    }
    const amount = Math.min(goal.target, left);
    left -= amount;
    const fraction = amount / goal.target;
    const checkpoint: GoalCheckpoint =
      fraction >= 1 ? 100 : fraction >= 0.75 ? 75 : fraction >= 0.5 ? 50 : fraction >= 0.25 ? 25 : 0;
    return { goal, amount, fraction, filled: fraction >= 1, checkpoint };
  });
}

/**
 * The day a close-out (or a lights out) opened at `now` is about.
 * before 4am it is still last night, so the evening push (which can be set as
 * late as 23:30) or a post-game push tapped after midnight closes the day it
 * was about, instead of marking the day that has only just begun as clean -
 * which also silenced that new day's own close-out push. Never a day before
 * the current run started (a commit made after midnight closes today).
 */
export function closeoutDay(now: Date, quitDate: string | null): DayKey {
  const today = localDayKey(now);
  if (now.getHours() >= 4) return today;
  const yesterday = addDays(today, -1);
  const start = quitDate ? Date.parse(quitDate) : NaN;
  if (!Number.isFinite(start) || localDayKey(new Date(start)) > yesterday) return today;
  return yesterday;
}

/** A day a close-out may still mark: today, or yesterday. */
function closableDay(day: DayKey | undefined, today: DayKey): DayKey {
  return day && isDayKey(day) && (day === today || day === addDays(today, -1)) ? day : today;
}

/** The check_ins mirror: clean and close-call days only, same row shape as always. */
async function uploadCheckIns(days: DayKey[]): Promise<boolean> {
  const sb = supabase;
  if (!sb || !days.length) return false;
  try {
    const userId = await ensureSession();
    if (!userId) return false;
    const { error } = await sb
      .from('check_ins')
      .upsert(days.map((day) => ({ user_id: userId, day })));
    return !error;
  } catch {
    return false;
  }
}

/** A slip logged on a day already mirrored as clean: take the clean row back. */
async function removeCheckIn(day: DayKey): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  try {
    const userId = await ensureSession();
    if (userId) await sb.from('check_ins').delete().eq('user_id', userId).eq('day', day);
  } catch {
    // Offline: the row stays until the next restore reads it as clean. Rare,
    // and the device's own record (the slip mark) is what the calendar shows.
  }
}

const initial: PersistedState = {
  answers: {},
  quitDate: null,
  plan: null,
  lastCheckIn: null,
  monthlySpendOverride: null,
  partner: null,
  teams: [],
  slips: [],
  bestStreakDays: 0,
  moneyKeptBefore: 0,
  trialPromptShown: false,
  dailyIndex: 0,
  dailyLastReadDay: null,
  trialStartedAt: null,
  discreetOverride: null,
  lastMilestoneSeen: 0,
  profileSyncPending: false,
  closeouts: {},
  tally: NO_TALLY,
  reminderPrefs: DEFAULT_REMINDER_PREFS,
  remindersPrimed: false,
  cutLinesDone: [],
  cutLinesSkipped: [],
  cutLinesLastDay: null,
  todayPlan: null,
  planOutcomes: {},
  goals: [],
  goalCheckpointsSeen: {},
  moved: [],
  comebackStartedDay: null,
  comebackDone: [],
  nightsClosed: [],
  sleep: {},
  repsDone: 0,
  lastRepDay: null,
  favouritePattern: null,
  cleanGames: [],
  urgeFollowUpAt: null,
};

const DAY = 86_400_000;
const streakDaysOf = (quitDate: string | null): number =>
  quitDate ? Math.floor(Math.max(0, Date.now() - new Date(quitDate).getTime()) / DAY) : 0;

/** How often the "latest time seen" is written back (it guards clock rollback). */
const CLOCK_SAVE_MS = 5 * 60_000;
/** Settle time before a reminder rebuild, so a burst of changes rebuilds once. */
const SCHEDULE_DEBOUNCE_MS = 500;
/**
 * Every plan value hydration accepts. Anything else, including 'weekly' from a
 * build that still sold a weekly tier, comes back as no plan on record: the
 * label is cosmetic, and Premium itself is always read from the store.
 */
const PLANS: readonly Plan[] = ['yearly', 'monthly', 'free'];

/**
 * Rebuild persisted state from whatever storage handed back, field by field.
 *
 * Nothing from AsyncStorage is trusted. The old hydration spread the stored
 * object over the defaults and coerced three numbers; a null `slips` then
 * threw at `slips.filter` during render, on every launch, above the error
 * boundary's reach - one bad value and the app never opened again. Each field
 * now falls back to its default on its own, so a bad value costs that value,
 * not the app. Unknown keys (such as the removed AI estimate) are dropped.
 */
function sanitizeStored(raw: unknown): PersistedState {
  if (!isRecord(raw)) return initial;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
  const iso = (v: unknown): string | null =>
    typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
  const dayKey = (v: unknown): string | null => (isDayKey(v) ? v : null);
  const today = localDayKey();
  const count = (v: unknown) => Math.min(1_000_000, Math.trunc(num(v, 0)));
  // A day-keyed record inside the window, each value checked by `pick`.
  const dayRecord = <T,>(v: unknown, pick: (x: unknown) => T | null): Record<DayKey, T> => {
    const out: Record<DayKey, T> = {};
    if (!isRecord(v)) return out;
    for (const [k, x] of Object.entries(v)) {
      const val = pick(x);
      if (val != null && isDayKey(k) && inWindow(k, today)) out[k] = val;
    }
    return out;
  };
  const dayList = (v: unknown, max: number): DayKey[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((k): k is DayKey => isDayKey(k) && inWindow(k, today)))].sort().slice(-max)
      : [];
  const dollars = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_DOLLARS ? v : null;
  const index = (v: unknown, max: number): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max ? v : null;

  const answers: Answers = {};
  if (isRecord(raw.answers)) {
    for (const q of QUESTIONS) {
      const v = raw.answers[q.id];
      if (q.multi) {
        if (!Array.isArray(v)) continue;
        answers[q.id] = v
          .map((i) => index(i, q.options.length))
          .filter((i): i is number => i != null);
      } else {
        const i = index(v, q.options.length);
        if (i != null) answers[q.id] = i;
      }
    }
  }

  const teams = Array.isArray(raw.teams)
    ? raw.teams.filter(
        (t): t is Team =>
          isRecord(t) &&
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          typeof t.league === 'string',
      )
        .slice(0, MAX_TEAMS)
    : [];
  const override = num(raw.monthlySpendOverride, 0);
  const lastCheckInRaw = dayKey(raw.lastCheckIn);

  // Close-outs. Builds from before them kept only lastCheckIn: that day
  // becomes the first mark, so the calendar starts with what they did.
  const closeouts = dayRecord<CloseoutMark>(raw.closeouts, (x) =>
    x === 0 || x === 1 || x === 2 ? x : null,
  );
  if (lastCheckInRaw && closeouts[lastCheckInRaw] == null && inWindow(lastCheckInRaw, today)) {
    closeouts[lastCheckInRaw] = 0;
  }
  const planOutcomes = dayRecord<PlanOutcome>(raw.planOutcomes, (x) =>
    x === 0 || x === 1 || x === 2 ? x : null,
  );
  const sleep = dayRecord<SleepRating>(raw.sleep, (x) => (x === 1 || x === 2 || x === 3 ? x : null));
  const nightsClosed = dayList(raw.nightsClosed, CLOSEOUT_WINDOW_DAYS);

  const seenGames = new Set<string>();
  const cleanGames: CleanGame[] = (Array.isArray(raw.cleanGames) ? raw.cleanGames : [])
    .filter(
      (g): g is CleanGame =>
        isRecord(g) &&
        typeof g.gameId === 'string' &&
        g.gameId.length > 0 &&
        g.gameId.length <= 128 &&
        isDayKey(g.day) &&
        (g.outcome === 'watched' || g.outcome === 'skipped'),
    )
    .map((g) => ({ gameId: g.gameId, day: g.day, outcome: g.outcome }))
    .reverse()
    .filter((g) => (seenGames.has(g.gameId) ? false : (seenGames.add(g.gameId), true)))
    .reverse()
    .slice(-MAX_CLEAN_GAMES);

  const goalIds = new Set<string>();
  const goals: Goal[] = [];
  for (const g of Array.isArray(raw.goals) ? raw.goals : []) {
    if (!isRecord(g) || typeof g.id !== 'string' || !g.id || g.id.length > 64 || goalIds.has(g.id)) continue;
    const name = typeof g.name === 'string' ? g.name.trim().slice(0, 60) : '';
    if (!name) continue;
    goalIds.add(g.id);
    goals.push({ id: g.id, name, target: dollars(g.target) });
    if (goals.length >= MAX_GOALS) break;
  }
  const goalCheckpointsSeen: Record<string, GoalCheckpoint> = {};
  if (isRecord(raw.goalCheckpointsSeen)) {
    for (const [id, v] of Object.entries(raw.goalCheckpointsSeen)) {
      if (goalIds.has(id) && (v === 0 || v === 25 || v === 50 || v === 75 || v === 100)) {
        goalCheckpointsSeen[id] = v;
      }
    }
  }
  const moved: MovedEntry[] = (Array.isArray(raw.moved) ? raw.moved : [])
    .filter((m): m is MovedEntry => isRecord(m) && iso(m.at) != null && dollars(m.amount) != null)
    .map((m) => ({ at: m.at, amount: m.amount }))
    .slice(-MAX_MOVED);

  const cutIds = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && CUT_LINE_IDS.has(x)))] : [];
  const cutLinesDone = cutIds(raw.cutLinesDone);
  const cutLinesSkipped = cutIds(raw.cutLinesSkipped).filter((id) => !cutLinesDone.includes(id));

  const tp = raw.todayPlan;
  const todayPlan =
    isRecord(tp) && isDayKey(tp.day) && typeof tp.planId === 'string' && planById(tp.planId)
      ? { day: tp.day, planId: tp.planId }
      : null;

  const comebackStartedDay = dayKey(raw.comebackStartedDay);
  const comebackDone = comebackStartedDay
    ? dayList(raw.comebackDone, 14).filter((k) => k >= comebackStartedDay)
    : [];

  // Lifetime counters: never below what the records themselves show, which
  // also seeds them for installs from before the counters existed.
  const t = isRecord(raw.tally) ? raw.tally : {};
  const marks = Object.values(closeouts);
  const tally: LifetimeTally = {
    cleanDays: Math.max(count(t.cleanDays), marks.filter((m) => m !== 2).length),
    closeCalls: Math.max(count(t.closeCalls), marks.filter((m) => m === 1).length),
    plansHeld: Math.max(count(t.plansHeld), Object.values(planOutcomes).filter((o) => o === 0).length),
    gamesClean: Math.max(count(t.gamesClean), cleanGames.length),
    nightsClosed: Math.max(count(t.nightsClosed), nightsClosed.length),
  };

  const quitDate = iso(raw.quitDate);

  return {
    answers,
    quitDate,
    plan: PLANS.includes(raw.plan as Plan) ? (raw.plan as Plan) : null,
    // Kept in step with the close-outs: the most recent clean or close day.
    lastCheckIn: lastCleanDay(closeouts),
    monthlySpendOverride: override > 0 ? override : null,
    // Legacy only: older builds kept the partner here. Migrated on hydration.
    partner: asPartner(raw.partner),
    teams,
    slips: Array.isArray(raw.slips) ? raw.slips.filter((x): x is string => iso(x) != null) : [],
    bestStreakDays: Math.trunc(num(raw.bestStreakDays, 0)),
    moneyKeptBefore: num(raw.moneyKeptBefore, 0),
    trialPromptShown: raw.trialPromptShown === true,
    dailyIndex: Math.trunc(num(raw.dailyIndex, 0)),
    dailyLastReadDay: dayKey(raw.dailyLastReadDay),
    discreetOverride: typeof raw.discreetOverride === 'boolean' ? raw.discreetOverride : null,
    lastMilestoneSeen: Math.trunc(num(raw.lastMilestoneSeen, 0)),
    trialStartedAt: iso(raw.trialStartedAt),
    profileSyncPending: raw.profileSyncPending === true,
    closeouts,
    tally,
    reminderPrefs: mergeReminderPrefs(DEFAULT_REMINDER_PREFS, raw.reminderPrefs),
    // Anyone committed before the priming screen existed was asked for
    // permission at commit already; do not put them through it again.
    remindersPrimed:
      typeof raw.remindersPrimed === 'boolean' ? raw.remindersPrimed : quitDate != null,
    cutLinesDone,
    cutLinesSkipped,
    cutLinesLastDay: dayKey(raw.cutLinesLastDay),
    todayPlan,
    planOutcomes,
    goals,
    goalCheckpointsSeen,
    moved,
    comebackStartedDay,
    comebackDone,
    nightsClosed,
    sleep,
    repsDone: count(raw.repsDone),
    lastRepDay: dayKey(raw.lastRepDay),
    favouritePattern: PATTERN_IDS.includes(raw.favouritePattern as PatternId)
      ? (raw.favouritePattern as PatternId)
      : null,
    cleanGames,
    urgeFollowUpAt: iso(raw.urgeFollowUpAt),
  };
}

/** Coarse days-clean bucket for analytics. Never the exact count. */
function daysBucket(quitDate: string | null, days: number): string {
  if (!quitDate) return 'none';
  if (days <= 7) return '0-7';
  if (days <= 30) return '8-30';
  if (days <= 90) return '31-90';
  return '90+';
}

const Ctx = createContext<AppState | null>(null);

function labelsFor(id: QuestionId, value: AnswerValue | undefined): string[] {
  const q = QUESTIONS.find((x) => x.id === id)!;
  if (value == null) return [];
  const idxs = Array.isArray(value) ? value : [value];
  return idxs.map((i) => q.options[i]).filter(Boolean);
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(initial);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [storeSubscribed, setStoreSubscribed] = useState(false);
  // The store has answered at least once this launch. Until then "not
  // subscribed" is only a default, and a paying user must not be told their
  // free week has ended while RevenueCat is still starting up.
  const [storeChecked, setStoreChecked] = useState(false);
  const [clock, setClock] = useState<TrialClock>({ firstCommitAt: null, latestSeen: 0 });
  // Months on us (device-only). The ref is the copy actions read and write,
  // so a double tap cannot start two months before a render lands.
  const [hardshipRecord, setHardshipRecordState] = useState<HardshipRecord>(NO_HARDSHIP);
  const hardshipRef = useRef<HardshipRecord>(NO_HARDSHIP);
  const setHardshipRecord = useCallback((next: HardshipRecord) => {
    hardshipRef.current = next;
    setHardshipRecordState(next);
  }, []);
  // The server has confirmed the free-week start during this launch. Until it
  // has, `trialStartedAt` is only a cached copy from AsyncStorage, which can be
  // edited, so it is not allowed to outlast the locally measured week.
  const [trialConfirmed, setTrialConfirmed] = useState(false);
  // Bumped on every foreground, so a pending commit upload is retried.
  const [syncNonce, setSyncNonce] = useState(0);
  // Bumped to force a reminder rebuild (priming, a permission change).
  const [scheduleNonce, setScheduleNonce] = useState(0);
  // Local stores that live outside the persisted blob (each has its own
  // AsyncStorage key and cap), mirrored here so the lifetime counts, the week
  // and today's plays stay live whoever writes to them.
  const [urgeWins, setUrgeWins] = useState<UrgeWinStore>({ total: 0, wins: [] });
  const [triggerLog, setTriggerLog] = useState<TriggerEntry[]>([]);
  const [cachedGames, setCachedGames] = useState<CachedGame[]>([]);
  // Close-out days already mirrored to check_ins during this process.
  const syncedDays = useRef(new Set<DayKey>());
  // Which commit a pending upload belongs to: a success from an older commit
  // (or an older identity) must not clear the flag for a newer one.
  const commitGen = useRef(0);
  // On while a signed-in account is being read: nothing on this phone is
  // uploaded into an account whose history we do not know yet.
  const restoreHold = useRef(false);
  // A partner from an older build whose move to SecureStore failed.
  const legacyPartner = useRef<Partner>(null);
  const hydrated = useRef(false);
  // Streak length and the monthly freeze allowance are time-derived, so they
  // have to be recomputed as time passes - not only when state changes, or
  // they stay frozen at whatever they were when quitDate/slips last changed.
  const minuteTick = useNow(60_000);
  // Never earlier than a time this device has already seen: winding the
  // phone's clock back must not wind the free week back with it.
  const effectiveNow = Math.max(minuteTick, clock.latestSeen);

  const refreshPremium = useCallback(() => {
    // Neither the store nor our server is asked anything before the user has
    // agreed on Welcome: no account and no store customer exist until then,
    // and nothing that early can need Premium anyway.
    void consentKnown().then((ok) => {
      if (!ok) return;
      // Retry a commit upload that has not reached the server yet.
      setSyncNonce((n) => n + 1);
      void checkPremium().then((active) => {
        // null = the store did not answer. Keep what we last knew rather than
        // demoting a subscriber over a timeout - and do not count it as an
        // answer, or a paying user whose check timed out would be told their
        // free week has ended.
        if (active == null) return;
        setStoreSubscribed(active);
        setStoreChecked(true);
      });
      void fetchTrialStart().then((iso) => {
        // Never clear a known start on a failed read: a flaky network must not
        // look like an expired week. The server value always wins when present.
        if (!iso) return;
        setTrialConfirmed(true);
        setState((st) => (st.trialStartedAt === iso ? st : { ...st, trialStartedAt: iso }));
      });
    });
  }, []);

  // Check entitlement at startup and every time the app returns to the
  // foreground, so a subscription bought, lapsed, or refunded elsewhere - and
  // the free week ticking over - are reflected without a restart.
  useEffect(() => {
    refreshPremium();
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') refreshPremium();
    });
    return () => sub.remove();
  }, [refreshPremium]);

  // Renewals, lapses, Ask to Buy approvals and pending Play purchases that
  // complete while the app is open apply straight away, not on the next
  // foreground.
  // Registered only after consent: registering configures the store SDK, and
  // that talks to RevenueCat.
  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    void whenConsented().then(() => {
      if (!alive) return;
      unsubscribe = onPremiumChange((active) => {
        setStoreSubscribed(active);
        setStoreChecked(true);
      });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Record the latest time seen: on launch, every few minutes, and whenever
  // the app goes to the background (the last moment we are sure to run).
  useEffect(() => {
    if (!ready) return;
    const note = () => {
      const now = Date.now();
      setClock((c) => {
        if (now <= c.latestSeen) return c;
        void saveLatestSeen(now);
        return { ...c, latestSeen: now };
      });
    };
    note();
    const id = setInterval(note, CLOCK_SAVE_MS);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') note();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [ready]);

  const localWeekRunning = localWeekActive(clock.firstCommitAt, effectiveNow);

  const trial = useMemo(() => {
    if (!state.trialStartedAt) return UNKNOWN_TRIAL;
    const status = trialStatus(state.trialStartedAt, effectiveNow);
    if (!status.known || trialConfirmed) return status;
    // Only the cached copy so far. A start in the future is not a start: the
    // server stamps it, so it can run ahead of this device's clock by skew,
    // never by a day. Treat it as unknown (the bounded local week then
    // applies) rather than as a week that never ends.
    if (Date.parse(state.trialStartedAt) - effectiveNow > DAY) return UNKNOWN_TRIAL;
    // And a cached value may not keep Premium on past the week this device
    // measured itself: editing storage while blocking the backend used to be
    // unlimited Premium. The server's own answer, once it comes, wins.
    if (status.active && !localWeekRunning) return { ...status, active: false, daysLeft: 0 };
    return status;
  }, [state.trialStartedAt, effectiveNow, trialConfirmed, localWeekRunning]);

  // A simulated purchase in dev/preview counts as a subscription there, so the
  // post-week paid surface stays testable without store setup. In production
  // SIMULATED_PURCHASES is false, so only a store-verified receipt qualifies.
  const subscribed =
    storeSubscribed ||
    (SIMULATED_PURCHASES && (state.plan === 'yearly' || state.plan === 'monthly'));

  // A committed user whose week start we have never managed to read - first
  // launch on a plane, backend down - is given the benefit of the doubt rather
  // than silently losing the week they were promised. But only for that week:
  // it is measured from this device's first commit, which redoing the quiz
  // does not reset. This used to have no end at all, so blocking the backend
  // (or shipping a build without it) meant Premium forever.
  const trialUnverified = !trial.known && !!state.quitDate && localWeekRunning;

  const inFreeWeek = trial.active || trialUnverified;
  // A month on us. Measured on the same guarded clock as the free week.
  const hardship = useMemo(
    () => hardshipStatus(hardshipRecord, effectiveNow, minuteTick),
    [hardshipRecord, effectiveNow, minuteTick],
  );
  // Only for someone with nothing else: not paying, not in the free week, and
  // not already in a month on us. Held until the store has answered, like the
  // free-week banner: until then "not subscribed" is only a default, and a
  // subscriber offered a free month would use one up for nothing.
  const hardshipOffered = storeChecked && !subscribed && !inFreeWeek && !hardship.active;
  // At most one quiet note when a month ends, never a paywall.
  const hardshipNote = hardship.endedNote && hardshipOffered;

  // Paid features unlock on a subscription, an unexpired free week, or a
  // month on us.
  const isPremium = subscribed || inFreeWeek || hardship.active;
  // "Expired" once the server says the week is over, or - when the server has
  // never answered - once the locally measured week is over.
  const trialExpired =
    !subscribed &&
    storeChecked &&
    (trial.known
      ? !trial.active
      : !!state.quitDate && clock.firstCommitAt != null && !localWeekRunning);
  const freeWeekStarted = clock.firstCommitAt != null || state.trialStartedAt != null;

  useEffect(() => {
    if (hydrated.current) return;
    let alive = true;
    (async () => {
      let raw: string | null = null;
      let read = false;
      // A read error is usually momentary (storage busy at launch), so try a
      // few times before giving up.
      for (const waitMs of LOAD_RETRY_MS) {
        if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
        if (!alive) return;
        try {
          raw = await AsyncStorage.getItem(STORAGE_KEY);
          read = true;
          break;
        } catch {
          // Try again, or give up below.
        }
      }
      if (!alive) return;
      if (!read) {
        // Storage could not be READ - which says nothing about what is in it.
        // Running on defaults used to look like a brand-new user: the entry
        // gate sent a committed user to Welcome, every reminder was
        // cancelled, the widget lost its streak, and going through onboarding
        // again uploaded a new quit date over the real one. So stay not
        // ready (every one of those waits on `ready`), and let the entry gate
        // offer a retry.
        console.warn('[state] could not read saved state');
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      let parsed = initial;
      try {
        parsed = raw ? sanitizeStored(JSON.parse(raw)) : initial;
      } catch {
        // Corrupt JSON cannot be read; start fresh. Never log the raw error:
        // parse failures can embed stored PII. The unreadable copy is set
        // aside before the first save overwrites it, so it can still be
        // recovered by hand rather than lost.
        console.warn('[state] saved state was unreadable; starting fresh');
        if (raw) void AsyncStorage.setItem(`${STORAGE_KEY}.corrupt`, raw).catch(() => {});
      }
      // Warm the user's own reasons, so the panic screen never opens on the
      // quiz's version first. Not awaited: nothing below needs them.
      void loadReasons();
      const [securePartner, trialClock, consented, hardshipStored] = await Promise.all([
        loadStoredPartner(),
        loadTrialClock(),
        consentKnown(),
        loadHardship(),
      ]);
      // Migration: older builds kept partner in AsyncStorage; move it to
      // SecureStore. The persist write drops the old copy only once the move
      // has landed - otherwise a failed move lost the person for good.
      const partner = securePartner ?? parsed.partner ?? null;
      if (!securePartner && parsed.partner && !(await storePartner(parsed.partner))) {
        legacyPartner.current = parsed.partner;
      }

      // Installs from before the local free-week stamp existed: anchor it to
      // the quit date, the closest thing to a first commit they have.
      let firstCommitAt = trialClock.firstCommitAt;
      if (firstCommitAt == null && parsed.quitDate) {
        firstCommitAt = await stampFirstCommit(Math.min(Date.now(), Date.parse(parsed.quitDate)));
      }
      setClock({ ...trialClock, firstCommitAt });
      setHardshipRecord(hardshipStored);

      // Someone who committed in a build that predates the Welcome consent
      // step agreed to the terms back then; do not send them back through it.
      if (!consented && parsed.quitDate) await recordConsent();

      if (!alive) return;
      setState({ ...parsed, partner });
      hydrated.current = true;
      setReady(true);
      // Consent may only have become known just now.
      refreshPremium();
    })();
    return () => {
      alive = false;
    };
    // No session is created here any more. The anonymous account is made only
    // after the user agrees on Welcome (see _layout.tsx).
  }, [refreshPremium, loadNonce, setHardshipRecord]);

  const retryLoad = useCallback(() => {
    setLoadFailed(false);
    setLoadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    // Partner PII is excluded here - it persists via SecureStore only, except
    // an old copy whose move to SecureStore failed (kept until it succeeds).
    const { partner: _partner, ...rest } = state;
    const blob = legacyPartner.current ? { ...rest, partner: legacyPartner.current } : rest;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blob)).catch(() => {});
  }, [state]);

  // The urge wins, trigger log and games cache: read once, then kept current
  // by their modules' change events. A write that lands before the first read
  // resolves wins, so a slow read can never roll a fresh value back.
  useEffect(() => {
    let alive = true;
    const fresh = { wins: false, log: false, games: false };
    const offs = [
      subscribeUrgeWins((w) => {
        fresh.wins = true;
        setUrgeWins(w);
      }),
      subscribeTriggerLog((log) => {
        fresh.log = true;
        setTriggerLog(log);
      }),
      subscribeCachedGames((games) => {
        fresh.games = true;
        setCachedGames(games);
      }),
    ];
    void readUrgeWins().then((w) => alive && !fresh.wins && setUrgeWins(w));
    void readTriggerLog().then((log) => alive && !fresh.log && setTriggerLog(log));
    void readCachedGames().then((games) => alive && !fresh.games && setCachedGames(games));
    return () => {
      alive = false;
      for (const off of offs) off();
    };
  }, []);

  const setAnswer = useCallback((id: QuestionId, value: AnswerValue) => {
    // New answers mean the heuristic figure is the right one again.
    setState((s) => ({ ...s, answers: { ...s.answers, [id]: value }, monthlySpendOverride: null }));
  }, []);

  const setPartner = useCallback(async (partner: { name: string; phone: string } | null) => {
    setState((s) => ({ ...s, partner }));
    const ok = await storePartner(partner);
    // A newer choice supersedes any old copy still waiting to move.
    if (ok) legacyPartner.current = null;
    return ok;
  }, []);

  const setTeams = useCallback((teams: Team[]) => {
    setState((s) => ({ ...s, teams: teams.slice(0, MAX_TEAMS) }));
  }, []);

  const derived = useMemo(() => {
    const a = state.answers;
    const hasSpend = typeof a.spend === 'number';
    const spendIndex = typeof a.spend === 'number' ? a.spend : 1;
    // A figure restored from the server keeps the counter's rate on a new
    // phone; it is still held to the user's own bracket. Without a bracket
    // answer (quiz answers that never synced, or an option restore dropped)
    // there is nothing to hold it to but the overall range - the default
    // bracket would quietly turn $3,000 a month into $500.
    const [lo, hi] = hasSpend
      ? SPEND_BRACKETS[Math.min(SPEND_BRACKETS.length - 1, Math.max(0, spendIndex))]
      : [SPEND_BRACKETS[0][0], SPEND_BRACKETS[SPEND_BRACKETS.length - 1][1]];
    const monthlySpend =
      state.monthlySpendOverride != null
        ? Math.min(hi, Math.max(lo, state.monthlySpendOverride))
        : estimateMonthlySpend(a);
    const goalIndex = typeof a.goal === 'number' ? a.goal : 1;
    const cost = Array.isArray(a.cost) ? a.cost : [];
    const hideFlag = cost.includes(COST_SAVINGS_OR_DEBT) && a.secrecy === SECRECY_YES;
    // Anyone who keeps their betting hidden - always or sometimes - may have
    // their lock screen read by the person they hide it from.
    const hidesBetting = a.secrecy === SECRECY_YES || a.secrecy === SECRECY_SOMETIMES;
    return {
      spendIndex,
      monthlySpend,
      dailyRate: monthlySpend / 30,
      yearlyLoss: monthlySpend * 12,
      goalIndex,
      hideFlag,
      hidesBetting,
      sportsLabels: labelsFor('sports', a.sports),
      costLabels: labelsFor('cost', a.cost),
      triggerLabels: labelsFor('triggers', a.triggers),
    };
  }, [state.answers, state.monthlySpendOverride]);

  // Explicit choice wins; otherwise default to discreet for anyone who said
  // they hide their betting, even sometimes.
  const discreetNotifications = state.discreetOverride ?? derived.hidesBetting;

  const streakDerived = useMemo(() => {
    const month = localMonthKey();
    const usedThisMonth = state.slips.filter((s) => localMonthKey(new Date(s)) === month).length;
    return {
      currentStreakDays: streakDaysOf(state.quitDate),
      // One freeze per calendar month, and free.
      //
      // It used to be Premium, which meant the app manufactured the anxiety (a
      // visible streak that one slip destroys) and then sold relief from it at
      // the exact moment the user was most afraid of losing it. That is the
      // same emotional move as a betting company offering a bonus bet after a
      // bad beat, aimed at the same person. Nothing that answers a relapse is
      // behind the paywall.
      freezeAvailable: usedThisMonth < 1,
    };
    // minuteTick keeps both values current as time passes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.quitDate, state.slips, minuteTick]);

  // Coarse context on every analytics event. Buckets and booleans only.
  //
  // `discreet` says only whether the user has set discreet mode themselves
  // ('set') or left the default ('default') - never on or off. The default
  // is derived from the secrecy answer, and the switch flips, so any on/off
  // value at all gives the default away: the first explicit value is always
  // the opposite of it. Sending the effective flag was worse still - it told
  // our backend and PostHog, on every event, whether this person hides their
  // betting, the one answer we promise never leaves the phone.
  useEffect(() => {
    setSuperProps({
      days_clean: daysBucket(state.quitDate, streakDerived.currentStreakDays),
      is_premium: isPremium,
      free_week_active: trial.active || trialUnverified,
      discreet: state.discreetOverride == null ? 'default' : 'set',
    });
  }, [
    state.quitDate,
    streakDerived.currentStreakDays,
    isPremium,
    trial.active,
    trialUnverified,
    state.discreetOverride,
  ]);

  // One app_foregrounded per foreground: at launch, then only after a real
  // trip to the background. 'inactive' <-> 'active' flips (the Face ID sheet,
  // Control Center, an incoming call banner) are not new visits.
  useEffect(() => {
    if (!ready) return;
    track('app_foregrounded', { cold: true });
    let last = RNAppState.currentState;
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active' && last === 'background') track('app_foregrounded', { cold: false });
      last = s;
    });
    return () => sub.remove();
  }, [ready]);

  // Refresh the home-screen widget snapshot when the streak, rate or privacy
  // setting changes. Discreet mode renders neutral text on the widget too.
  //
  // Also at local midnight and on every foreground: "checked in today" is
  // worked out when the snapshot is drawn, and none of the values above change
  // at midnight, so yesterday's "Done" face (and its tap target) used to stay
  // up until Android's next periodic update.
  const todayKey = localDayKey(new Date(minuteTick));
  // Any mark, a slip included: a slip day is closed (see closedToday).
  const closedDay = latestDay(state.closeouts);
  useEffect(() => {
    if (!ready) return;
    const draw = () =>
      void updateStreakWidget({
        quitDate: state.quitDate,
        dailyRate: derived.dailyRate,
        lastCheckIn: state.lastCheckIn,
        closedDay,
        moneyKeptBefore: state.moneyKeptBefore,
        discreet: discreetNotifications,
      });
    draw();
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') draw();
    });
    return () => sub.remove();
  }, [
    ready,
    todayKey,
    state.quitDate,
    derived.dailyRate,
    state.lastCheckIn,
    closedDay,
    state.moneyKeptBefore,
    discreetNotifications,
  ]);

  const commit = useCallback(() => {
    const now = Date.now();
    const quitDate = new Date(now).toISOString();
    // The free week is measured locally from the FIRST commit only. A quiz
    // redo commits again, and must not restart it.
    setClock((c) => (c.firstCommitAt != null ? c : { ...c, firstCommitAt: now }));
    void stampFirstCommit(now).then((at) =>
      setClock((c) => (c.firstCommitAt === at ? c : { ...c, firstCommitAt: at })),
    );
    // The bracket, not the computed figure. Segmenting conversion by spend
    // band is the entire analytical use, and it does not need a precise
    // self-reported gambling figure. The bracket stays first-party (it is
    // never sent to PostHog), and the exact figure stays on the device and in
    // our own Postgres, where it is actually used.
    const a = state.answers;
    track('funnel_committed', { spend_bracket: labelsFor('spend', a.spend)[0] ?? 'unknown' });

    // The upload itself runs from the pending-sync effect below, which keeps
    // retrying until the server has it.
    commitGen.current += 1;
    setState((s) => ({ ...s, quitDate, profileSyncPending: true }));
    // No permission prompt here any more. The OS asks once, so it is asked
    // from the reminders priming screen (/reminders-intro), which explains
    // what the reminders are first. The new quit date rebuilds the schedule
    // through the schedule effect below.
  }, [state.answers]);

  // Upload the commit: quiz answers, then the full profile including the quit
  // date. Runs after every commit and again on each foreground (syncNonce)
  // until both writes land. The profile goes up in full each time, from the
  // current state, so a retry days later still carries the right quit date,
  // plan and figures.
  useEffect(() => {
    if (!ready || !state.profileSyncPending || !state.quitDate || restoreHold.current) return;
    const gen = commitGen.current;
    const a = state.answers;
    const quitAt = state.quitDate;
    const plan = state.plan;
    void (async () => {
      // `secrecy` is never uploaded. Removing hide_flag from the profile would
      // be theatre if the answer it is derived from still sat on the server.
      // Whether someone hides their betting from a partner is the fact most
      // capable of harming them, and nothing we run server-side needs it.
      // (syncQuizAnswers filters it too, in case a caller forgets.)
      const quizOk = await syncQuizAnswers(
        QUESTIONS.filter((q) => q.id !== 'secrecy' && a[q.id] != null).map((q) => ({
          question_id: q.id,
          answer: labelsFor(q.id, a[q.id]),
        })),
      );
      const profileOk = await syncProfile({
        monthly_spend: derived.monthlySpend,
        sports: derived.sportsLabels,
        triggers: derived.triggerLabels,
        goal: labelsFor('goal', a.goal)[0] ?? null,
        baseline_streak: labelsFor('baseline', a.baseline)[0] ?? null,
        // hide_flag is deliberately NOT uploaded. It records that the user
        // hides their betting from someone AND is in financial harm - the
        // single most damaging fact the app knows. It is computed locally from
        // the answers, used locally to soften notification copy, and nothing
        // server-side ever read it.
        quit_at: quitAt,
        ...(plan ? { plan } : {}),
      });
      if (!quizOk || !profileOk || gen !== commitGen.current) return;
      setState((s) => (s.profileSyncPending ? { ...s, profileSyncPending: false } : s));
      // The profile row now exists and the database has stamped the free week
      // on it. Read it back so the week counts from the server clock now, not
      // on the next launch.
      refreshPremium();
    })();
    // Every value the upload reads is a dependency, so a change while it is
    // still pending simply sends the newer version.
  }, [
    ready,
    syncNonce,
    state.profileSyncPending,
    state.quitDate,
    state.answers,
    state.plan,
    derived.monthlySpend,
    derived.sportsLabels,
    derived.triggerLabels,
    refreshPremium,
  ]);

  const choosePlan = useCallback(
    (plan: Plan) => {
      setState((s) => ({ ...s, plan }));
      track('plan_chosen', { plan });
      // While the commit is still pending, the plan rides along with it: a
      // plan-only upsert would create the profile row first, without the quit
      // date the free week is anchored to.
      if (!state.profileSyncPending) void syncProfile({ plan });
    },
    [state.profileSyncPending],
  );

  const closeDayOn = useCallback(
    (day: DayKey, kind: 'clean' | 'close', triggers: number[] = []) => {
      for (const i of triggers) {
        const label = TRIGGER_OPTIONS[i];
        if (label) void logTrigger(label, 'urge');
      }
      const prev = state.closeouts[day];
      // A close call is an urge ridden out, once per day.
      if (kind === 'close' && prev !== 1) void storeUrgeWin('closeout');
      // A day already marked as a slip keeps its mark.
      if (prev === 2) return;
      // closedToday feeds the schedule, so this also cancels tonight's
      // close-out push. The check_ins mirror runs from the sync effect.
      setState((s) => applyCloseout(s, day, kind === 'close' ? 1 : 0));
      if (prev === undefined) track('checkin', { close_call: kind === 'close' });
    },
    [state.closeouts],
  );

  const closeDay = useCallback(
    (kind: CloseoutKind, opts: { triggers?: number[]; day?: DayKey } = {}) => {
      // A slip is recorded by the slip flow (freeze or reset), never here.
      if (kind === 'slip') return;
      closeDayOn(closableDay(opts.day, localDayKey()), kind, opts.triggers);
    },
    [closeDayOn],
  );

  const checkInToday = useCallback(() => closeDay('clean'), [closeDay]);

  // Mirror clean and close-call days to check_ins (the existing table, same
  // row shape: user_id and day, nothing about how the day went). Recent days
  // only, once per process, retried on the next foreground if it fails. Slip
  // days are never uploaded. Restore reads these back.
  useEffect(() => {
    if (!ready || !state.quitDate || restoreHold.current) return;
    const since = addDays(todayKey, -13);
    const days = Object.entries(state.closeouts)
      .filter(([d, m]) => m !== 2 && d >= since && d <= todayKey && !syncedDays.current.has(d))
      .map(([d]) => d);
    if (!days.length) return;
    for (const d of days) syncedDays.current.add(d);
    void uploadCheckIns(days).then((ok) => {
      if (!ok) for (const d of days) syncedDays.current.delete(d);
    });
  }, [ready, syncNonce, state.quitDate, state.closeouts, todayKey]);

  const resetStreak = useCallback(() => {
    const quitDate = new Date().toISOString();
    const day = localDayKey();
    const wasMirrored = state.closeouts[day] === 0 || state.closeouts[day] === 1;
    // As in commit(): an upload still in flight carries the old quit date and
    // must not clear the flag for this one.
    commitGen.current += 1;
    setState((s) => {
      // Bank what they actually kept before zeroing the clock.
      const kept = s.quitDate
        ? (Math.max(0, Date.now() - new Date(s.quitDate).getTime()) / DAY) * derived.dailyRate
        : 0;
      // Today gets a neutral slip mark. Lifetime counts do not move.
      const marked = applyCloseout(s, day, 2);
      return {
        ...marked,
        quitDate,
        bestStreakDays: Math.max(s.bestStreakDays, streakDaysOf(s.quitDate)),
        moneyKeptBefore: s.moneyKeptBefore + kept,
        // The new run earns its milestones again. Without this a comeback
        // after a long streak never heard "Day 1" - every milestone up to the
        // old best was marked as already seen.
        lastMilestoneSeen: 0,
        // The new quit date goes up through the commit upload, which retries
        // on every foreground until it lands. A one-off write was lost to any
        // offline moment, and a later restore brought back the pre-slip
        // streak beside the money already banked from it.
        profileSyncPending: true,
      };
    });
    track('streak_reset');
    // Someone who just logged a relapse is in shame; no rating prompt for a
    // month. A one-star review would be the least of the harm.
    void noteSetback();
    if (wasMirrored) {
      syncedDays.current.delete(day);
      void removeCheckIn(day);
    }
  }, [derived.dailyRate, state.closeouts]);

  // Push the banked figure whenever it changes, so a reinstall or a new phone
  // gets the lifetime number back rather than restarting it from this streak.
  // Never push zero: the server default is already zero, and a device that
  // starts empty on an account with history (the old iOS reinstall bug) must
  // not overwrite the banked figure with nothing.
  //
  // Held back while the commit upload is pending, like the plan: this must not
  // be the write that creates the profile row. It runs as soon as the pending
  // flag clears.
  useEffect(() => {
    if (!ready || !state.quitDate || state.profileSyncPending || state.moneyKeptBefore <= 0) return;
    if (restoreHold.current) return;
    void syncProfile({ money_kept_before: state.moneyKeptBefore });
  }, [ready, state.moneyKeptBefore, state.quitDate, state.profileSyncPending]);

  // Curriculum position and best streak travel with the account, for the
  // same reason. Sent on their own so that a database without these columns
  // yet rejects only this write, not the rest of the profile.
  useEffect(() => {
    if (!ready || !state.quitDate || state.profileSyncPending || restoreHold.current) return;
    if (state.dailyIndex <= 0 && state.bestStreakDays <= 0) return;
    void syncProfile({ daily_index: state.dailyIndex, best_streak_days: state.bestStreakDays });
  }, [ready, state.quitDate, state.dailyIndex, state.bestStreakDays, state.profileSyncPending]);

  const freezeStreak = useCallback(() => {
    // The slip is absorbed: quit date (and the streak) is preserved.
    // Deliberately does NOT write to urge_events: that table feeds the trigger
    // heatmap ("when do my urges hit"), and a relapse is not a panic session.
    // Writing one here both invents an urge the user never logged and leaves a
    // row that never gets an ended_at.
    const day = localDayKey();
    const wasMirrored = state.closeouts[day] === 0 || state.closeouts[day] === 1;
    setState((s) => ({
      ...applyCloseout(s, day, 2),
      slips: [...s.slips, new Date().toISOString()],
    }));
    track('streak_freeze_used');
    // A freeze absorbs a slip. It is a save, not a victory, and the user knows
    // the difference even though the counter does not.
    void noteSetback();
    if (wasMirrored) {
      syncedDays.current.delete(day);
      void removeCheckIn(day);
    }
  }, [state.closeouts]);

  /**
   * Everything this device holds about the current user, minus the session.
   * Shared by account deletion and by signing in as a different account: both
   * need the old user's traces gone, only one of them signs out.
   *
   * `keepPurchasesIdentity` is for the sign-in path: RevenueCat's logIn
   * switches customers directly, and a logOut fired alongside it could land
   * after the logIn and leave the device on an anonymous store customer.
   */
  const wipeLocalState = useCallback((opts: { keepPurchasesIdentity?: boolean } = {}) => {
    setState(initial);
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    legacyPartner.current = null;
    void storePartner(null);
    void clearReasons();
    void clearReviewState();
    void clearTriggerLog();
    void clearUrgeWins();
    void clearUrgeLog();
    void clearCachedGames();
    // Queued events carry no user id and are sent as whoever is signed in
    // when they flush, so the previous account's offline events would land
    // on the one being switched to.
    void clearAnalyticsQueue();
    syncedDays.current.clear();
    void clearStreakWidget();
    void cancelAllNotifications();
    // Detach the store customer too, or the previous user's entitlement
    // follows the device into the next account.
    if (!opts.keepPurchasesIdentity) void forgetPurchasesIdentity();
    setStoreSubscribed(false);
    // Not an answer about the next customer. Left true, "not subscribed" read
    // as a real store answer until the next check landed, and a subscriber
    // signing into their account could be shown the end-of-free-week paywall.
    setStoreChecked(false);
    setTrialConfirmed(false);
    // Any upload still in flight belongs to the identity being wiped.
    commitGen.current += 1;
  }, []);

  const restoreAccount = useCallback(async (previousUserId?: string | null): Promise<RestoreOutcome> => {
    // Signing in changes who we are. The analytics module caches the user id
    // for the process lifetime, so without this every later event would be
    // sent with the previous anonymous id while the JWT belongs to the new
    // user - RLS rejects the mismatch and analytics silently stops working
    // for the rest of the session.
    resetAnalyticsIdentity();
    // Nothing from this phone goes up until we know what the account holds.
    restoreHold.current = true;
    const r = await restoreFromServer();
    // Unreadable is not empty. Leave this phone exactly as it was - no wipe,
    // no "no history" - and keep holding uploads: the caller retries, or
    // backs out with abandonSignIn.
    if (r.failed) return 'failed';
    const userId = r.userId ?? (await ensureSession());

    // A different account means a different person's device state. Without
    // this, signing into an account with no history kept the PREVIOUS user's
    // answers, streak, trigger log and their accountability contact's phone
    // number, then synced all of it into the account just signed into. Two
    // people's data, merged, with nothing on screen to say so.
    if (previousUserId && userId && previousUserId !== userId) {
      wipeLocalState({ keepPurchasesIdentity: true });
    }
    // The store must be looking at THIS account before anyone asks it about
    // Premium. This used to fire-and-forget, so the check below read the old
    // customer, a paying subscriber on a new phone looked unsubscribed, and
    // Home greeted them with "your free week is up".
    // If the store did not answer, it is still looking at the previous
    // customer: its answer about Premium would be about the wrong person, so
    // it is not asked now. The foreground alias retries, and the customer
    // listener updates Premium once the store has this account.
    const storeKnowsUs = userId ? await identifyPurchases(userId) : true;
    // The account has been read, so the sign-in stands. Released in the same
    // tick as the state below is set, so no upload can see the state between.
    restoreHold.current = false;
    void setSignInPending(false);

    if (!r.found) {
      if (storeKnowsUs) refreshPremium();
      return 'empty';
    }
    // Milestones already passed must not replay on the new phone. A restore
    // should feel like continuity, and being congratulated for day 28 you
    // reached weeks ago reads as a bug, not a celebration.
    const restoredDays = streakDaysOf(r.quitDate);
    const alreadyPassed = milestonesThrough(restoredDays)
      .filter((m) => m.days <= restoredDays)
      .map((m) => m.days);
    const highestPassed = alreadyPassed.length ? Math.max(...alreadyPassed) : 0;
    const restoredAnswers = Object.keys(r.answers).length > 0;

    // They came from the server, so they need no upload.
    for (const d of r.checkInDays) syncedDays.current.add(d);
    setState((st) => {
      // Clean days from check_ins, merged under whatever this device already
      // has: a local mark (a close call, a slip) is never overwritten, and
      // each day new to this device counts once.
      const today = localDayKey();
      const closeouts = { ...st.closeouts };
      let added = 0;
      for (const d of r.checkInDays) {
        if (closeouts[d] == null && inWindow(d, today)) {
          closeouts[d] = 0;
          added += 1;
        }
      }
      return {
        ...st,
        closeouts,
        tally: { ...st.tally, cleanDays: st.tally.cleanDays + added },
        lastCheckIn: lastCleanDay(closeouts),
        // Only overwrite what the server actually had. A partial restore must
        // not wipe local progress that the server never knew about.
        answers: restoredAnswers ? r.answers : st.answers,
        quitDate: r.quitDate ?? st.quitDate,
        plan: r.plan ?? st.plan,
        // Keep the money counter's rate: the figure this account was using,
        // not whatever the heuristic makes of the restored answers today.
        monthlySpendOverride: r.monthlySpend ?? st.monthlySpendOverride,
        // Take the larger of the two. The server value is what this account
        // earned; the local value may include a streak this device banked while
        // signed out. Neither should be thrown away.
        moneyKeptBefore: Math.max(st.moneyKeptBefore, r.moneyKeptBefore ?? 0),
        dailyIndex: Math.max(st.dailyIndex, Math.trunc(r.dailyIndex ?? 0)),
        bestStreakDays: Math.max(st.bestStreakDays, Math.trunc(r.bestStreakDays ?? 0)),
        lastMilestoneSeen: Math.max(st.lastMilestoneSeen, highestPassed),
        // Force a fresh read of THIS account's week rather than carrying over
        // the previous anonymous user's clock.
        trialStartedAt: null,
        // `secrecy` is deliberately never uploaded, so it cannot come back. It
        // drives discreet notification copy, and the safe assumption for someone
        // we cannot ask is the private one - they can change it in Settings. A
        // choice already made on this phone (signing in to the same account)
        // is kept: it used to be forced back on by every restore.
        discreetOverride: st.discreetOverride ?? true,
      };
    });
    setTrialConfirmed(false);
    if (storeKnowsUs) refreshPremium();
    track('account_restored');
    return 'restored';
  }, [refreshPremium, wipeLocalState]);

  const abandonSignIn = useCallback(async () => {
    // Only this phone signs out; the account's other phones stay signed in.
    await forgetSession('local');
    await setSignInPending(false);
    restoreHold.current = false;
    // The next upload goes to a fresh anonymous account. The full profile
    // goes first, so a counter push is never the write that creates its row.
    setState((s) => (s.quitDate ? { ...s, profileSyncPending: true } : s));
    setSyncNonce((n) => n + 1);
  }, []);

  const markDailyRead = useCallback(() => {
    const next = advanceProgress(
      { index: state.dailyIndex, lastReadDay: state.dailyLastReadDay },
      localDayKey(),
    );
    if (next.index === state.dailyIndex) return;
    setState((st) => ({ ...st, dailyIndex: next.index, dailyLastReadDay: next.lastReadDay }));
    // Which curriculum day was finished, so completion by day needs no join.
    track('daily_read', { day: next.index });
  }, [state.dailyIndex, state.dailyLastReadDay]);

  const markMilestoneSeen = useCallback((days: number) => {
    setState((st) => (st.lastMilestoneSeen >= days ? st : { ...st, lastMilestoneSeen: days }));
  }, []);

  const setDiscreetNotifications = useCallback((on: boolean) => {
    // The notification rebuild depends on the effective flag, so the queued
    // schedule is rewritten as soon as this lands.
    setState((st) => ({ ...st, discreetOverride: on }));
    // No `on`: the first change is always away from the default, which comes
    // from the secrecy answer, so the direction would reveal that answer.
    track('settings_discreet');
  }, []);

  const markTrialPromptShown = useCallback(() => {
    setState((s) => (s.trialPromptShown ? s : { ...s, trialPromptShown: true }));
  }, []);

  const startHardship = useCallback((): boolean => {
    // Checked against the ref, not the last render: a second tap before the
    // first one has rendered must not start a second month.
    const at = Math.max(Date.now(), clock.latestSeen);
    const now = hardshipStatus(hardshipRef.current, at, Date.now());
    if (
      !storeChecked ||
      subscribed ||
      inFreeWeek ||
      now.active ||
      now.remaining <= 0 ||
      now.clockBehind
    ) {
      return false;
    }
    const next = addGrant(hardshipRef.current, at);
    setHardshipRecord(next);
    void saveHardship(next);
    // No props: that someone took a month is all we need to know, and it
    // stays first-party (not on the PostHog allowlist).
    track('hardship_grant');
    return true;
  }, [clock.latestSeen, storeChecked, subscribed, inFreeWeek, setHardshipRecord]);

  const dismissHardshipNote = useCallback(() => {
    const record = hardshipRef.current;
    const latest = hardshipStatus(
      record,
      Math.max(Date.now(), clock.latestSeen),
      Date.now(),
    ).latestStart;
    if (latest == null || record.notedEnd === latest) return;
    const next = { ...record, notedEnd: latest };
    setHardshipRecord(next);
    void saveHardship(next);
  }, [clock.latestSeen, setHardshipRecord]);

  const restartOnboarding = useCallback(() => {
    // The run so far is banked the way a slip banks it - its money into the
    // lifetime total, its length into the best streak - because the redo
    // starts the clock again at the next commit. Without this the run's money
    // vanished from Home and the server, it never counted as done before, and
    // every milestone of the new run up to the old one was marked seen. Not a
    // slip, though: no slip mark, no streak_reset event, no setback. The
    // curriculum and the free-week stamp stay, so a redo cannot restart them.
    setState((s) => {
      const kept = s.quitDate
        ? (Math.max(0, Date.now() - new Date(s.quitDate).getTime()) / DAY) * derived.dailyRate
        : 0;
      return {
        ...s,
        answers: {},
        quitDate: null,
        lastCheckIn: null,
        monthlySpendOverride: null,
        moneyKeptBefore: s.moneyKeptBefore + kept,
        bestStreakDays: Math.max(s.bestStreakDays, streakDaysOf(s.quitDate)),
        lastMilestoneSeen: 0,
      };
    });
    track('quiz_restarted');
  }, [derived.dailyRate]);

  const eraseAllLocalData = useCallback(() => {
    wipeLocalState();
    // The next account is a new account, with its own week and its own
    // consent. Nothing of this one should decide either.
    void clearTrialClock();
    setClock({ firstCommitAt: null, latestSeen: 0 });
    // Months on us live on this phone only, and go with everything else.
    void clearHardship();
    setHardshipRecord(NO_HARDSHIP);
    void resetAnalyticsPreference();
    // Device settings that belong to the erased account too: its app lock
    // (LockGate hears this and drops the overlay at once), and its last panic
    // session, which would otherwise hold back the next account's paywall.
    // Not in the sign-in wipe - that is the same person, lock and all.
    void setLockEnabled(false);
    void clearPanicSession();
    // Sign out, and drop the cached session id with it.
    //
    // The delete flow offers "Erase on this device" when the server call
    // fails. Without this, that path wiped local state but left the refresh
    // token in SecureStore and the memoized session still resolving to the
    // SAME user - so the "fresh start" redid onboarding straight back into
    // the account the user had just been told was not deleted, and analytics
    // kept the same distinct_id. Signing out forces the next ensureSession()
    // to mint a genuinely new anonymous user.
    //
    // forgetSession also removes the stored session itself: offline, with an
    // expired access token, signOut() gave up before removing it, and the old
    // refresh token resumed the old account once the phone was back online.
    //
    // This phone only ('local'): "Erase on this device" says what it does,
    // and the account's other phones stay signed in.
    void forgetSession('local');
    resetAnalyticsIdentity();
  }, [wipeLocalState, setHardshipRecord]);

  // -------------------------------------------------------------------------
  // Wave B: derived values
  // -------------------------------------------------------------------------

  const todayMark = state.closeouts[todayKey] ?? null;
  const closedToday = todayMark != null;
  const daysClean = streakDerived.currentStreakDays;

  // Estimated money kept, lifetime: the banked figure plus this run.
  const keptNow = state.quitDate
    ? state.moneyKeptBefore +
      (Math.max(0, minuteTick - Date.parse(state.quitDate)) / DAY) * derived.dailyRate
    : state.moneyKeptBefore;

  const lifetime: Lifetime = {
    cleanDaysLogged: state.tally.cleanDays,
    closeCallsBeaten: state.tally.closeCalls,
    urgesRiddenOut: urgeWins.total,
    linesCut: state.cutLinesDone.length,
    plansHeld: state.tally.plansHeld,
    gamesWatchedClean: state.tally.gamesClean,
    nightsClosed: state.tally.nightsClosed,
    repsDone: state.repsDone,
  };

  const upcoming = nextMilestoneAfter(daysClean);
  const nextMilestone: NextMilestone | null = state.quitDate
    ? { days: upcoming.days, title: upcoming.title, inDays: upcoming.days - daysClean }
    : null;

  const week = useMemo(
    () =>
      computeWeek({
        closeouts: state.closeouts,
        urgeWins: urgeWins.wins,
        triggerLog,
        slips: state.slips,
        dailyRate: derived.dailyRate,
        quitDate: state.quitDate,
        planOutcomes: state.planOutcomes,
        nightsClosed: state.nightsClosed,
        cleanGames: state.cleanGames,
        now: minuteTick,
      }),
    [
      state.closeouts,
      urgeWins.wins,
      triggerLog,
      state.slips,
      derived.dailyRate,
      state.quitDate,
      state.planOutcomes,
      state.nightsClosed,
      state.cleanGames,
      minuteTick,
    ],
  );

  const move = todaysMove(
    { index: state.dailyIndex, lastReadDay: state.dailyLastReadDay },
    todayKey,
    DAILY_READS,
  );

  // Automatic "game today" context only comes from saved teams' games, which
  // are Premium; anyone can say so by hand on /plan (playContext + gameToday).
  const quizTriggers = state.answers.triggers;
  const gameToday =
    isPremium &&
    state.teams.length > 0 &&
    cachedGames.some((g) => localDayKey(new Date(g.startsAt)) === todayKey);
  const playContext = useMemo<PlayContextInput>(
    () => ({
      triggers: Array.isArray(quizTriggers) ? quizTriggers : [],
      topLoggedTrigger: topLoggedTrigger(triggerLog, dayKeyToDate(todayKey).getTime()),
      gameToday,
      daysClean,
    }),
    [quizTriggers, triggerLog, todayKey, gameToday, daysClean],
  );
  const todaysPlays = useMemo(() => pickPlays(todayKey, playContext), [todayKey, playContext]);
  const todayPlanItem =
    state.todayPlan && state.todayPlan.day === todayKey ? (planById(state.todayPlan.planId) ?? null) : null;

  const comebackOffset = state.comebackStartedDay ? daysBetween(state.comebackStartedDay, todayKey) : -1;
  const comebackDay = comebackOffset >= 1 && comebackOffset <= 7 ? comebackOffset : null;

  const activeGoals = isPremium ? state.goals : state.goals.slice(0, 1);
  const goalItems = allocateGoals(activeGoals, keptNow);
  const pendingGoal = goalItems.find((it) => it.checkpoint > (state.goalCheckpointsSeen[it.goal.id] ?? 0));
  const goalProgress: GoalProgress = {
    kept: keptNow,
    moved: state.moved.reduce((sum, m) => sum + m.amount, 0),
    goals: goalItems,
    pendingCheckpoint: pendingGoal
      ? { goalId: pendingGoal.goal.id, checkpoint: pendingGoal.checkpoint }
      : null,
  };
  const revealGoal = GOAL_REVEAL[derived.goalIndex] ?? null;
  const suggestedGoalName = revealGoal
    ? revealGoal.charAt(0).toUpperCase() + revealGoal.slice(1)
    : // "Just stopping the bleeding": the jar is room to breathe.
      'Breathing room';

  const openCutLines = CUT_LINES.filter(
    (c) => !state.cutLinesDone.includes(c.id) && !state.cutLinesSkipped.includes(c.id),
  );
  const nextCutLine = openCutLines[0] ?? null;

  const todaysRep = repForDay(todayKey, daysClean, state.favouritePattern);

  const sportsIdx = state.answers.sports;
  const bigEvent = activeBigEvent(
    todayKey,
    Array.isArray(sportsIdx) ? sportsIdx : [],
    state.teams.map((t) => t.league as League),
  );

  // Three rough nights in a row (within the last week) points to a doctor or
  // a helpline, not more time in the app.
  const recentSleep = Object.entries(state.sleep)
    .filter(([k]) => k >= addDays(todayKey, -6))
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 3);
  const sleepConcern = recentSleep.length === 3 && recentSleep.every(([, v]) => v === 1);

  // -------------------------------------------------------------------------
  // The reminder engine's input
  // -------------------------------------------------------------------------

  const primaryGoal = state.goals[0] ?? null;
  const followUpAt =
    state.urgeFollowUpAt && Date.parse(state.urgeFollowUpAt) > minuteTick ? state.urgeFollowUpAt : null;
  const triggerList = Array.isArray(quizTriggers) ? quizTriggers : [];
  const lateNightUser = triggerList.includes(TRIGGER_LATE_NIGHT);
  const todayPlanSet = todayPlanItem != null;
  const nightClosedToday = state.nightsClosed.includes(todayKey);
  const scheduleInput = useMemo<ScheduleInput>(
    () => ({
      quitDate: state.quitDate,
      answers: state.answers,
      discreet: discreetNotifications,
      isPremium,
      closedToday,
      nightClosedToday,
      prefs: state.reminderPrefs,
      teams: state.teams,
      lastMilestoneSeen: state.lastMilestoneSeen,
      comebackStartedDay: state.comebackStartedDay,
      todayPlanSet,
      goal: primaryGoal ? { name: primaryGoal.name, target: primaryGoal.target } : null,
      keptNow,
      dailyRate: derived.dailyRate,
      lateNightUser,
      urgeFollowUpAt: followUpAt,
      cutLinesRemaining: openCutLines.length,
    }),
    [
      state.quitDate,
      state.answers,
      discreetNotifications,
      isPremium,
      closedToday,
      nightClosedToday,
      state.reminderPrefs,
      state.teams,
      state.lastMilestoneSeen,
      state.comebackStartedDay,
      todayPlanSet,
      primaryGoal,
      keptNow,
      derived.dailyRate,
      lateNightUser,
      followUpAt,
      openCutLines.length,
    ],
  );
  // Everything except the money figure, which moves every minute: the
  // schedule is rebuilt when an input that changes WHAT is queued changes,
  // plus once a day (the day key) and on every foreground - never once a
  // minute because the estimate ticked.
  const scheduleKey = JSON.stringify({ ...scheduleInput, keptNow: 0, day: todayKey });
  const scheduleRef = useRef(scheduleInput);
  // The day-keyed facts behind closedToday, todayPlanSet and
  // nightClosedToday, so a foreground can re-derive them for the real today.
  const dayFactsRef = useRef({
    closeouts: state.closeouts,
    todayPlan: state.todayPlan,
    nightsClosed: state.nightsClosed,
  });
  useEffect(() => {
    scheduleRef.current = scheduleInput;
    dayFactsRef.current = {
      closeouts: state.closeouts,
      todayPlan: state.todayPlan,
      nightsClosed: state.nightsClosed,
    };
  });

  // No run in progress - before commit, after "redo the quiz" - means nothing
  // may stay queued from the last one: a morning line written for answers the
  // user just discarded, or a close-out for a streak that no longer exists.
  useEffect(() => {
    if (ready && !state.quitDate) void cancelAllNotifications();
  }, [ready, state.quitDate]);

  // Keep the notification schedule topped up. This rebuilds on app start, on
  // commit, whenever anything the schedule reads changes, AND every time the
  // app returns to the foreground: the schedule is a fixed window of dated
  // notifications, so without a top-up it simply runs out and the user
  // silently stops hearing from us. refreshNotificationSchedule is serialized
  // and idempotent, so extra calls cost nothing; the short debounce folds a
  // burst of changes (hydration, a restore) into one rebuild.
  //
  // The foreground listener reads the latest input through a ref. The old
  // effect captured its values, so a check-in never cancelled tonight's
  // nudge and turning discreet mode on left revealing copy queued.
  //
  // The ref can still be a day old on a foreground: the minute tick does not
  // run in the background, and the listener fires before any re-render. So
  // the fields keyed to today are worked out again for the real today first.
  // Otherwise the first foreground after midnight would read yesterday's
  // close-out as today's and drop tonight's close-out reminder.
  useEffect(() => {
    if (!ready || !state.quitDate) return;
    const rebuild = () => {
      const today = localDayKey();
      const facts = dayFactsRef.current;
      const plan = facts.todayPlan;
      void refreshNotificationSchedule({
        ...scheduleRef.current,
        closedToday: facts.closeouts[today] != null,
        todayPlanSet: !!plan && plan.day === today && planById(plan.planId) != null,
        nightClosedToday: facts.nightsClosed.includes(today),
      });
    };
    const timer = setTimeout(rebuild, SCHEDULE_DEBOUNCE_MS);
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') rebuild();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [ready, state.quitDate, scheduleKey, scheduleNonce]);

  // -------------------------------------------------------------------------
  // Wave B: actions
  // -------------------------------------------------------------------------

  const logUrgeWin = useCallback((source: UrgeWinSource, startedAt?: string) => {
    void storeUrgeWin(source, startedAt);
  }, []);

  const setReminderPrefs = useCallback((patch: ReminderPrefsPatch) => {
    setState((st) => {
      const next = mergeReminderPrefs(st.reminderPrefs, patch);
      return JSON.stringify(next) === JSON.stringify(st.reminderPrefs) ? st : { ...st, reminderPrefs: next };
    });
    // Which switch, never which trigger it relates to: the late-night type
    // only exists for people who named late nights as a trigger.
    for (const on of Object.values(patch.types ?? {})) {
      if (typeof on === 'boolean') track('settings_reminders', { on });
    }
    if (patch.morning || patch.evening || patch.lateNight) track('settings_reminder_time');
  }, []);

  const markPrimed = useCallback(() => {
    setState((st) => (st.remindersPrimed ? st : { ...st, remindersPrimed: true }));
    setScheduleNonce((n) => n + 1);
  }, []);

  const refreshReminders = useCallback(() => setScheduleNonce((n) => n + 1), []);

  const setLineCut = useCallback(
    (id: string, status: 'done' | 'skip' | null) => {
      if (!CUT_LINE_IDS.has(id)) return;
      const day = localDayKey();
      setState((st) => {
        const done = st.cutLinesDone.filter((x) => x !== id);
        const skipped = st.cutLinesSkipped.filter((x) => x !== id);
        if (status === 'done') done.push(id);
        if (status === 'skip') skipped.push(id);
        return {
          ...st,
          cutLinesDone: done,
          cutLinesSkipped: skipped,
          cutLinesLastDay: status ? day : st.cutLinesLastDay,
        };
      });
      // A count, never which line: the tasks name the channels someone uses.
      if (status === 'done' && !state.cutLinesDone.includes(id)) {
        track('line_cut', { count: state.cutLinesDone.length + 1 });
      }
    },
    [state.cutLinesDone],
  );

  const pickPlan = useCallback(
    (planId: string) => {
      if (!planById(planId)) return;
      const day = localDayKey();
      setState((st) => ({ ...st, todayPlan: { day, planId } }));
      // Never the plan id: plans map almost one-to-one onto triggers.
      track('plan_set', { has_context: todaysPlays.context !== 'default' });
    },
    [todaysPlays.context],
  );

  const setPlanOutcome = useCallback(
    (day: DayKey, outcome: PlanOutcome) => {
      const today = localDayKey();
      if (!isDayKey(day) || day > today || day < addDays(today, -6)) return;
      if (outcome !== 0 && outcome !== 1 && outcome !== 2) return;
      if (state.planOutcomes[day] === outcome) return;
      setState((st) => {
        const prev = st.planOutcomes[day];
        return {
          ...st,
          planOutcomes: trimDays({ ...st.planOutcomes, [day]: outcome }, today),
          // Only ever up: changing "held" to "not today" later does not take
          // a held plan away.
          tally:
            outcome === 0 && prev !== 0 ? { ...st.tally, plansHeld: st.tally.plansHeld + 1 } : st.tally,
        };
      });
      track('plan_outcome', { held: outcome === 0 });
    },
    [state.planOutcomes],
  );

  const setGoal = useCallback(
    (input: { id?: string; name: string; target: number | null }) => {
      const name = input.name.trim().slice(0, 60);
      if (!name) return;
      const target =
        typeof input.target === 'number' &&
        Number.isFinite(input.target) &&
        input.target > 0 &&
        input.target <= MAX_DOLLARS
          ? Math.round(input.target)
          : null;
      const known = !!input.id && state.goals.some((g) => g.id === input.id);
      const id = known ? input.id! : `g${Date.now().toString(36)}`;
      setState((st) => {
        const goal: Goal = { id, name, target };
        let goals: Goal[];
        if (st.goals.some((g) => g.id === id)) goals = st.goals.map((g) => (g.id === id ? goal : g));
        // Free keeps one goal: a new one takes its place.
        else if (!isPremium && st.goals.length) goals = [goal, ...st.goals.slice(1)];
        else goals = [...st.goals, goal].slice(0, MAX_GOALS);
        // Celebrations start from where each goal stands now, so a goal set
        // already half full does not throw a 50% moment the second it exists.
        const seen: Record<string, GoalCheckpoint> = {};
        for (const it of allocateGoals(isPremium ? goals : goals.slice(0, 1), keptNow)) {
          seen[it.goal.id] = it.checkpoint;
        }
        return { ...st, goals, goalCheckpointsSeen: seen };
      });
      track('goal_set', { has_target: target != null, is_new: !known });
    },
    [state.goals, isPremium, keptNow],
  );

  const removeGoal = useCallback((id: string) => {
    setState((st) => {
      if (!st.goals.some((g) => g.id === id)) return st;
      const { [id]: _gone, ...seen } = st.goalCheckpointsSeen;
      return { ...st, goals: st.goals.filter((g) => g.id !== id), goalCheckpointsSeen: seen };
    });
    track('goal_removed');
  }, []);

  const markGoalCheckpointSeen = useCallback((goalId: string, checkpoint: GoalCheckpoint) => {
    setState((st) =>
      (st.goalCheckpointsSeen[goalId] ?? 0) >= checkpoint || !st.goals.some((g) => g.id === goalId)
        ? st
        : { ...st, goalCheckpointsSeen: { ...st.goalCheckpointsSeen, [goalId]: checkpoint } },
    );
  }, []);

  const logMoved = useCallback((amount: number) => {
    if (!(typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount <= MAX_DOLLARS)) return;
    const entry: MovedEntry = { at: new Date().toISOString(), amount: Math.round(amount * 100) / 100 };
    setState((st) => ({ ...st, moved: [...st.moved, entry].slice(-MAX_MOVED) }));
    // Never the amount.
    track('money_moved');
  }, []);

  const startComeback = useCallback(() => {
    const day = localDayKey();
    setState((st) => ({ ...st, comebackStartedDay: day, comebackDone: [] }));
    track('comeback_started');
  }, []);

  const markComebackDay = useCallback(
    (day: DayKey) => {
      const start = state.comebackStartedDay;
      if (!start || !isDayKey(day)) return;
      const n = daysBetween(start, day);
      if (n < 0 || n > 7 || state.comebackDone.includes(day)) return;
      setState((st) =>
        st.comebackDone.includes(day) ? st : { ...st, comebackDone: [...st.comebackDone, day].sort() },
      );
      track('comeback_day', { n });
    },
    [state.comebackStartedDay, state.comebackDone],
  );

  const rateSleep = useCallback((night: DayKey, rating: SleepRating) => {
    if (!isDayKey(night) || (rating !== 1 && rating !== 2 && rating !== 3)) return;
    setState((st) => ({ ...st, sleep: trimDays({ ...st.sleep, [night]: rating }, localDayKey()) }));
    track('sleep_rated');
  }, []);

  const closeNight = useCallback(
    (opts: { sleep?: SleepRating } = {}) => {
      // Before 4am it is still last night - but never a night before this run
      // began, which would count a day the person had not been clean for.
      const night = closeoutDay(new Date(), state.quitDate);
      const isNew = !state.nightsClosed.includes(night);
      if (isNew) {
        setState((st) =>
          st.nightsClosed.includes(night)
            ? st
            : {
                ...st,
                nightsClosed: [...st.nightsClosed, night].sort().slice(-CLOSEOUT_WINDOW_DAYS),
                tally: { ...st.tally, nightsClosed: st.tally.nightsClosed + 1 },
              },
        );
        track('lights_out_completed');
      }
      // Lights out doubles as the close-out, so one ritual replaces two.
      closeDayOn(night, 'clean');
      if (opts.sleep) rateSleep(addDays(night, -1), opts.sleep);
    },
    [state.nightsClosed, state.quitDate, closeDayOn, rateSleep],
  );

  const logRep = useCallback((patternId?: PatternId | null, _repId?: string) => {
    const day = localDayKey();
    const pattern = patternId && PATTERN_IDS.includes(patternId) ? patternId : null;
    setState((st) => ({
      ...st,
      repsDone: st.repsDone + 1,
      lastRepDay: day,
      // The first pattern practised becomes the panic screen's go-to.
      favouritePattern: st.favouritePattern ?? pattern,
    }));
    // Whether it was a breathing rep; no rep id (counts and booleans only).
    track('rep_completed', { breathing: pattern != null });
  }, []);

  const setFavouritePattern = useCallback((id: PatternId | null) => {
    const next = id && PATTERN_IDS.includes(id) ? id : null;
    setState((st) => (st.favouritePattern === next ? st : { ...st, favouritePattern: next }));
  }, []);

  const logCleanGame = useCallback(
    (gameId: string | null, outcome: 'watched' | 'skipped', forDay?: DayKey) => {
      if (outcome !== 'watched' && outcome !== 'skipped') return;
      const day = closableDay(forDay, localDayKey());
      const id = (gameId ?? '').trim().slice(0, 128) || `manual-${day}`;
      const known = state.cleanGames.some((g) => g.gameId === id);
      setState((st) => {
        const i = st.cleanGames.findIndex((g) => g.gameId === id);
        if (i >= 0) {
          if (st.cleanGames[i].outcome === outcome) return st;
          const cleanGames = [...st.cleanGames];
          cleanGames[i] = { ...cleanGames[i], outcome };
          return { ...st, cleanGames };
        }
        return {
          ...st,
          cleanGames: [...st.cleanGames, { gameId: id, day, outcome }].slice(-MAX_CLEAN_GAMES),
          tally: { ...st.tally, gamesClean: st.tally.gamesClean + 1 },
        };
      });
      // Both answers are clean; no team, league or game id.
      if (!known) track('game_final', { clean: true, manual: gameId == null });
    },
    [state.cleanGames],
  );

  const setUrgeFollowUp = useCallback((at: string | null) => {
    const t = at ? Date.parse(at) : NaN;
    const next = Number.isFinite(t) && t > Date.now() ? new Date(t).toISOString() : null;
    setState((st) => {
      // Asking for one on the panic screen is the opt-in, so the switch in
      // You shows it on. Set here rather than through setReminderPrefs: that
      // fires settings_reminders, which reaches PostHog, and a settings event
      // timed to the end of a panic session would tell a third party about
      // the session. urge_followup (first party only) is the one event.
      const optIn = next != null && !st.reminderPrefs.types.followUp;
      if (st.urgeFollowUpAt === next && !optIn) return st;
      return {
        ...st,
        urgeFollowUpAt: next,
        reminderPrefs: optIn
          ? { ...st.reminderPrefs, types: { ...st.reminderPrefs.types, followUp: true } }
          : st.reminderPrefs,
      };
    });
    track('urge_followup', { on: next != null });
  }, []);

  const { hidesBetting: _hidesBetting, ...publicDerived } = derived;

  const value: AppState = {
    ...state,
    ...publicDerived,
    ...streakDerived,
    ready,
    loadFailed,
    retryLoad,
    isPremium,
    refreshPremium,
    subscribed,
    storeChecked,
    trial,
    trialExpired,
    trialUnverified,
    freeWeekStarted,
    markTrialPromptShown,
    inFreeWeek,
    hardship,
    hardshipOffered,
    startHardship,
    hardshipNote,
    dismissHardshipNote,
    markMilestoneSeen,
    markDailyRead,
    discreetNotifications,
    setDiscreetNotifications,
    restoreAccount,
    abandonSignIn,
    setAnswer,
    commit,
    choosePlan,
    checkInToday,
    resetStreak,
    freezeStreak,
    restartOnboarding,
    eraseAllLocalData,
    setPartner,
    setTeams,
    closeDay,
    logUrgeWin,
    setReminderPrefs,
    markPrimed,
    refreshReminders,
    setLineCut,
    pickPlan,
    setPlanOutcome,
    setGoal,
    removeGoal,
    markGoalCheckpointSeen,
    logMoved,
    startComeback,
    markComebackDay,
    closeNight,
    rateSleep,
    logRep,
    setFavouritePattern,
    logCleanGame,
    setUrgeFollowUp,
    todayKey,
    closedToday,
    todayMark,
    lifetime,
    nextMilestone,
    week,
    todaysMove: move,
    todaysPlays,
    playContext,
    todayPlanItem,
    comebackDay,
    goalProgress,
    suggestedGoalName,
    keptNow,
    nextCutLine,
    cutLinesRemaining: openCutLines.length,
    cutLineMarkedToday: state.cutLinesLastDay === todayKey,
    todaysRep,
    repDoneToday: state.lastRepDay === todayKey,
    bigEvent,
    sleepConcern,
    scheduleInput,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
