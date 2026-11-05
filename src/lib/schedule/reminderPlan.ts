import { addDays, type DayKey, dayKeyToDate, daysBetween, localDayKey } from '@/lib/day';
import {
  comebackLine,
  dayNumberAt,
  epochDay,
  eveningLine,
  followUpLine,
  goalLine,
  halftimeLine,
  inSeason,
  lightsOutLine,
  type Line,
  type LineProfile,
  milestoneEveLine,
  milestoneLine,
  type MorningFocus,
  morningLine,
  nudgeWeekday,
  paydayLine,
  postGameLine,
  preGameLine,
  profileFrom,
  recapLine,
  returnLine,
  type SportKey,
  weeklyGameLine,
} from '@/lib/lineBank';
import type { CachedGame, ScheduleInput, TimeOfDay } from '@/lib/scheduleInput';
import { activeBigEvent } from '@/state/bigEvents';
import { type Milestone, milestonesThrough } from '@/state/milestones';
import { type AnswerMap, TRIGGER_PAYDAY, TRIGGER_TEAMS_PLAYING } from '@/state/quiz-data';
import type { League } from './ScheduleProvider';

/**
 * The reminder schedule, worked out as plain data.
 *
 * No native calls and no storage here: notifications.ts fetches games, then
 * asks this module what to queue and hands the answer to the OS. Keeping the
 * decision pure is what lets scripts/check-copy.mjs run the real engine over
 * sample profiles, a daylight-saving change and a few weeks of dates.
 *
 * How a schedule is built:
 *  1. Candidates. Every reminder the person could get over the next
 *     HORIZON_DAYS, each with a time, copy, the screen it opens and a
 *     priority. Times are built from calendar days and the wall clock
 *     (new Date(y, m, d, hh, mm)), never by adding 24h, so 9:00 stays 9:00
 *     across a daylight-saving change.
 *  2. Slots. The morning and the evening are one slot each: a milestone,
 *     payday or comeback morning takes the morning's place rather than
 *     arriving next to it. Lights out, and a post-game push for a game ending
 *     in the evening, take the evening close-out's place.
 *  3. A cap of MAX_PER_DAY a local day, highest priority kept - except that
 *     each day's evening push (the close-out, or whatever took its place) is
 *     always kept, so a busy game day never ends with no evening at all.
 *  4. A budget of MAX_PENDING in total (iOS keeps at most 64 per app), the
 *     furthest-out, lowest-priority ones dropped first. They come back on the
 *     next rebuild, which runs on every foreground.
 */

export type ReminderKind =
  | 'morning'
  | 'closeout'
  | 'recap'
  | 'milestone'
  | 'milestone-eve'
  | 'goal'
  | 'payday'
  | 'lights-out'
  | 'comeback'
  | 'game-pre'
  | 'game-half'
  | 'game-post'
  | 'weekly-game'
  | 'follow-up'
  | 'return';

/** Android channel. Created in notifications.ts before anything is queued. */
export type ReminderChannel = 'reminders' | 'game-day';

export interface PlannedReminder {
  at: Date;
  title: string;
  body: string;
  /** The route the tap opens (one of REMINDER_ROUTES, with its params). */
  url: string;
  kind: ReminderKind;
  priority: number;
  channel: ReminderChannel;
  /** 'm:<day>' or 'e:<day>' when it competes for the morning or evening slot. */
  slot: string | null;
}

/** Days of dated reminders queued at once. Rebuilt on every foreground. */
export const HORIZON_DAYS = 14;
export const MAX_PER_DAY = 3;
/** iOS keeps 64 pending per app; this leaves room and matches the plan. */
export const MAX_PENDING = 50;
/** How far ahead saved teams' games are read. */
export const GAME_LOOKAHEAD_DAYS = 7;
/** Games scheduled at most, nearest first. */
export const MAX_GAMES = 6;
/** The sparse "door is open" pair, days after the last rebuild (= last open). */
export const RETURN_AFTER_DAYS = [21, 30];

