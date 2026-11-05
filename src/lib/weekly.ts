import { addDays, type DayKey, dayKeyToDate, localDayKey, weekStartKey } from './day';
import { type TriggerEntry, TRIGGER_PLAY, TRIGGER_OPTIONS } from './triggers';
import type { UrgeWin } from './urgeWins';

/**
 * The week so far, filled in one close-out at a time (hook 8).
 *
 * Pure and on-device: counts of what the user did this week, Monday to
 * Sunday. It leads with what was kept and logged. A slip is a neutral count,
 * never a grade, and blank days are simply blank - they are not counted,
 * coloured or called missed.
 */

export type CloseoutMark = 0 | 1 | 2;
export type PlanOutcome = 0 | 1 | 2;

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface WeekDay {
  key: DayKey;
  /** 'Mon' ... 'Sun'. */
  label: string;
  /** 0 clean, 1 close call beaten, 2 slip, null nothing logged (never "missed"). */
  mark: CloseoutMark | null;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekInput {
  closeouts: Record<DayKey, CloseoutMark>;
  urgeWins: UrgeWin[];
  triggerLog: TriggerEntry[];
  /** ISO times of slips absorbed by a streak freeze. */
  slips: string[];
  dailyRate: number;
  /** ISO start of the current run. */
  quitDate: string | null;
  planOutcomes: Record<DayKey, PlanOutcome>;
  nightsClosed: DayKey[];
  cleanGames: { gameId: string; day: DayKey; outcome: 'watched' | 'skipped' }[];
  now: number;
}

export interface WeekSummary {
  /** Monday of this week. */
  start: DayKey;
  /** Sunday of this week. */
  end: DayKey;
  days: WeekDay[];
  cleanDays: number;
  closeCalls: number;
  /** Days this week with a logged slip. Neutral; shown with the way back. */
  slipDays: number;
  urgesRiddenOut: number;
  plansHeld: number;
  /** Days this week whose play got an answer (held, didn't come up, not today). */
  plansAnswered: number;
  nightsClosed: number;
  gamesWatchedClean: number;
  /**
   * Estimated money kept this week, from the current run only (a run reset
   * mid-week counts from the reset). An estimate, never shown as a balance.
   */
  moneyKept: number;
  /**
   * The trigger logged most this week and its play (Premium line: compare
   * with what they predicted). Null when nothing was logged.
   */
  topTrigger: { label: string; count: number; playId: string | null } | null;
  /** Today is Sunday: the recap day. */
  isRecapDay: boolean;
}

const DAY_MS = 86_400_000;

export function computeWeek(input: WeekInput): WeekSummary {
  const today = localDayKey(new Date(input.now));
  const start = weekStartKey(today);
  const end = addDays(start, 6);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const inWeek = (k: DayKey) => k >= start && k <= end;
  const inWeekIso = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && inWeek(localDayKey(new Date(t)));
  };

  const days: WeekDay[] = keys.map((key, i) => ({
    key,
    label: DAY_SHORT[i],
    mark: input.closeouts[key] ?? null,
    isToday: key === today,
    isFuture: key > today,
  }));

  const slipDaySet = new Set(keys.filter((k) => input.closeouts[k] === 2));
  for (const s of input.slips) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) {
      const k = localDayKey(new Date(t));
      if (inWeek(k)) slipDaySet.add(k);
    }
  }

  const planDays = keys.filter((k) => input.planOutcomes[k] != null);

  // Money: the part of this week that falls inside the current run.
  const weekStartMs = dayKeyToDate(start).getTime();
  const runStart = input.quitDate ? Date.parse(input.quitDate) : NaN;
  const from = Number.isFinite(runStart) ? Math.max(weekStartMs, runStart) : input.now;
  const moneyKept = Math.max(0, (input.now - from) / DAY_MS) * Math.max(0, input.dailyRate);

  const counts = new Map<string, number>();
  for (const e of input.triggerLog) {
    if (e.kind === 'urge' && inWeekIso(e.at)) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
  }
  let topTrigger: WeekSummary['topTrigger'] = null;
  for (const label of TRIGGER_OPTIONS) {
    const count = counts.get(label) ?? 0;
    if (count > 0 && (!topTrigger || count > topTrigger.count)) {
      topTrigger = { label, count, playId: TRIGGER_PLAY[label] ?? null };
    }
  }

  return {
    start,
    end,
    days,
    cleanDays: keys.filter((k) => input.closeouts[k] === 0 || input.closeouts[k] === 1).length,
    closeCalls: keys.filter((k) => input.closeouts[k] === 1).length,
    slipDays: slipDaySet.size,
    urgesRiddenOut: input.urgeWins.filter((w) => inWeekIso(w.at)).length,
    plansHeld: planDays.filter((k) => input.planOutcomes[k] === 0).length,
    plansAnswered: planDays.length,
    nightsClosed: input.nightsClosed.filter(inWeek).length,
    gamesWatchedClean: input.cleanGames.filter((g) => inWeek(g.day)).length,
    moneyKept,
    topTrigger,
    isRecapDay: dayKeyToDate(today).getDay() === 0,
  };
}
