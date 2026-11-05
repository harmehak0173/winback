import { daysBetween, type DayKey } from '@/lib/day';
import type { BreathPattern } from './breathing';

/**
 * Daily reps: two minutes of practising a crisis skill while calm (hook 14).
 *
 * The panic screen asks someone to breathe, ground or talk themselves down in
 * the worst five minutes of their week. Skills practised on a quiet afternoon
 * are the ones that are there when it counts, so this is practice, not
 * therapy, and it makes no claims about what the practice does to the body.
 *
 * Rules the content follows:
 * - The calm pattern (in 4, out 6) is the default and the most common rep.
 *   4-7-8 is offered with a "stop anytime" note: long holds can make some
 *   people light-headed.
 * - No imagery that asks the user to picture betting in the first two weeks
 *   (`minDay`). Early on, picturing the bet is closer to a cue than a rep.
 * - Reuses the panic screen's own tools (BreathingGuide with PATTERNS,
 *   GroundingExercise with GROUNDING) and the existing voice clips or the
 *   on-device speech fallback. No new audio.
 * - The count is cumulative only. A missed day is invisible.
 */

export type PatternId = BreathPattern['id'];
export type RepKind = 'breathe' | 'ground' | 'script';

export interface Rep {
  id: string;
  /** Max about 28 characters. */
  title: string;
  /** One line: the skill this practises. */
  skill: string;
  kind: RepKind;
  /** For 'breathe': which of PATTERNS to run. */
  patternId?: PatternId;
  /** For 'script': one prompt per step, shown (and optionally spoken) in turn. */
  lines?: string[];
  /** Shown before starting, e.g. the 4-7-8 note. */
  note?: string;
  /** Earliest day of the current run this rep is offered. */
  minDay: number;
  /** Planned length. */
  seconds: number;
}

const STOP_ANYTIME = 'Stop anytime. If the holds make you light-headed, switch to Calm.';

