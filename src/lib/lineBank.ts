import { type DayKey, dayKeyToDate } from './day';
import type { League } from './schedule/ScheduleProvider';
import type { ActiveBigEvent } from '@/state/bigEvents';
import { COMEBACK_WEEK } from '@/state/comebackWeek';
import type { Milestone } from '@/state/milestones';
import {
  type AnswerMap,
  TRIGGER_CHASING,
  TRIGGER_DRINKING,
  TRIGGER_LATE_NIGHT,
  TRIGGER_PAYDAY,
  TRIGGER_TEAMS_PLAYING,
} from '@/state/quiz-data';

/**
 * Every word Winback puts on a lock screen, written here and reviewed here.
 *
 * This replaces the AI-written notification lines. Nothing is generated at
 * runtime: each line is a fixed template, picked deterministically from the
 * date and the quiz answers, so the owner can read every possible push in
 * this one file before it ships. Nothing is random either - the same person
 * on the same date always gets the same line.
 *
 * House rules for anything added here:
 *  - Second person, calm, plain, sports language. The betting companies are
 *    the opponent, never the user. No shame, no loss framing ("don't blow
 *    it", "streak at risk"), no "we miss you".
 *  - Never a money amount, in any mode. Never scores, results, odds or any
 *    betting-market word as something to act on.
 *  - Milestones are invitations ("come mark it"), not claims: a push cannot
 *    know whether the day actually went clean.
 *  - Plain hyphens only.
 *  - Discreet copy (DISCREET_*) is neutral: no betting word, no day count, no
 *    team, no money, nothing about recovery. Someone reading the lock screen
 *    over a shoulder learns only that an app wants a check-in.
 *
 * No repeats: the daily slots (morning lead, evening close-out, lights out)
 * each draw from a pool of at least 14 and advance one step per calendar day,
 * so the same line never comes back inside two weeks. Weekly and twice-weekly
 * slots (sport days, answer-specific lines) have their own pools with the
 * same guarantee. scripts/check-copy.mjs checks all of this.
 */