/**
 * Which reminder survives when two want the same day's last place:
 * game > follow-up > late night > comeback > payday > milestone > weekly >
 * rhythm. Goal checkpoints sit with milestones.
 */
export const PRIORITY: Record<ReminderKind, number> = {
  'game-pre': 8,
  'game-half': 8,
  'game-post': 8,
  'follow-up': 7,
  'lights-out': 6,
  comeback: 5,
  payday: 4,
  milestone: 3,
  'milestone-eve': 3,
  goal: 3,
  'weekly-game': 2,
  recap: 1,
  morning: 1,
  closeout: 1,
  return: 0,
};

/**
 * The coarse type sent with notification_opened. That event may reach
 * PostHog, so it never says which quiz trigger a reminder serves, that a slip
 * happened or that there was an urge: payday and comeback mornings are just
 * "morning", lights out is just "evening", and the opt-in check-in after a
 * long panic session is "morning" too - a type of its own would tell a third
 * party that this person had a panic session an hour earlier. The exact kind
 * stays first party (reminder_opened).
 */
export type ReminderAnalyticsType = 'morning' | 'evening' | 'milestone' | 'game' | 'return';

export function analyticsType(kind: ReminderKind): ReminderAnalyticsType {
  switch (kind) {
    case 'closeout':
    case 'recap':
    case 'lights-out':
      return 'evening';
    case 'milestone':
    case 'milestone-eve':
    case 'goal':
      return 'milestone';
    case 'game-pre':
    case 'game-half':
    case 'game-post':
      return 'game';
    case 'return':
      return 'return';
    default:
      return 'morning';
  }
}

// ---------------------------------------------------------------------------
// Routes a reminder may open
// ---------------------------------------------------------------------------

const PARAM_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Every path a reminder can name, with the params each accepts. */
export const REMINDER_ROUTES: Record<string, Record<string, RegExp>> = {
  '/(tabs)': {},
  '/(tabs)/streak': {},
  '/(tabs)/insights': { play: PARAM_ID },
  '/(tabs)/you': {},
  '/daily': {},
  // A halftime tap may land in a bar or a stand: panic can start muted.
  '/panic': { voice: /^off$/ },
  '/closeout': { game: PARAM_ID, recap: /^1$/ },
  '/plan': {},
  '/recap': {},
  '/goal': {},
  '/cut-lines': {},
  '/comeback': {},
  '/lights-out': {},
  '/rep': { id: PARAM_ID },
};

export interface ReminderRoute {
  pathname: string;
  params: Record<string, string>;
}

/**
 * Parse and check a reminder's url. Anything that is not a known route with
 * known, well-formed params is refused (null), so a notification can only
 * ever open a screen this list names.
 */
export function parseReminderUrl(url: unknown): ReminderRoute | null {
  if (typeof url !== 'string' || url.length > 200) return null;
  const q = url.indexOf('?');
  const pathname = q < 0 ? url : url.slice(0, q);
  const allowed = REMINDER_ROUTES[pathname];
  if (!allowed) return null;
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const part of url.slice(q + 1).split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      let k: string;
      let v: string;
      try {
        k = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
        v = decodeURIComponent(eq < 0 ? '' : part.slice(eq + 1));
      } catch {
        return null;
      }
      const rule = allowed[k];
      if (!rule || !rule.test(v)) return null;
      params[k] = v;
    }
  }
  return { pathname, params };
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Local wall-clock time on a calendar day. DST-safe by construction. */
export function atTime(key: DayKey, t: TimeOfDay): Date {
  const d = dayKeyToDate(key);
  d.setHours(t.hour, t.minute, 0, 0);
  return d;
}

/** Game pushes stay out of the night: nothing between 23:30 and 07:00. */
function quietHours(d: Date): boolean {
  const h = d.getHours();
  return h < 7 || (h === 23 && d.getMinutes() >= 30);
}

const list = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

