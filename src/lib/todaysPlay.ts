import { addDays, daysBetween, type DayKey, dayKeyToDate, weekdayIndex } from './day';
import { type IfThenPlan, type PlanContext, PLANS } from '@/state/plans';
import { TRIGGER_DRINKING, TRIGGER_LATE_NIGHT, TRIGGER_PAYDAY } from '@/state/quiz-data';

/**
 * Today's play: three if-then plans for the day, chosen from what the app
 * already knows - the date, the user's own triggers, what they have logged,
 * and whether a saved team plays.
 *
 * Deterministic, never random: the same inputs on the same day give the same
 * three plans, so nothing here is a reveal or a pull-to-refresh lottery. The
 * rotation moves one step a day inside each pool, and a guard makes sure the
 * same three never come back two days running.
 */

export interface PlayContextInput {
  /** The quiz `triggers` answer (indexes 0-6). */
  triggers: number[];
  /** Most-logged urge trigger lately (TRIGGER_OPTIONS index), or null. */
  topLoggedTrigger: number | null;
  /** A saved team plays today, or the user said so by hand. */
  gameToday: boolean;
  /** Days into the current run. Under 14, stepping away is offered first. */
  daysClean: number;
}

export interface TodaysPlays {
  day: DayKey;
  context: PlanContext;
  /** Short in-app headline for the card, e.g. "Payday." Never pushed. */
  headline: string;
  /** Exactly three distinct plans. */
  plans: IfThenPlan[];
}

const HEADLINES: Record<PlanContext, string> = {
  game: 'Game today.',
  payday: 'Payday.',
  weekend: 'Weekend night.',
  lateNight: 'Late nights are the risk.',
  default: 'One plan for today.',
};

/** Early weeks lean on stepping away: skipping is as valid as sitting it out. */
const EARLY_DAYS = 14;
/** A fixed origin so the rotation index is stable across launches. */
const ORIGIN: DayKey = '2026-01-05';

/** The day's risk context, most specific first. */
export function contextFor(day: DayKey, input: PlayContextInput): PlanContext {
  if (input.gameToday) return 'game';
  const has = (t: number) => input.triggers.includes(t) || input.topLoggedTrigger === t;
  const date = dayKeyToDate(day).getDate();
  if ((date === 1 || date === 15) && has(TRIGGER_PAYDAY)) return 'payday';
  const wd = weekdayIndex(day);
  // Friday and Saturday nights, for people who said drinking is when it hits.
  if ((wd === 4 || wd === 5) && has(TRIGGER_DRINKING)) return 'weekend';
  if (has(TRIGGER_LATE_NIGHT)) return 'lateNight';
  return 'default';
}

function pickFrom(pool: IfThenPlan[], step: number, taken: Set<string>): IfThenPlan | null {
  if (!pool.length) return null;
  for (let k = 0; k < pool.length; k++) {
    const p = pool[(((step + k) % pool.length) + pool.length) % pool.length];
    if (!taken.has(p.id)) return p;
  }
  return null;
}

function rawPick(day: DayKey, input: PlayContextInput, bump = 0): IfThenPlan[] {
  const context = contextFor(day, input);
  const step = daysBetween(ORIGIN, day);
  const mine = new Set(input.triggers);
  if (input.topLoggedTrigger != null) mine.add(input.topLoggedTrigger);

  const contextPool = context === 'default' ? [] : PLANS.filter((p) => p.contexts.includes(context));
  const triggerPool = PLANS.filter(
    (p) => p.triggers.some((t) => mine.has(t)) && !contextPool.includes(p),
  );
  const anyDay = PLANS.filter((p) => p.contexts.includes('default'));
  const early = input.daysClean < EARLY_DAYS;
  const basePool = early ? PLANS.filter((p) => p.avoid) : anyDay;

  const taken = new Set<string>();
  const out: IfThenPlan[] = [];
  const add = (p: IfThenPlan | null) => {
    if (p && !taken.has(p.id)) {
      taken.add(p.id);
      out.push(p);
    }
  };
  // Slot 1: today's context, or else their own triggers.
  add(pickFrom(contextPool.length ? contextPool : triggerPool, step, taken));
  // Slot 2: their triggers (or more of the context when they have none).
  add(pickFrom(triggerPool.length ? triggerPool : contextPool, step + 1, taken));
  // Slot 3: early on a step-away plan, later an any-day plan. `bump` moves
  // only this slot, which is how the no-repeat guard gets a different triple.
  add(pickFrom(basePool, step + bump, taken));
  // Top up from any-day plans if a pool ran dry.
  for (let k = 0; out.length < 3 && k < anyDay.length; k++) add(pickFrom(anyDay, step + bump + k, taken));
  for (let k = 0; out.length < 3 && k < PLANS.length; k++) add(PLANS[k]);
  return out.slice(0, 3);
}

const sameSet = (a: IfThenPlan[], b: IfThenPlan[]) =>
  a.length === b.length && a.every((p) => b.some((q) => q.id === p.id));

/**
 * Three plans for `day`. Pure and deterministic. Yesterday is recomputed with
 * the same input, and if the set would repeat, the third slot moves on.
 */
export function pickPlays(day: DayKey, input: PlayContextInput): TodaysPlays {
  const context = contextFor(day, input);
  const yesterday = rawPick(addDays(day, -1), input);
  let plans = rawPick(day, input);
  for (let bump = 1; bump < PLANS.length && sameSet(plans, yesterday); bump++) {
    plans = rawPick(day, input, bump);
  }
  return { day, context, headline: HEADLINES[context], plans };
}