export interface Line {
  title: string;
  body: string;
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Plain hyphens, single spaces, trimmed. Every line passes through this. */
export function sanitize(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function line(title: string, body: string): Line {
  return { title: sanitize(title), body: sanitize(body) };
}

/**
 * The day number a notification should show: whole days from the commit to
 * the moment it fires, floored exactly as the streak counter floors it. So a
 * push reads the same number the ring shows when it is opened - worked out
 * from each notification's own time, never from the moment of the rebuild.
 */
export function dayNumberAt(quitDate: string, at: Date): number {
  const start = Date.parse(quitDate);
  if (!Number.isFinite(start)) return 0;
  return Math.floor(Math.max(0, at.getTime() - start) / DAY_MS);
}

/** Calendar-day ordinal of a local day key (days since 1970-01-01). DST-proof. */
export function epochDay(key: DayKey): number {
  const d = dayKeyToDate(key);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Week ordinal, Monday-based, from an epoch day (1970-01-01 was a Thursday). */
function weekIndex(e: number): number {
  return Math.floor((e + 3) / 7);
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Profile: the only parts of the quiz the copy depends on
// ---------------------------------------------------------------------------

/** A sport the copy can speak to. */
export type SportKey = 'nfl' | 'ncaaf' | 'ncaab' | 'nba' | 'nhl' | 'mlb' | 'soccer' | 'fights';

export interface LineProfile {
  sports: SportKey[];
  style: number | null;
  triggers: number[];
  goal: number | null;
  history: number | null;
  freq: number | null;
  /** Per-person offset into the daily pools, so two users do not get the same line on the same day. */
  seed: number;
}

/** Quiz `sports` indexes: 0 NFL, 1 NBA, 2 NHL / MLB, 3 College, 4 Soccer, 5 UFC / boxing, 6 Other. */
const SPORTS_FOR_ANSWER: SportKey[][] = [
  ['nfl'],
  ['nba'],
  ['nhl', 'mlb'],
  ['ncaaf', 'ncaab'],
  ['soccer'],
  ['fights'],
  [],
];

const SPORT_FOR_LEAGUE: Record<League, SportKey> = {
  nfl: 'nfl',
  ncaaf: 'ncaaf',
  ncaab: 'ncaab',
  nba: 'nba',
  nhl: 'nhl',
  mlb: 'mlb',
  soccer: 'soccer',
  ufc: 'fights',
  boxing: 'fights',
};

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function profileFrom(answers: AnswerMap, teamLeagues: League[] = []): LineProfile {
  const list = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  const one = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const sports = new Set<SportKey>();
  for (const i of list(answers.sports)) for (const s of SPORTS_FOR_ANSWER[i] ?? []) sports.add(s);
  for (const l of teamLeagues) if (SPORT_FOR_LEAGUE[l]) sports.add(SPORT_FOR_LEAGUE[l]);
  const triggers = list(answers.triggers);
  const profile = {
    sports: [...sports].sort(),
    style: one(answers.style),
    triggers: [...new Set(triggers)].sort((a, b) => a - b),
    goal: one(answers.goal),
    history: one(answers.history),
    freq: one(answers.freq),
  };
  return { ...profile, seed: fnv1a(JSON.stringify(profile)) };
}

// ---------------------------------------------------------------------------
// Seasons and weekdays
// ---------------------------------------------------------------------------

/**
 * Rough regular-season-plus-playoffs windows as [MM-DD from, MM-DD to]
 * (wrapping the new year where needed). A sport line outside its season would
 * read as a bot that does not watch the games, so they only run inside these.
 */
const SEASON: Record<SportKey, [string, string] | null> = {
  nfl: ['09-03', '02-15'],
  ncaaf: ['08-22', '01-20'],
  ncaab: ['11-01', '04-08'],
  nba: ['10-18', '06-20'],
  nhl: ['10-05', '06-20'],
  mlb: ['03-25', '11-05'],
  // Some league is always on somewhere; so are fight cards.
  soccer: null,
  fights: null,
};

export function inSeason(sport: SportKey, key: DayKey): boolean {
  const w = SEASON[sport];
  if (!w) return true;
  const md = key.slice(5);
  const [from, to] = w;
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/**
 * The day of the week each sport's big slate falls on (JS getDay: 0 Sunday,
 * 6 Saturday). NFL is a Sunday sport; college, soccer and fight cards are
 * Saturday ones. Basketball, hockey and baseball play nearly every night, so
 * they have no key day of their own.
 */
export const KEY_WEEKDAY: Record<SportKey, number | null> = {
  nfl: 0,
  ncaaf: 6,
  ncaab: 6,
  soccer: 6,
  fights: 6,
  nba: null,
  nhl: null,
  mlb: null,
};

/** The profile's sports in season on this date whose key day it is. */
export function keyDaySports(profile: LineProfile, key: DayKey): SportKey[] {
  const wd = dayKeyToDate(key).getDay();
  return profile.sports.filter((s) => KEY_WEEKDAY[s] === wd && inSeason(s, key));
}

/**
 * The weekday for the weekly game-day nudge, per sport: the key day, or
 * Saturday for the every-night sports.
 */
export function nudgeWeekday(sport: SportKey): number {
  return KEY_WEEKDAY[sport] ?? 6;
}

// ---------------------------------------------------------------------------
// Discreet copy
// ---------------------------------------------------------------------------

export const DISCREET_TITLE = 'Winback';

export const DISCREET_MORNING = [
  'Your daily check-in is ready.',
  'Good morning. Your check-in is ready.',
  'A new day. Two minutes for your check-in?',
];
export const DISCREET_EVENING = ['Time for your evening check-in.', 'Your evening check-in is ready.'];
export const DISCREET_WEEKLY = 'Your weekly check-in is ready.';
export const DISCREET_BUSY_DAY = 'Busy day ahead. Open the app when you get a minute.';
export const DISCREET_BUSY_EVENING = 'Busy evening ahead. Open the app when you get a minute.';
export const DISCREET_CHECKING_IN = 'Checking in.';
export const DISCREET_NIGHT = 'Checking in before the night ends.';
export const DISCREET_OPEN_APP = 'A good day to open the app.';
export const DISCREET_RETURN = 'Your check-in is ready whenever you are.';

function discreet(body: string): Line {
  return line(DISCREET_TITLE, body);
}

// ---------------------------------------------------------------------------
// Morning
// ---------------------------------------------------------------------------

/** The lead sentence for an ordinary morning. At least 14, one per day. */
export const MORNING_LEADS = [
  "New day. The betting companies don't get this one.",
  'The money stays where it belongs today.',
  'One day at a time is still the whole plan.',
  'Watch the games, skip the apps, keep the money.',
  "You don't have to win today. You just don't have to play.",
  'Whatever the promos say today, you already know the answer.',
  'Today counts the same as every other clean day: fully.',
  'Keep it simple today: no deposits, no apps, no chasing.',
  'The betting companies plan for your weak moments. Plan for them first.',
  "Nothing needs to ride on today's games.",
  'A calm start helps. Two minutes for yourself before the day gets loud.',
  'Your record only goes up. Add today to it.',
  'If an urge shows up today, it builds, peaks and passes. Ride it out.',
  'Today is yours. The betting companies can wait forever.',
  'Start with a plan and the rest of the day has something to lean on.',
  'The apps are built to pull you back. Your plan is built to hold.',
];

/** Lines for specific answers: used twice a week, only with four or more to rotate. */
const TRIGGER_LEADS: Record<number, string[]> = {
  [TRIGGER_TEAMS_PLAYING]: [
    "Your team doesn't need your money to win. Watch it for the game.",
    'Games are better when the only thing riding on them is the game.',
  ],
  [TRIGGER_PAYDAY]: [
    'The betting companies time their promos around payday. Your money already has a job.',
    'Paydays are when the pull is loudest. Decide where the money goes before it arrives.',
  ],
  [TRIGGER_LATE_NIGHT]: [
    "Late nights are when the pull is strongest. Plan tonight's wind-down now.",
    'Decide now what you will do at 11pm, so you do not have to decide at 11pm.',
  ],
  [TRIGGER_CHASING]: [
    "Winning it back isn't on the table. Keeping what you have is.",
    'Chasing is exactly what the betting companies count on. Today you keep what is yours.',
  ],
  4: [
    'Boredom is a trigger, not a reason. Have one thing ready for the slow part of today.',
    'A quiet day is a fine day. Have something small lined up for the dull stretch.',
  ],
  5: [
    'Stress wants a quick fix. A walk or a call does the job without the bill.',
    'Heavy day? The apps promise relief and send an invoice. Breathe first.',
  ],
  [TRIGGER_DRINKING]: [
    'If a drink is in your plans today, decide now: phone in your pocket, apps stay gone.',
    "Drinks and apps are a bad mix. Make tonight's call while you are clear.",
  ],
};

const STYLE_LEADS: Record<number, string[]> = {
  2: [
    'In-game betting is built for impulse. A few seconds of pause breaks it.',
    'The in-game prompts come fast on purpose. You can let every one of them go by.',
  ],
  3: [
    'The betting companies build a new prompt for every play. You do not have to answer any of them.',
  ],
  4: ['Whatever looks good today can stay on the screen. Nothing needs your money on it.'],
  5: [
    'Calling it a trade does not change it. If it pays out on a game, it is a bet, and it can wait.',
    'A prediction app is a betting app with a chart on it. Leave it closed today.',
  ],
};

/** Q9 goal: debt, a big purchase, investing. "Just stopping the bleeding" gets none. */
const GOAL_LEADS: Record<number, string[]> = {
  0: [
    'Every day off betting is a day the debt stops getting fed.',
    'The debt shrinks on the days nothing goes to the betting companies.',
  ],
  1: [
    'The fund for something big grows on the days you keep the money.',
    "Something big is on the way. Today's money goes there, not to an app.",
  ],
  2: [
    'Money kept is money that can go to work for you, in savings, not on an app.',
    'Slow and boring grows. Keep the money out of the apps and let it.',
  ],
};

const HISTORY_LEADS: Record<number, string[]> = {
  2: [
    'You have tried before, and every try taught you something. Use it today.',
  ],
  3: [
    'Stopping for a while is a skill you already have. This time the wins column only goes up.',
    'The pull back is the design of the apps, not a flaw in you. Today you have a plan for it.',
  ],
};

const FREQ_LEADS: Record<number, string[]> = {
  0: ['When betting was every day, every day needs one small thing in its place. Pick yours.'],
};

/** Answer-specific leads for this profile, fixed order. */
export function taggedLeads(p: LineProfile): string[] {
  const out: string[] = [];
  for (const t of p.triggers) out.push(...(TRIGGER_LEADS[t] ?? []));
  if (p.style != null) out.push(...(STYLE_LEADS[p.style] ?? []));
  if (p.goal != null) out.push(...(GOAL_LEADS[p.goal] ?? []));
  if (p.history != null) out.push(...(HISTORY_LEADS[p.history] ?? []));
  if (p.freq != null) out.push(...(FREQ_LEADS[p.freq] ?? []));
  return out;
}

/** Weekly sport-day leads, per sport. */
const SPORT_DAY_LEADS: Record<SportKey, string[]> = {
  nfl: [
    'Football Sunday. Enjoy the games with nothing riding on them.',
    'Sunday means promos everywhere. Let every one of them go to voicemail.',
    'Watch for the plays today, not for anything on an app.',
    "Big Sunday for the betting companies' ads. Not for your money.",
  ],
  ncaaf: [
    'College Saturday. Enjoy the games and leave the apps closed.',
    'A long Saturday of football. Have a plan for the gaps between games.',
    "Fall Saturdays are the betting companies' favourite. They don't have to be yours.",
  ],
  ncaab: [
    'College hoops Saturday. Watch it for the game.',
    'A full Saturday of basketball. Plan what you do between games.',
    'Saturday games, zero stakes. That is the whole plan.',
  ],
  soccer: [
    'Match day. Enjoy the ninety minutes with nothing riding on them.',
    'Early kickoffs, late kickoffs. Keep your phone out of the in-between.',
    'Watch the match. The promos can wait forever.',
  ],
  fights: [
    'Fight night. Watch it for the fighters, not for the apps.',
    "A long card tonight. Plan what you'll do between fights.",
    'The betting companies push hard on fight nights. Tonight they get nothing.',
  ],
  nba: [],
  nhl: [],
  mlb: [],
};

/** Once-a-week in-season leads for the every-night sports (Wednesdays). */
const SEASON_LEADS: Record<'nba' | 'nhl' | 'mlb', string[]> = {
  nba: [
    'Basketball every night means the apps are loud every night. You do not have to answer.',
    'Late tip-offs mean late nights. Have your wind-down ready.',
    "Enjoy tonight's hoops for the game itself.",
  ],
  nhl: [
    'Hockey night. Three periods with nothing riding on them.',
    'A long hockey season means lots of chances to say no. Today is just one.',
  ],
  mlb: [
    'Nine innings with nothing riding on them. Enjoy it.',
    'Baseball every day means promos every day. Every one of them can go by.',
    'A long season is a lot of games you get to just watch.',
  ],
};

/** What the morning push asks for, and where it goes. */
export type MorningFocus = 'plan' | 'planSet' | 'move' | 'rep' | 'cut' | 'event';

const MORNING_CTA: Record<MorningFocus, string> = {
  plan: "Pick today's play.",
  planSet: "Today's play is set. Keep it close.",
  move: "Today's move takes two minutes.",
  rep: "Two minutes of practice while it's calm.",
  cut: 'Close one more way in for the betting companies. Two minutes.',
  event: "Today's prep takes thirty seconds.",
};

export interface MorningInput {
  key: DayKey;
  dayNumber: number;
  profile: LineProfile;
  discreet: boolean;
  focus: MorningFocus;
  /** The big event on this date, if one applies to this person. */
  bigEvent: ActiveBigEvent | null;
  /** The next milestone and how many days of the count until it. */
  next: { title: string; inDays: number; days: number } | null;
}

/** The lead a given morning uses (exported for the copy checks). */
export function morningLead(m: Omit<MorningInput, 'discreet' | 'focus' | 'next'>): string {
  const e = epochDay(m.key);
  const w = weekIndex(e);
  const wd = dayKeyToDate(m.key).getDay();
  const p = m.profile;

  const ev = m.bigEvent;
  if (ev) {
    const name = upperFirst(ev.event.name);
    if (ev.phase === 'prep') {
      return ev.daysToGo === 1
        ? `${name} starts tomorrow. Have your plan ready tonight.`
        : `${name} starts in ${ev.daysToGo} days. The betting companies are already gearing up.`;
    }
    if (ev.phase === 'after') return `That's a wrap on ${ev.event.name}. Come mark it.`;
  }

  // Sport key days (Saturday, Sunday), in season.
  const sports = keyDaySports(p, m.key).filter((s) => SPORT_DAY_LEADS[s].length > 0);
  if (sports.length) {
    const sport = sports[mod(w, sports.length)];
    const pool = SPORT_DAY_LEADS[sport];
    return pool[mod(w, pool.length)];
  }

  // Wednesdays: the every-night sports, in season.
  if (wd === 3) {
    const nightly = (['nba', 'nhl', 'mlb'] as const).filter(
      (s) => p.sports.includes(s) && inSeason(s, m.key),
    );
    if (nightly.length) {
      const pool = SEASON_LEADS[nightly[mod(w, nightly.length)]];
      return pool[mod(w, pool.length)];
    }
  }

  // Tuesdays and Fridays: something that speaks to their own answers, when
  // there are enough of those lines to go four uses without a repeat.
  if (wd === 2 || wd === 5) {
    const tagged = taggedLeads(p);
    if (tagged.length >= 4) {
      const c = w * 2 + (wd === 5 ? 1 : 0);
      return tagged[mod(c + p.seed, tagged.length)];
    }
  }

  return MORNING_LEADS[mod(e + p.seed, MORNING_LEADS.length)];
}

function countdown(next: MorningInput['next']): string {
  // Only for the bigger ones, and only in the last few days.
  if (!next || next.days < 7 || next.inDays < 1 || next.inDays > 3) return '';
  const when = next.inDays === 1 ? 'tomorrow' : `in ${next.inDays} days`;
  return ` ${next.title} ${when}.`;
}

export function morningLine(m: MorningInput): Line {
  if (m.discreet) return discreet(DISCREET_MORNING[mod(epochDay(m.key), DISCREET_MORNING.length)]);
  const title = m.dayNumber < 1 ? 'First morning.' : `Day ${m.dayNumber}.${countdown(m.next)}`;
  return line(title, `${morningLead(m)} ${MORNING_CTA[m.focus]}`);
}

// ---------------------------------------------------------------------------
// Evening close-out
// ---------------------------------------------------------------------------

export const EVENING_BODIES = [
  'Clean day or close call, log it. Every one counts and none of them resets.',
  'Thirty seconds to log how today went.',
  'Put today on the record before bed.',
  'Clean days go on the record, and the record only goes up.',
  'If an urge showed up and you rode it out, log it as a close call.',
  "Today's done. Put it on the record.",
  'Before the night gets going, close out the day.',
  'One tap to close out today. Your calendar fills in one day at a time.',
  'However today went, closing it out is the move.',
  "Log today while it's fresh.",
  "The day's almost done. Mark it and let it go.",
  'Close out today and watch this week fill in.',
  'A day on the record is a day the betting companies cannot take back.',
  'Close it out. Then the evening is yours.',
  "Thirty seconds, one tap. That's the whole ritual.",
  'You showed up for today. Close it out.',
];

export function eveningLine(key: DayKey, profile: LineProfile, isDiscreet: boolean): Line {
  const e = epochDay(key);
  if (isDiscreet) return discreet(DISCREET_EVENING[mod(e, DISCREET_EVENING.length)]);
  return line('Close out today.', EVENING_BODIES[mod(e + profile.seed, EVENING_BODIES.length)]);
}

const RECAP_BODIES = [
  'Close out today and see your week.',
  'Last close-out of the week. Your week is waiting after it.',
  'One tap to close today, then a look at the whole week.',
];

/** Sunday's close-out, which opens the weekly recap afterwards. */
export function recapLine(key: DayKey, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_WEEKLY);
  const w = weekIndex(epochDay(key));
  return line('Close out the week.', RECAP_BODIES[mod(w, RECAP_BODIES.length)]);
}

// ---------------------------------------------------------------------------
// Milestones (invitations, not claims)
// ---------------------------------------------------------------------------

const MILESTONE_BODIES = [
  "It's on the count today. Open Winback and mark it.",
  'A milestone on the count today. Come take a minute with it.',
  "Today's the day on the count. Come see what you've kept.",
];

/** The morning a milestone lands. `index` rotates the body between milestones. */
export function milestoneLine(m: Milestone, index: number, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_MORNING[0]);
  return line(`${m.title}.`, MILESTONE_BODIES[mod(index, MILESTONE_BODIES.length)]);
}

/**
 * The evening before. Routes to the close-out, so it doubles as tonight's.
 * The milestone comes from the count, not from closing out, so the two are
 * never tied together: nothing here depends on not missing a day.
 */
export function milestoneEveLine(m: Milestone, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_EVENING[0]);
  return line(
    `Tomorrow: ${lowerFirst(m.title)}.`,
    'It lands on the count in the morning. For tonight, thirty seconds to close out today.',
  );
}

// ---------------------------------------------------------------------------
// Payday
// ---------------------------------------------------------------------------

const PAYDAY_BODIES = [
  "The betting companies plan their promos around today. The money already has a job. Pick today's play.",
  "Paydays are loud. Decide where the money goes first, then pick today's play.",
  "The promos know what day it is. So do you. Pick today's play.",
];

/**
 * 1st and 15th. Names the goal (never an amount) when there is one and the
 * push is not discreet.
 */
export function paydayLine(key: DayKey, goalName: string | null, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_OPEN_APP);
  const d = dayKeyToDate(key);
  const n = d.getMonth() * 2 + (d.getDate() >= 15 ? 1 : 0);
  const name = goalName ? pushGoalName(goalName) : null;
  if (name && mod(n, 2) === 0) {
    return line('Payday.', `The money already has a job: ${name}. Pick today's play.`);
  }
  return line('Payday.', PAYDAY_BODIES[mod(n, PAYDAY_BODIES.length)]);
}

/** A name (a team, a goal), made safe for one line of a push. */
export function cleanName(name: string): string {
  const s = sanitize(name).replace(/[.!?]+$/, '');
  return s.length > 40 ? `${s.slice(0, 39).trimEnd()}...` : s;
}

/**
 * The user's own goal name, or null when it cannot go on a lock screen as
 * typed. Goals are named freely ("Pay off the $4,000 card"), and no push may
 * carry a money amount, so a name with any digit, currency sign or amount
 * word, or a word no push may use, is never shown - the line falls back to
 * one that does not name the goal. Checked after the length trim, too.
 */
export function pushGoalName(name: string): string | null {
  const s = cleanName(name);
  if (!s || /\d/.test(s) || /[$\u00a2-\u00a5\u20a0-\u20bf]/.test(s)) return null;
  if (MONEY_PATTERN.test(s) || PUSH_BANNED.test(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Comeback week (after a slip). Asks "what", never "why".
// ---------------------------------------------------------------------------

/**
 * One per comeback day, each describing exactly the item /comeback shows that
 * day: both come from the same list (state/comebackWeek.ts).
 */
export const COMEBACK_BODIES: string[] = COMEBACK_WEEK.map((d) => d.push);

/** `day` is 1-7 (start + day). */
export function comebackLine(day: number, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_MORNING[0]);
  const n = Math.min(7, Math.max(1, Math.round(day)));
  return line(`Day ${n} of your comeback.`, COMEBACK_BODIES[n - 1]);
}

// ---------------------------------------------------------------------------
// Lights out (late-night users; doubles as the close-out)
// ---------------------------------------------------------------------------

export const LIGHTS_OUT_BODIES = [
  "Phone down soon. The night is yours, not the betting companies'.",
  'Close the night out: sixty seconds of breathing, then sleep.',
  'Late is when the apps get loud. Put the phone across the room.',
  "One minute to wind down. The night doesn't need a bet in it.",
  'Nothing worth staying up for is on an app. Close the night out.',
  "Tonight's plan: breathe, charge the phone away from the bed, sleep.",
  'The late games will still be there tomorrow. So will you.',
  'Wind down with a minute of slow breathing. Then lights out.',
  'Late nights are the risky hour. Close this one out now.',
  'Screens off, lights off. The night is for sleep.',
  'One tap closes the night. The rest is sleep.',
  'Tired and scrolling is when the promos land. Close the night instead.',
  "Put tomorrow's first win in place: close the night out now.",
  'Sixty calm seconds, then the phone goes to sleep before you do.',
];

/** Sunday's lights out, which ends with the week. One a week, so three is enough. */
export const LIGHTS_OUT_RECAP_BODIES = [
  'Close the night out, then take a look at your week.',
  'Last night of the week. Wind down, then see your week.',
  'One minute to close the night, then your week is waiting.',
];

/**
 * What else tonight's lights out stands in for. For late-night users it takes
 * the evening's only place, so on a Sunday it carries the week and on a
 * milestone eve the milestone - one push, not two.
 */
export interface LightsOutExtras {
  /** Sunday, with the weekly recap on: the ritual ends with the week. */
  recap?: boolean;
  /** The milestone that lands on the count tomorrow. */
  milestone?: Milestone | null;
}

export function lightsOutLine(
  key: DayKey,
  profile: LineProfile,
  isDiscreet: boolean,
  extras: LightsOutExtras = {},
): Line {
  if (isDiscreet) return discreet(extras.recap ? DISCREET_WEEKLY : DISCREET_NIGHT);
  const e = epochDay(key);
  const title = extras.milestone ? `Lights out. Tomorrow: ${lowerFirst(extras.milestone.title)}.` : 'Lights out.';
  const body = extras.recap
    ? LIGHTS_OUT_RECAP_BODIES[mod(weekIndex(e), LIGHTS_OUT_RECAP_BODIES.length)]
    : LIGHTS_OUT_BODIES[mod(e + profile.seed, LIGHTS_OUT_BODIES.length)];
  return line(title, body);
}

// ---------------------------------------------------------------------------
// Game day (Premium, saved teams)
// ---------------------------------------------------------------------------

export interface GameCopyInput {
  league: League;
  homeName: string;
  awayName: string;
  /** When the game starts (for "today" vs "tonight"). */
  startsAt: Date;
  /** Rotates the bodies between games. */
  index: number;
}

const START_WORD: Record<League, string> = {
  nfl: 'Kickoff',
  ncaaf: 'Kickoff',
  soccer: 'Kickoff',
  nba: 'Tip-off',
  ncaab: 'Tip-off',
  nhl: 'Puck drop',
  mlb: 'First pitch',
  ufc: 'The card',
  boxing: 'The card',
};

const PRE_GAME_ASKS = [
  "What's your plan for watching it clean?",
  "Pick today's play before it starts.",
  'Decide now where you watch it and who with.',
  'Nothing needs to ride on it. Pick your play for the game.',
];

function matchup(g: GameCopyInput): string {
  const home = cleanName(g.homeName);
  const away = cleanName(g.awayName);
  if (!home || !away || home === 'TBD' || away === 'TBD') return 'Game day.';
  return g.league === 'soccer' ? `${home} v ${away}` : `${away} at ${home}`;
}

/** An hour before the start. Routes to today's play. */
export function preGameLine(g: GameCopyInput, isDiscreet: boolean): Line {
  const evening = g.startsAt.getHours() >= 17;
  if (isDiscreet) return discreet(evening ? DISCREET_BUSY_EVENING : DISCREET_BUSY_DAY);
  // A league this build does not know (a cached game from another version)
  // says "the game", never "undefined in an hour".
  const word = START_WORD[g.league] as string | undefined;
  const starts = !word
    ? 'The game starts in an hour.'
    : word === 'The card'
      ? 'The card starts in an hour.'
      : `${word} in an hour.`;
  return line(matchup(g), `${starts} ${PRE_GAME_ASKS[mod(g.index, PRE_GAME_ASKS.length)]}`);
}

const HALFTIME_BODIES = [
  'Your plan still holds. One minute of breathing before play starts again.',
  'This is when the in-game promos push hardest. Stick with your plan.',
  'Break in play. Stretch, get some water, keep the apps closed.',
];

/** The break. Leads with the plan, never with the promos' pitch. Routes to /panic. */
export function halftimeLine(g: GameCopyInput, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_CHECKING_IN);
  const title = g.league === 'nhl' ? 'Intermission.' : 'Halftime.';
  return line(title, HALFTIME_BODIES[mod(g.index, HALFTIME_BODIES.length)]);
}

/** After the final. No score, no result: only whether they watched it clean. */
export function postGameLine(g: GameCopyInput, replacesEvening: boolean, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(replacesEvening ? DISCREET_EVENING[0] : DISCREET_CHECKING_IN);
  return line(
    "That's the game.",
    replacesEvening
      ? 'Watched it clean, or skipped it? Either way, close out today.'
      : 'Watched it clean, or skipped it? Log it in ten seconds.',
  );
}

// ---------------------------------------------------------------------------
// Weekly game-day nudge (no saved teams, or game-day automation off)
// ---------------------------------------------------------------------------

const NUDGE_TITLE: Record<SportKey, string> = {
  nfl: 'Football Sunday.',
  ncaaf: 'College football Saturday.',
  ncaab: 'College hoops Saturday.',
  soccer: 'Match day.',
  fights: 'Fight night.',
  nba: 'Game day.',
  nhl: 'Game day.',
  mlb: 'Game day.',
};

const NUDGE_BODIES = [
  "Watch it for the game. Pick today's play before it starts.",
  "The promos will be loud today. Pick today's play first.",
  "Decide where you'll watch and who with. Then pick today's play.",
];

/** `sport` null = they said their teams are a trigger but named no sport we cover. */
export function weeklyGameLine(sport: SportKey | null, key: DayKey, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_BUSY_DAY);
  const w = weekIndex(epochDay(key));
  return line(sport ? NUDGE_TITLE[sport] : 'Game day.', NUDGE_BODIES[mod(w, NUDGE_BODIES.length)]);
}

// ---------------------------------------------------------------------------
// One-offs
// ---------------------------------------------------------------------------

/** The opt-in "Still past it?" after a long panic session. Routes to /panic. */
export function followUpLine(isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_CHECKING_IN);
  return line('Still past it?', "You rode one out earlier. If it's back, tap here. If not, nice work.");
}