/** The first milestone whose day number is crossed between two slot times. */
function crossedBetween(ms: Milestone[], before: number, after: number, seen: number): Milestone | null {
  let hit: Milestone | null = null;
  for (const m of ms) if (m.days > before && m.days <= after && m.days > seen) hit = m;
  return hit;
}

/** Nudge-day sport for the weekly game-day push on this date, if any. */
function nudgeSport(profile: LineProfile, key: DayKey): SportKey | null | undefined {
  const wd = dayKeyToDate(key).getDay();
  if (!profile.sports.length) return wd === 6 ? null : undefined;
  const order: SportKey[] = ['nfl', 'ncaaf', 'ncaab', 'soccer', 'fights', 'nba', 'nhl', 'mlb'];
  for (const s of order) {
    if (profile.sports.includes(s) && nudgeWeekday(s) === wd && inSeason(s, key)) return s;
  }
  return undefined;
}

/**
 * What the ordinary morning asks for. Deterministic by day: a big event's
 * prep in its run-up, a Cut-the-lines task on alternate days of the first
 * two weeks, otherwise today's play most days, with the day's move and a
 * two-minute rep in between.
 */
function morningFocus(
  key: DayKey,
  dayNumber: number,
  input: ScheduleInput,
  isToday: boolean,
  eventPrep: boolean,
): MorningFocus {
  if (eventPrep) return 'event';
  if (dayNumber < 14 && input.cutLinesRemaining > 0 && dayNumber % 2 === 1) return 'cut';
  const f: MorningFocus[] = ['plan', 'move', 'plan', 'rep'];
  const focus = f[((epochDay(key) % 4) + 4) % 4];
  // Nothing to pick if today's play is already pinned.
  if (focus === 'plan' && isToday && input.todayPlanSet) return 'move';
  return focus;
}

/** Home puts the big-game prep card first on prep days, so 'event' lands on it. */
const FOCUS_URL: Record<MorningFocus, string> = {
  plan: '/plan',
  planSet: '/(tabs)',
  move: '/daily',
  rep: '/rep',
  cut: '/cut-lines',
  event: '/(tabs)',
};

/**
 * Every candidate reminder for the horizon, before slots, the daily cap and
 * the budget are applied. `games` are saved teams' upcoming games (only used
 * when game-day automation is on and the user is Premium).
 */
