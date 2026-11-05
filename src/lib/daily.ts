import type { DailyRead } from '@/state/dailyReads';

/**
 * The daily read: one short piece of the 28-day curriculum per day.
 *
 * Three rules, each load-bearing:
 *
 * - Progress is its own counter, never the streak day. A relapse resets the
 *   streak; it must not send someone back to "Day 1: urges pass" like a snake
 *   in a board game. The curriculum is something they build that a slip cannot
 *   touch, exactly like the money figure.
 * - It advances only when read. Someone who skips four days comes back to the
 *   next unread piece, not a backlog of four and not a guilt banner. The app
 *   waits; it does not keep score of absences.
 * - One per local day. The point is a daily rhythm, not a binge; a reader who
 *   finishes one sees tomorrow's tease, and tomorrow it is there.
 */

export interface DailyProgress {
  /** How many reads have been completed, ever. */
  index: number;
  /** Local day key ("YYYY-MM-DD") of the most recent read, or null. */
  lastReadDay: string | null;
}

export interface TodaysRead {
  item: DailyRead;
  /** Which pass through the curriculum this is, 1-based. */
  pass: number;
  /** Day number shown to the user, 1-28 within the pass. */
  dayNumber: number;
  /** Whether today's read has already been completed. */
  readToday: boolean;
}

/**
 * What the Home card and the daily screen should show right now.
 * Pure, so the one-per-day and cycling rules are provable.
 */
export function todaysRead(
  progress: DailyProgress,
  todayKey: string,
  content: readonly DailyRead[],
): TodaysRead | null {
  if (!content.length) return null;
  // The index is persisted, so treat it as hostile: a corrupted negative or
  // non-integer value would index past the array and hand `undefined` to a
  // screen that immediately reads .title off it.
  const rawIndex = Number.isFinite(progress.index) ? Math.max(0, Math.trunc(progress.index)) : 0;
  progress = { ...progress, index: rawIndex };
  const readToday = progress.lastReadDay === todayKey;
  // After reading, index points at the NEXT item; the card should keep showing
  // the one they read until midnight, not tomorrow's spoiler.
  const effective = readToday ? Math.max(0, progress.index - 1) : progress.index;
  return {
    item: content[effective % content.length],
    pass: Math.floor(effective / content.length) + 1,
    dayNumber: (effective % content.length) + 1,
    readToday,
  };
}

/**
 * Advance after a completed read. Idempotent within a day: reading the same
 * piece twice, or re-opening it from the "done" card, advances nothing.
 */
export function advanceProgress(progress: DailyProgress, todayKey: string): DailyProgress {
  if (progress.lastReadDay === todayKey) return progress;
  return { index: progress.index + 1, lastReadDay: todayKey };
}

export interface TodaysMove {
  /** Day number shown to the user, 1-28 within the pass. */
  dayNumber: number;
  /** The protective action on its own: `freeAction ?? action`. */
  text: string;
  /** Playbook play that goes with it (free), or empty string. */
  playId: string;
  /** One-tap partner SMS body, when the move is "text your person". */
  partnerText: string | null;
  /** Whether today's piece has already been completed. */
  readToday: boolean;
  /** The full read, for Premium surfaces. */
  item: DailyRead;
}

/**
 * Today's move: the day's protective action without the read around it.
 *
 * Free for everyone. The action - delete the apps, self-exclude, tell one
 * person - is the part that protects someone, so it is not paywalled; the
 * one-minute read that explains it is what Premium adds. Same curriculum
 * position and same one-per-day rule as the read, so there is one counter,
 * whichever way the day is completed.
 */
export function todaysMove(
  progress: DailyProgress,
  todayKey: string,
  content: readonly DailyRead[],
): TodaysMove | null {
  const read = todaysRead(progress, todayKey, content);
  if (!read) return null;
  const { item } = read;
  return {
    dayNumber: read.dayNumber,
    text: item.freeAction ?? item.action,
    playId: item.playId,
    partnerText: item.partnerText ?? null,
    readToday: read.readToday,
    item,
  };
}