const CHECKPOINT_WORDS: Record<25 | 50 | 75 | 100, string> = {
  25: 'is a quarter of the way there',
  50: 'is halfway there',
  75: 'is three quarters of the way there',
  100: 'is all the way there',
};

/**
 * A goal checkpoint, on the morning the estimate crosses it. Names the goal,
 * never an amount. Never sent in discreet mode (the engine skips it); the
 * discreet line exists only so nothing can fall through with the name.
 */
export function goalLine(name: string, checkpoint: 25 | 50 | 75 | 100, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_MORNING[0]);
  const goal = pushGoalName(name) ?? 'Your goal';
  return line('Goal jar.', `${goal} ${CHECKPOINT_WORDS[checkpoint]}, on the estimate. Come take a look.`);
}

const RETURN_BODIES = [
  'Whenever you want it, your record and your plan are right where you left them.',
  'The door is open. Your record is still here, and it still only goes up.',
];

/** The sparse pair queued weeks out, for someone who has stopped opening the app. */
export function returnLine(n: number, isDiscreet: boolean): Line {
  if (isDiscreet) return discreet(DISCREET_RETURN);
  return line('Winback', RETURN_BODIES[mod(n, RETURN_BODIES.length)]);
}

// ---------------------------------------------------------------------------
// Copy checks (used by scripts/check-copy.mjs)
// ---------------------------------------------------------------------------

/** Words no push may contain, in any mode. */
export const PUSH_BANNED =
  /the books|sportsbook|\baddicts?\b|\bodds\b|\bspreads?\b|\bparlays?\b|\bmoneylines?\b|\bover\/under\b|\bprops?\b|\bscores?\b|\bjackpot|\bbonus|\bwin big\b|\bbankroll|\bwinnings\b|\bloser\b|miss you|at risk|don't blow/i;

/** Words no discreet push may contain: anything that hints at betting or recovery. */
export const DISCREET_BANNED =
  /\bbet|gambl|wager|casino|deposit|\bodds\b|parlay|sportsbook|books|streak|clean|slip|relaps|urge|recover|addict|money|cash|\$|\bteams?\b|\bgames?\b|payday|halftime|kickoff|tip-off|match|fight|comeback|milestone|day \d|\d/i;

/** A money amount in any form. */
export const MONEY_PATTERN = /\$|\b\d[\d,.]*\s*(dollars?|bucks|usd|k)\b|\bdollars?\b/i;