export function buildCandidates(input: ScheduleInput, games: CachedGame[], now: Date = new Date()): PlannedReminder[] {
  const quit = input.quitDate;
  if (!quit || !Number.isFinite(Date.parse(quit))) return [];
  const nowMs = now.getTime();
  const today = localDayKey(now);
  const { prefs, discreet } = input;
  const types = prefs.types;
  const answers: AnswerMap = input.answers;
  const teamLeagues = input.teams.map((t) => t.league as League);
  const profile = profileFrom(answers, teamLeagues);
  const triggers = list(answers.triggers);
  const sportsIdx = list(answers.sports);
  const autoGames = input.isPremium && types.gameDay && input.teams.length > 0;
  const goalName = input.goal?.name ?? null;

  const out: PlannedReminder[] = [];
  const add = (
    kind: ReminderKind,
    at: Date,
    copy: Line,
    url: string,
    slot: string | null,
    channel: ReminderChannel = 'reminders',
  ) => {
    if (!Number.isFinite(at.getTime()) || at.getTime() <= nowMs + 5_000) return;
    out.push({ at, title: copy.title, body: copy.body, url, kind, priority: PRIORITY[kind], channel, slot });
  };

  const lastKey = addDays(today, HORIZON_DAYS);
  const milestones = milestonesThrough(dayNumberAt(quit, atTime(lastKey, { hour: 23, minute: 59 })) + 1);
  let milestoneIndex = 0;

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const key = addDays(today, i);
    const prevKey = addDays(key, -1);
    const isToday = i === 0;
    const morningAt = atTime(key, prefs.morning);
    const eveningAt = atTime(key, prefs.evening);
    const nMorning = dayNumberAt(quit, morningAt);
    const nPrevMorning = dayNumberAt(quit, atTime(prevKey, prefs.morning));
    const weekday = dayKeyToDate(key).getDay();
    const mSlot = `m:${key}`;
    const eSlot = `e:${key}`;

    // --- Morning slot --------------------------------------------------
    const event = activeBigEvent(key, sportsIdx, teamLeagues);
    if (types.rhythm) {
      const focus = morningFocus(key, nMorning, input, isToday, event?.phase === 'prep');
      const upcoming = milestones.find((m) => m.days > nMorning) ?? null;
      const copy = morningLine({
        key,
        dayNumber: nMorning,
        profile,
        discreet,
        focus,
        bigEvent: event,
        next: upcoming ? { title: upcoming.title, inDays: upcoming.days - nMorning, days: upcoming.days } : null,
      });
      add('morning', morningAt, copy, FOCUS_URL[focus], mSlot);
    }

    if (types.milestones) {
      const m = crossedBetween(milestones, nPrevMorning, nMorning, input.lastMilestoneSeen);
      if (m) add('milestone', morningAt, milestoneLine(m, milestoneIndex++, discreet), '/(tabs)', mSlot);
    }

    const date = dayKeyToDate(key).getDate();
    if (types.payday && triggers.includes(TRIGGER_PAYDAY) && (date === 1 || date === 15)) {
      add('payday', morningAt, paydayLine(key, discreet ? null : goalName, discreet), '/plan', mSlot);
    }

    if (types.comeback && input.comebackStartedDay) {
      const n = daysBetween(input.comebackStartedDay, key);
      if (n >= 1 && n <= 7) add('comeback', morningAt, comebackLine(n, discreet), '/comeback', mSlot);
    }

    // The weekly game-day nudge, for anyone whose games are not scheduled one
    // by one: no saved teams, not Premium, or game-day turned off.
    if (types.weekly && !autoGames && triggers.includes(TRIGGER_TEAMS_PLAYING)) {
      const sport = nudgeSport(profile, key);
      if (sport !== undefined) {
        add('weekly-game', morningAt, weeklyGameLine(sport, key, discreet), '/plan', mSlot);
      }
    }

    // --- Evening slot --------------------------------------------------
    // Quiet once the day's job is done: no close-out ask after a close-out.
    // The Sunday recap is the Weekly switch's own push, so it goes out with
    // the rhythm switched off too.
    const eveningOpen = !(isToday && input.closedToday);
    if (eveningOpen) {
      if (weekday === 0 && types.weekly) {
        add('recap', eveningAt, recapLine(key, discreet), '/closeout?recap=1', eSlot);
      } else if (types.rhythm) {
        add('closeout', eveningAt, eveningLine(key, profile, discreet), '/closeout', eSlot);
      }
    }

    // The milestone that lands on the count between this morning and the
    // next. Only while it is still ahead tonight, and not for the first few
    // days, when the evening is busy enough already.
    const nextMorning = dayNumberAt(quit, atTime(addDays(key, 1), prefs.morning));
    const eve = types.milestones
      ? crossedBetween(milestones, nMorning, nextMorning, input.lastMilestoneSeen)
      : null;
    const eveMilestone = eve && eve.days >= 3 ? eve : null;
    if (eveMilestone && eveningOpen && dayNumberAt(quit, eveningAt) < eveMilestone.days) {
      add('milestone-eve', eveningAt, milestoneEveLine(eveMilestone, discreet), '/closeout', eSlot);
    }

    // Lights out doubles as the close-out for late-night users. A time after
    // midnight belongs to this day's night, so it lands on the next date.
    // Gone once tonight's has been done; Friday and Saturday nights can be
    // switched off on their own. Since it takes the evening's only place, it
    // also carries the Sunday recap and a milestone eve.
    const weekendNight = weekday === 5 || weekday === 6;
    if (
      types.lateNight &&
      input.lateNightUser &&
      !(isToday && input.nightClosedToday) &&
      (types.lateNightWeekends || !weekendNight)
    ) {
      const lateAt = atTime(prefs.lateNight.hour < 12 ? addDays(key, 1) : key, prefs.lateNight);
      const copy = lightsOutLine(key, profile, discreet, {
        recap: weekday === 0 && types.weekly,
        milestone: eveMilestone && dayNumberAt(quit, lateAt) < eveMilestone.days ? eveMilestone : null,
      });
      add('lights-out', lateAt, copy, '/lights-out', `n:${key}`);
    }
  }

  // --- Game day (Premium, saved teams) ------------------------------------
  if (autoGames) {
    const horizonMs = nowMs + GAME_LOOKAHEAD_DAYS * 86_400_000;
    const upcoming = games
      .map((g) => ({ g, start: new Date(g.startsAt) }))
      .filter(({ start }) => Number.isFinite(start.getTime()) && start.getTime() > nowMs - 4 * 3_600_000)
      .filter(({ start }) => start.getTime() <= horizonMs)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, MAX_GAMES);
    upcoming.forEach(({ g, start }, index) => {
      const copyInput = {
        league: g.league,
        homeName: g.homeName,
        awayName: g.awayName,
        startsAt: start,
        index,
      };
      const pre = new Date(start.getTime() - 60 * 60_000);
      if (!quietHours(pre)) add('game-pre', pre, preGameLine(copyInput, discreet), '/plan', null, 'game-day');

      const half = g.estimatedHalftimeAt ? new Date(g.estimatedHalftimeAt) : null;
      if (half && !quietHours(half)) {
        add('game-half', half, halftimeLine(copyInput, discreet), '/panic?voice=off', null, 'game-day');
      }

      const end = g.estimatedEndAt ? new Date(g.estimatedEndAt) : null;
      if (end && !quietHours(end)) {
        const endKey = localDayKey(end);
        const mins = end.getHours() * 60 + end.getMinutes();
        // An evening final stands in for that night's close-out - unless the
        // day is already closed, when it only asks about the game.
        const replacesEvening =
          mins >= 19 * 60 && mins <= 23 * 60 + 30 && !(endKey === today && input.closedToday);
        const url = /^[A-Za-z0-9_-]{1,64}$/.test(g.id)
          ? `/closeout?game=${encodeURIComponent(g.id)}`
          : '/closeout';
        add(
          'game-post',
          end,
          postGameLine(copyInput, replacesEvening, discreet),
          url,
          replacesEvening ? `e:${endKey}` : null,
          'game-day',
        );
      }
    });
  }

  // --- One-offs -----------------------------------------------------------
  if (types.followUp && input.urgeFollowUpAt) {
    add('follow-up', new Date(input.urgeFollowUpAt), followUpLine(discreet), '/panic', null);
  }

  // Goal checkpoints: the morning the estimate crosses 25/50/75/100%. Named,
  // never an amount, and never in discreet mode. The amounts here only decide
  // WHEN, and go no further than this function.
  const target = input.goal?.target ?? null;
  if (types.milestones && !discreet && goalName && target && target > 0 && input.dailyRate > 0) {
    for (const cp of [25, 50, 75, 100] as const) {
      const need = (target * cp) / 100 - input.keptNow;
      if (need <= 0) continue;
      const crossAt = nowMs + (need / input.dailyRate) * 86_400_000;
      let key = localDayKey(new Date(crossAt));
      if (atTime(key, prefs.morning).getTime() < crossAt) key = addDays(key, 1);
      if (daysBetween(today, key) >= HORIZON_DAYS) break;
      add('goal', atTime(key, prefs.morning), goalLine(goalName, cp, false), '/goal', `m:${key}`);
    }
  }

  // The door stays open: two quiet reminders weeks out, pushed further back
  // by every open, so only someone who has stopped opening the app gets them.
  if (types.rhythm) {
    RETURN_AFTER_DAYS.forEach((d, n) => {
      add('return', atTime(addDays(today, d), prefs.morning), returnLine(n, discreet), '/(tabs)', null);
    });
  }

  return out;
}

