/**
 * Authoritative quiz copy and flow - from winback-onboarding-quiz.md.
 * Do not paraphrase: exact copy is part of the design contract.
 */
export type QuestionId =
  | 'freq'
  | 'sports'
  | 'style'
  | 'spend'
  | 'triggers'
  | 'history'
  | 'cost'
  | 'secrecy'
  | 'goal'
  | 'baseline';

export interface Question {
  id: QuestionId;
  title: string;
  multi: boolean;
  options: string[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'freq',
    title: 'How often do you bet?',
    multi: false,
    options: [
      'Pretty much every day',
      'A few times a week',
      'Weekends and game days',
      'A few times a month',
    ],
  },
  {
    id: 'sports',
    title: 'What do you bet on?',
    multi: true,
    options: [
      'NFL',
      'NBA',
      'NHL / MLB',
      'College football / basketball',
      'Soccer',
      'UFC / boxing',
      'Other',
    ],
  },
  {
    id: 'style',
    title: "What's your usual play?",
    multi: false,
    options: [
      'Parlays',
      'Straight bets / moneylines',
      'Live in-game bets',
      'Player props',
      'Whatever looks good that day',
      'Prediction markets / event contracts',
    ],
  },
  {
    id: 'spend',
    title: 'In a typical month, how much do you deposit into betting apps?',
    multi: false,
    options: [
      'Under $100',
      '$100 - $500',
      '$500 - $1,000',
      '$1,000 - $2,500',
      '$2,500 - $5,000',
      'Over $5,000',
    ],
  },
  {
    id: 'triggers',
    title: 'When do you find yourself betting the most?',
    multi: true,
    options: [
      'When my teams are playing',
      'Right after payday',
      'Late at night',
      'After a loss, trying to win it back',
      "When I'm bored",
      "When I'm stressed",
      "When I've been drinking",
    ],
  },
  {
    id: 'history',
    title: 'Have you tried to stop or cut back before?',
    multi: false,
    options: [
      'Never really tried',
      'Once or twice',
      'Many times',
      'I stop for a while, but I always come back',
    ],
  },
  {
    id: 'cost',
    title: 'What has betting cost you besides money?',
    multi: true,
    options: [
      'Sleep',
      'Focus at work',
      'Relationships',
      'Actually enjoying the games',
      'Savings or debt',
      'How I feel about myself',
      'Nothing yet - I want to stop before it does',
    ],
  },
  {
    id: 'secrecy',
    title: 'Do you keep your betting hidden from anyone?',
    multi: false,
    options: ['Yes', 'Sometimes', 'No'],
  },
  {
    id: 'goal',
    title: 'If that money stayed in your pocket, what would it go toward?',
    multi: false,
    options: [
      'Paying off debt',
      'Saving for something big (trip, car, house)',
      'Investing it',
      'Just stopping the bleeding',
    ],
  },
  {
    id: 'baseline',
    title: "What's the longest you've gone without a bet in the past year?",
    multi: false,
    options: ['Less than a day', 'A few days', 'A week or two', 'A month or more'],
  },
];

/** Q4 range midpoints -> the starting point for monthly_spend ($7,500 for the open-ended top bracket). */
export const SPEND_MIDPOINTS = [50, 300, 750, 1750, 3750, 7500];

/** Q4 bracket bounds - the personalized estimate never leaves the user's own bracket. */
export const SPEND_BRACKETS: readonly (readonly [number, number])[] = [
  [25, 100],
  [100, 500],
  [500, 1000],
  [1000, 2500],
  [2500, 5000],
  // Deliberately wide. The top option is open-ended ("Over $5,000"), and the
  // estimate is clamped to its bracket - so a narrow ceiling here would tell
  // the heaviest bettors a number far below their reality. In practice the
  // estimate below tops out around $13,000, well inside this range.
  [5000, 20000],
];

export type AnswerMap = Partial<Record<QuestionId, number | number[]>>;

/** Q5 trigger indexes that drive notification timing rules and the estimate. */
export const TRIGGER_TEAMS_PLAYING = 0;
export const TRIGGER_PAYDAY = 1;
export const TRIGGER_LATE_NIGHT = 2;
export const TRIGGER_CHASING = 3;
export const TRIGGER_DRINKING = 6;

/** Q1 frequency: daily, a few times a week, weekends, a few times a month. */
const FREQ_MULTIPLIER = [1.25, 1.1, 1.0, 0.85];
/** Q3 style indexes that burn deposits fastest: parlays, live in-game. */
const STYLE_PARLAYS = 0;
const STYLE_STRAIGHT = 1;
const STYLE_LIVE = 2;
/** Q6 history: "Many times" and "I stop for a while, but I always come back". */
const HISTORY_MANY_TIMES = 2;
/** Q10 baseline: "Less than a day" and "A month or more". */
const BASELINE_UNDER_A_DAY = 0;
const BASELINE_MONTH_PLUS = 3;