export const REPS: Rep[] = [
  {
    id: 'calm-basic',
    title: 'Calm breathing',
    skill: 'An exhale longer than the inhale, at your own pace.',
    kind: 'breathe',
    patternId: 'calm',
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'ground-54321',
    title: '5-4-3-2-1',
    skill: 'Pull attention out of your head and into the room.',
    kind: 'ground',
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'halt-scan',
    title: 'The HALT scan',
    skill: 'Ten seconds to name what an urge is really asking for.',
    kind: 'script',
    lines: [
      'Sit still for a moment. Nothing to fix yet.',
      'Hungry? When did you last eat something real?',
      'Angry? Is anything or anyone still on your mind from today?',
      'Lonely? Who have you actually talked to today?',
      'Tired? How did you sleep, and how are you now?',
      'Pick the one that fits best. That is what an urge would be covering for.',
      'Decide one small fix for it: food, a walk, a text, an early night.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'calm-hand',
    title: 'Calm, hand on your belly',
    skill: 'Feel the breath move, so you can find it fast later.',
    kind: 'breathe',
    patternId: 'calm',
    note: 'Rest one hand on your belly and let it rise on the way in.',
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'name-it',
    title: 'Name it',
    skill: 'Put a label on an urge so it stops sounding like a decision.',
    kind: 'script',
    lines: [
      'Say it quietly, or in your head: "This is an urge. It is not a decision."',
      'Notice where you would feel it if it were here: chest, stomach, hands.',
      'Say it again, slower: "This is an urge. It is not a decision."',
      'An urge builds, peaks and passes. You only have to outlast it.',
      'One more time, like you mean it: "This is an urge. It is not a decision."',
      'That sentence is ready now for the next time one shows up.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'box-steady',
    title: 'Box breathing',
    skill: 'Four even sides. Steady, and easy to count under pressure.',
    kind: 'breathe',
    patternId: 'box',
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'i-dont-bet',
    title: '"I don\'t bet"',
    skill: 'Rehearse the answer so it comes out easy when someone asks.',
    kind: 'script',
    lines: [
      'Picture a friend asking if you want in on something tonight.',
      'Say it out loud, plainly: "I don\'t bet."',
      'No reason needed. Try it again, a little easier: "Nah, I don\'t bet."',
      'Now the follow-up: "Since when?" Answer: "A while now. How\'s the team looking?"',
      'Notice the conversation just moves on.',
      'Say it once more, the way you would with the crew: "I don\'t bet."',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'calm-count',
    title: 'Calm, counting down',
    skill: 'Count breaths from ten to one. Lose count? Start at ten again.',
    kind: 'breathe',
    patternId: 'calm',
    note: 'Count each full breath down from ten. There is no wrong way to lose count.',
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'body-map',
    title: 'Where it lives',
    skill: 'Learn where an urge shows up in your body, before one does.',
    kind: 'script',
    lines: [
      'Close your eyes if that is comfortable.',
      'Notice your jaw. Let it loosen.',
      'Notice your shoulders. Let them drop a little.',
      'Notice your chest and stomach. Just notice, nothing to change.',
      'Notice your hands. Are they still, or looking for your phone?',
      'When an urge comes, it often starts in one of these places. Now you know where to look.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'timer-rehearsal',
    title: 'The ten-minute rule',
    skill: 'Practise the first move so it is automatic when an urge hits.',
    kind: 'script',
    lines: [
      'Picture your phone in your hand and an urge starting.',
      'The first move is always the same: start a ten-minute timer.',
      'Decide now what you will do in those ten minutes. A walk, water, a text.',
      'Say your plan out loud in one sentence.',
      'When the timer ends, the urge is usually smaller. You decide then, not now.',
      'That is the whole rule: timer first, everything else after.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'ground-feet',
    title: 'Feet on the floor',
    skill: 'The fastest grounding there is, usable anywhere.',
    kind: 'script',
    lines: [
      'Put both feet flat on the floor.',
      'Press down gently and notice the floor pushing back.',
      'Notice your heels, then the balls of your feet, then your toes.',
      'Notice the weight of your body in the chair or on your legs.',
      'Breathe out slowly while you keep pressing down.',
      'This works on a couch, at a bar, or in a car. Nobody can tell you are doing it.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'money-job',
    title: 'The money has a job',
    skill: 'Name what kept money is for, so it is not loose money.',
    kind: 'script',
    lines: [
      'Think of the money you would have deposited this week.',
      'Name one bill it covers.',
      'Name one thing you want that it moves you closer to.',
      'Name one person it makes life easier for.',
      'Say all three out loud in one sentence.',
      'Money with a job is hard to bet. This one has three.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'deep-478',
    title: '4-7-8 breathing',
    skill: 'A long hold and a longer exhale, for when you want to go slow.',
    kind: 'breathe',
    patternId: '478',
    note: STOP_ANYTIME,
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'if-i-slip',
    title: 'The first-hour plan',
    skill: 'Rehearse what happens if a slip ever comes, while you are calm.',
    kind: 'script',
    lines: [
      'This is a plan, not a prediction.',
      'Step one: stop. No topping up, no getting it back tonight.',
      'Step two: tell your person, the same hour. One text is enough.',
      'Step three: move. Out of the room, away from the phone.',
      'Say the three steps out loud: stop, tell, move.',
      'A plan written now beats one made up at midnight.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'fence-check',
    title: 'Fence check',
    skill: 'Two minutes to make sure every barrier is still up.',
    kind: 'script',
    lines: [
      'Are the betting apps still gone from your phone?',
      'Is your blocker still switched on?',
      'Is your self-exclusion or bank block still active, if you set one?',
      'Is your person still someone you would text tonight?',
      'If any answer is no, fix that one today.',
      'Fences stay up longest when they feel least needed.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'good-saturday',
    title: 'A good Saturday',
    skill: 'Picture a day you would actually want, with nothing riding on it.',
    kind: 'script',
    lines: [
      'Picture next Saturday morning. Where are you?',
      'Who are you with in the afternoon?',
      'If a game is on, picture watching it just for the game.',
      'Picture the evening. What are you doing that you enjoy?',
      'Picture Sunday morning, waking up with nothing to check.',
      'Pick one part of that day and plan it for real.',
    ],
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'box-before-game',
    title: 'Box, before the game',
    skill: 'A steady rhythm to run before kickoff or tip-off.',
    kind: 'breathe',
    patternId: 'box',
    note: 'Practise it now so it is familiar on game day.',
    minDay: 0,
    seconds: 120,
  },
  {
    id: 'ask-for-help',
    title: 'Write the text',
    skill: 'Draft the message you would send your person, before you need it.',
    kind: 'script',
    lines: [
      'Think of the one person you would tell if an urge got loud.',
      'Draft a short text in your head: "Rough moment. Can you talk for five minutes?"',
      'Change the words until they sound like you.',
      'Picture them reading it. Most people are glad to be asked.',
      'Save the words somewhere you can find them fast.',
      'Asking early is a skill. You just practised it.',
    ],
    minDay: 0,
    seconds: 120,
  },
  // Two weeks in: these ask you to picture the bet, which is too close to a
  // cue in the first fortnight.
  {
    id: 'tape-forward',
    title: 'Play the tape forward',
    skill: 'Follow one bet past the moment it feels good.',
    kind: 'script',
    lines: [
      'Picture the urge to place one bet. Just the urge, not the bet.',
      'Now skip ahead an hour. What usually happened next?',
      'Skip to the next morning. How much is gone, and who knows?',
      'Skip to the next payday. Where did the money go?',
      'Now play the other tape: the urge passes, and the morning is quiet.',
      'Pick the second tape. It is the one you can actually choose.',
    ],
    minDay: 14,
    seconds: 120,
  },
  {
    id: 'close-is-a-feeling',
    title: 'Close is a feeling',
    skill: 'Take the sting out of the "I nearly had it" story.',
    kind: 'script',
    lines: [
      'Think of a result that felt like it almost went your way.',
      'Notice the pull of "so close". That pull is the point of the design.',
      'Say it plainly: a near miss paid exactly what a big miss paid.',
      'Notice the pull get a little quieter as you say it.',
      'Now picture the same game watched with nothing riding on it.',
      'That game is still yours to enjoy.',
    ],
    minDay: 14,
    seconds: 120,
  },
];

const ORIGIN: DayKey = '2026-01-05';

/**
 * Today's suggested rep, deterministic by day. Two weeks in, the imagery reps
 * join the rotation. Every third day is the user's go-to pattern, or Calm,
 * so the pattern they will reach for in a panic gets the most practice.
 */
export function repForDay(day: DayKey, daysClean: number, favourite: PatternId | null): Rep {
  const n = daysBetween(ORIGIN, day);
  if (((n % 3) + 3) % 3 === 0) {
    const go = favourite ?? 'calm';
    const pick = REPS.find((r) => r.kind === 'breathe' && r.patternId === go);
    if (pick) return pick;
  }
  const eligible = REPS.filter((r) => r.minDay <= daysClean);
  return eligible[((n % eligible.length) + eligible.length) % eligible.length];
}

export function repById(id: string): Rep | undefined {
  return REPS.find((r) => r.id === id);
}