/** The evening a reminder stands in for ('e:<day>'): lights out and an evening final. */
function eveningReplaced(c: PlannedReminder): string | null {
  if (c.kind === 'lights-out' && c.slot?.startsWith('n:')) return `e:${c.slot.slice(2)}`;
  if (c.kind === 'game-post' && c.slot?.startsWith('e:')) return c.slot;
  return null;
}

/**
 * Slots, then the per-day cap, then the total budget. Returns the reminders
 * to queue, in time order.
 */
export function resolveReminders(candidates: PlannedReminder[]): PlannedReminder[] {
  // One morning and one evening a day, highest priority kept. Lights out and
  // evening finals are set aside: they replace the evening rather than
  // compete for it.
  const bySlot = new Map<string, PlannedReminder>();
  const free: PlannedReminder[] = [];
  const replacing = new Map<string, PlannedReminder[]>();
  for (const c of candidates) {
    const evening = eveningReplaced(c);
    if (evening) {
      replacing.set(evening, [...(replacing.get(evening) ?? []), c]);
      free.push(c);
      continue;
    }
    if (!c.slot) {
      free.push(c);
      continue;
    }
    const held = bySlot.get(c.slot);
    if (!held || c.priority > held.priority) bySlot.set(c.slot, c);
  }

  // Each evening keeps exactly one push through the daily cap: lights out
  // (the ritual) or the first evening final where one took the close-out's
  // place, otherwise the close-out itself. Without this, a day full of game
  // pushes could cap away the replacement after the close-out had already
  // been dropped for it, and the evening would have nothing.
  const anchors = new Set<PlannedReminder>();
  for (const [slot, rs] of replacing) {
    bySlot.delete(slot);
    const lights = rs.find((r) => r.kind === 'lights-out');
    anchors.add(lights ?? [...rs].sort((a, b) => a.at.getTime() - b.at.getTime())[0]);
  }
  for (const [slot, c] of bySlot) if (slot.startsWith('e:')) anchors.add(c);
  const merged = [...free, ...bySlot.values()];

  // At most MAX_PER_DAY on any local day: the evening anchors first, then
  // highest priority, then earliest.
  const byDay = new Map<DayKey, PlannedReminder[]>();
  for (const c of merged) {
    const k = localDayKey(c.at);
    const day = byDay.get(k) ?? [];
    day.push(c);
    byDay.set(k, day);
  }
  const rank = (c: PlannedReminder) => (anchors.has(c) ? 1 : 0);
  const capped: PlannedReminder[] = [];
  for (const day of byDay.values()) {
    day.sort((a, b) => rank(b) - rank(a) || b.priority - a.priority || a.at.getTime() - b.at.getTime());
    capped.push(...day.slice(0, MAX_PER_DAY));
  }

  // The budget. The two far-out return reminders are kept; beyond that the
  // lowest priority goes first, furthest out first.
  capped.sort((a, b) => a.at.getTime() - b.at.getTime());
  const reserved = capped.filter((c) => c.kind === 'return');
  const rest = capped.filter((c) => c.kind !== 'return');
  const room = MAX_PENDING - reserved.length;
  if (rest.length > room) {
    const drop = [...rest]
      .sort((a, b) => a.priority - b.priority || b.at.getTime() - a.at.getTime())
      .slice(0, rest.length - room);
    const dropped = new Set(drop);
    return [...rest.filter((c) => !dropped.has(c)), ...reserved].sort((a, b) => a.at.getTime() - b.at.getTime());
  }
  return capped;
}

/** The whole plan: candidates, slots, cap, budget. */
export function planReminders(input: ScheduleInput, games: CachedGame[], now: Date = new Date()): PlannedReminder[] {
  return resolveReminders(buildCandidates(input, games, now));
}