/**
 * Personalized monthly-spend estimate - the only source of the money figures
 * (reveal, Home counter, paywall math). Starts from the Q4 bracket midpoint
 * and adjusts for betting-pattern signals from the rest of the quiz.
 *
 * Heavy signals nudge up: betting daily or most days, parlays or live
 * betting, chasing losses, betting while drinking, many failed attempts to
 * stop, and never going a day without a bet. Light signals nudge down by the
 * same small steps: straight bets and a month or more without betting, and
 * betting only a few times a month takes the frequency step down (weekends
 * only is neutral); someone showing no heavy signal at all takes one more
 * small step down. That symmetry matters. A midpoint-plus-multipliers
 * model that only ever goes up puts every light bettor in the top half of
 * their bracket, and overstating someone's spending on the screen meant to
 * earn their trust is not a small error.
 *
 * Deterministic and explainable by construction, the same on every device
 * and every re-run, and always clamped to the user's own bracket so the
 * reveal never contradicts what they told us.
 */
export function estimateMonthlySpend(answers: AnswerMap): number {
  // Clamped, not trusted. This index comes from AsyncStorage, so a corrupted
  // or hand-edited value used to destructure `undefined` here and throw inside
  // the state provider - above the error boundary, so the app white-screened
  // on launch with no way back.
  const raw = typeof answers.spend === 'number' ? answers.spend : 1;
  const idx = Number.isFinite(raw) ? Math.min(SPEND_BRACKETS.length - 1, Math.max(0, Math.trunc(raw))) : 1;
  const [lo, hi] = SPEND_BRACKETS[idx];
  let estimate = SPEND_MIDPOINTS[idx];

  const triggers = Array.isArray(answers.triggers) ? answers.triggers : [];
  const freq = typeof answers.freq === 'number' ? answers.freq : -1;
  const heavy = {
    frequent: freq === 0 || freq === 1,
    fastStyle: answers.style === STYLE_PARLAYS || answers.style === STYLE_LIVE,
    chasing: triggers.includes(TRIGGER_CHASING),
    drinking: triggers.includes(TRIGGER_DRINKING),
    repeatedAttempts: typeof answers.history === 'number' && answers.history >= HISTORY_MANY_TIMES,
    neverABreak: answers.baseline === BASELINE_UNDER_A_DAY,
  };

  // Q1 frequency already runs both ways (1.25 down to 0.85).
  estimate *= FREQ_MULTIPLIER[freq] ?? 1;
  if (heavy.fastStyle) estimate *= 1.1;
  if (heavy.chasing) estimate *= 1.1;
  if (heavy.drinking) estimate *= 1.05;
  if (heavy.repeatedAttempts) estimate *= 1.05;
  if (heavy.neverABreak) estimate *= 1.05;

  // Light signals, mirroring the steps above.
  if (answers.style === STYLE_STRAIGHT) estimate *= 0.95;
  if (answers.baseline === BASELINE_MONTH_PLUS) estimate *= 0.95;
  if (!Object.values(heavy).some(Boolean)) estimate *= 0.9;

  estimate = Math.min(hi, Math.max(lo, estimate));
  return Math.round(estimate / 10) * 10;
}

/** Cost-reveal anchor line, chosen by Q4 tier. */
export const ANCHOR_LINES = [
  "That's a vacation. Every year. Gone.",
  "That's a used car every three years.",
  "That's rent. Months of it. Every year.",
  "That's a house down payment this decade.",
  "That's a second income - paid to the betting companies.",
  "That's a mortgage. Every year. To an app.",
];

/** Shown above Q7 when Q6 = "I stop for a while, but I always come back". */
export const CYCLE_NOTE =
  "That cycle isn't a willpower problem. The apps are built to pull you back. Winback is built to break the loop.";

export const INTERLUDE_LINES = [
  'Analyzing your betting pattern…',
  'Adding up what goes to the betting companies…',
  'Building your Winback plan…',
];

/** Q9 → reveal-3 / panic goal phrasing ("That's your ___ - not their revenue."). */
export const GOAL_REVEAL = ['debt paid down', 'trip fund', 'investment account', null] as const;

/** Q9 phrasing used on the panic screen and the cost reveal ("the money's
 *  going toward ___"). Not a tracked feature - purely how we word it back. */
export const GOAL_PAYWALL = [
  'paying off debt',
  'saving for something big',
  'investing it',
  'just stopping the bleeding',
] as const;

/** Index of "I stop for a while, but I always come back" in Q6. */
export const HISTORY_ALWAYS_COME_BACK = 3;
/** Index of "Savings or debt" in Q7. */
export const COST_SAVINGS_OR_DEBT = 4;
/** Index of "Nothing yet - I want to stop before it does" in Q7 (excluded from "your reasons"). */
export const COST_NOTHING_YET = 6;
/** Index of "Yes" in Q8. */
export const SECRECY_YES = 0;
/** Index of "Sometimes" in Q8. */
export const SECRECY_SOMETIMES = 1;
