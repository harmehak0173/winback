/**
 * Today's play: pre-written if-then plans (hook 5).
 *
 * An if-then plan names the moment and decides the move ahead of time, so the
 * decision is already made when the moment comes. Each one is tagged with the
 * triggers it answers (TRIGGER_OPTIONS indexes in src/lib/triggers.ts; 0-6
 * match the quiz, 7 is 'Saw a promo or ad') and the day contexts it fits, and
 * links to the playbook play that explains why it works.
 *
 * Reviewed against the house rules: every plan is something to do, never a
 * way to bet less or "test yourself" near a bet; no money decision is made in
 * the moment (payday plans are set in advance); no odds, lines or bet types as
 * something to act on; the betting companies are the opponent, never the user.
 * Skipping a game is always an equal choice ("avoid" plans), and they come
 * first in the first two weeks.
 */

export type PlanContext = 'payday' | 'game' | 'weekend' | 'lateNight' | 'default';

export interface IfThenPlan {
  id: string;
  /** The cue, read after "If ". Lower case, no full stop. */
  if: string;
  /** The move, read after "then ". Lower case, no full stop. */
  then: string;
  /** TRIGGER_OPTIONS indexes this plan answers. */
  triggers: number[];
  /** Day contexts it fits. */
  contexts: PlanContext[];
  /** Playbook play id (src/state/playbook.ts). */
  playId: string;
  /** Avoidance plan: step away rather than sit it out. Offered first early on. */
  avoid?: boolean;
}

/** "If <cue>, then <move>." */
export function planSentence(p: IfThenPlan): string {
  return `If ${p.if}, then ${p.then}.`;
}

export const PLANS: IfThenPlan[] = [
  // Game days -------------------------------------------------------------
  {
    id: 'game-skip',
    if: 'my team plays tonight',
    then: 'I skip this one and catch the highlights tomorrow',
    triggers: [0],
    contexts: ['game'],
    playId: 'watching-with-friends',
    avoid: true,
  },
  {
    id: 'game-company',
    if: 'the game is on tonight',
    then: 'I watch it with someone, not alone with my phone',
    triggers: [0],
    contexts: ['game'],
    playId: 'watching-with-friends',
  },
  {
    id: 'game-phone-away',
    if: 'the game starts',
    then: 'my phone goes in another room until the final whistle',
    triggers: [0],
    contexts: ['game'],
    playId: 'block-the-apps',
  },
  {
    id: 'game-halftime',
    if: 'halftime comes and my thumb goes for the phone',
    then: 'I get up, get a glass of water and take a lap',
    triggers: [0],
    contexts: ['game'],
    playId: 'urge-surfing',
  },
  {
    id: 'game-group-chat',
    if: 'the group chat starts posting bets',
    then: 'I mute it until the game is over',
    triggers: [0, 7],
    contexts: ['game'],
    playId: 'group-chat',
  },
  {
    id: 'game-line',
    if: 'someone asks if I have anything on the game',
    then: 'I say "I\'m off betting, not off the game" and move on',
    triggers: [0],
    contexts: ['game'],
    playId: 'watching-with-friends',
  },
  {
    id: 'game-tight-finish',
    if: 'the game gets tight late',
    then: 'I remind myself nothing is riding on it, and that is the point',
    triggers: [0],
    contexts: ['game'],
    playId: 'urge-surfing',
  },
  {
    id: 'game-final',
    if: 'the final whistle goes',
    then: 'I close out the day in Winback before I open anything else',
    triggers: [0],
    contexts: ['game'],
    playId: 'urge-surfing',
  },

  // Payday ----------------------------------------------------------------
  {
    id: 'payday-move',
    if: 'my pay lands',
    then: 'I move the set amount to savings or bills before I open any other app',
    triggers: [1],
    contexts: ['payday'],
    playId: 'payday-plan',
  },
  {
    id: 'payday-bills-first',
    if: 'payday comes',
    then: 'rent and card payments go out first, the same morning',
    triggers: [1],
    contexts: ['payday'],
    playId: 'payday-plan',
  },
  {
    id: 'payday-name-it',
    if: 'I feel flush after getting paid',
    then: 'I say out loud what this money is for before I spend any of it',
    triggers: [1],
    contexts: ['payday'],
    playId: 'payday-plan',
  },
  {
    id: 'payday-promo',
    if: 'a payday offer lands in my inbox',
    then: 'I delete it unread and unsubscribe',
    triggers: [1, 7],
    contexts: ['payday'],
    playId: 'block-the-apps',
  },
  {
    id: 'payday-real-treat',
    if: 'I want to mark payday',
    then: 'I pick one real thing I planned for, like a meal out, and stop there',
    triggers: [1],
    contexts: ['payday'],
    playId: 'payday-plan',
  },
  {
    id: 'payday-tell',
    if: 'payday comes',
    then: 'I text my person that the money already has a job',
    triggers: [1],
    contexts: ['payday'],
    playId: 'payday-plan',
  },

  // Late night ------------------------------------------------------------
  {
    id: 'late-charger',
    if: 'it gets to bedtime',
    then: 'my phone charges outside the bedroom',
    triggers: [2],
    contexts: ['lateNight'],
    playId: 'block-the-apps',
  },
  {
    id: 'late-cant-sleep',
    if: "I can't sleep",
    then: 'I get up, read something on paper and leave the phone where it is',
    triggers: [2],
    contexts: ['lateNight'],
    playId: 'urge-surfing',
  },
  {
    id: 'late-reach',
    if: 'I reach for my phone in bed',
    then: 'I open the panic button instead of anything else',
    triggers: [2],
    contexts: ['lateNight'],
    playId: 'urge-surfing',
  },
  {
    id: 'late-game-off',
    if: 'a late game is still on',
    then: 'I turn it off at halftime and go to bed',
    triggers: [0, 2],
    contexts: ['lateNight'],
    playId: 'watching-with-friends',
    avoid: true,
  },
  {
    id: 'late-wall',
    if: 'the urge shows up after midnight',
    then: 'I remember the blocker is on and let the wave pass',
    triggers: [2],
    contexts: ['lateNight'],
    playId: 'block-the-apps',
  },

  // Weekend nights --------------------------------------------------------
  {
    id: 'weekend-plan',
    if: 'the weekend starts',
    then: 'Saturday afternoon has a plan before it arrives',
    triggers: [0, 4, 6],
    contexts: ['weekend'],
    playId: 'urge-surfing',
  },
  {
    id: 'weekend-one-game',
    if: 'a full weekend of games is on',
    then: 'I pick one to watch and skip the rest',
    triggers: [0],
    contexts: ['weekend'],
    playId: 'watching-with-friends',
    avoid: true,
  },
  {
    id: 'drink-cards',
    if: "I'm going out for drinks",
    then: 'I take the cash I planned to spend and leave the cards at home',
    triggers: [6],
    contexts: ['weekend'],
    playId: 'payday-plan',
  },
  {
    id: 'drink-say-it-early',
    if: "we're drinking and the game is on",
    then: "I tell one friend I'm off betting before the first round",
    triggers: [0, 6],
    contexts: ['weekend'],
    playId: 'watching-with-friends',
  },
  {
    id: 'drink-no-money-moves',
    if: "I've had a few",
    then: 'no money moves until the morning, whatever the reason',
    triggers: [6],
    contexts: ['weekend'],
    playId: 'payday-plan',
  },
  {
    id: 'drink-head-home',
    if: 'the bar starts talking bets',
    then: 'I head home at halftime',
    triggers: [0, 6],
    contexts: ['weekend'],
    playId: 'watching-with-friends',
    avoid: true,
  },

  // Chasing ---------------------------------------------------------------
  {
    id: 'chase-stop-tonight',
    if: 'I start thinking about winning it back',
    then: 'I remind myself the only sure way to stop losing tonight is to stop tonight',
    triggers: [3],
    contexts: ['default'],
    playId: 'the-chase',
  },
  {
    id: 'chase-job',
    if: "the number I'm down starts talking",
    then: "I write down one thing tomorrow's money is for",
    triggers: [3],
    contexts: ['default'],
    playId: 'the-chase',
  },
  {
    id: 'chase-text',
    if: 'I feel the pull to get even',
    then: 'I text my person before I do anything else',
    triggers: [3],
    contexts: ['default'],
    playId: 'the-chase',
  },
  {
    id: 'chase-wait',
    if: 'a win-it-back plan shows up in my head',
    then: 'I wait 20 minutes before I am allowed to do anything about it',
    triggers: [3],
    contexts: ['default'],
    playId: 'urge-surfing',
  },

  // Boredom ---------------------------------------------------------------
  {
    id: 'bored-evening-job',
    if: 'the evening is empty',
    then: 'I give it a job with a start time: the gym, a call, a show',
    triggers: [4],
    contexts: ['default', 'weekend'],
    playId: 'urge-surfing',
  },
  {
    id: 'bored-walk',
    if: "I'm bored and reaching for my phone",
    then: 'I go for a ten-minute walk first',
    triggers: [4],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'bored-reach-out',
    if: 'a flat night hits',
    then: "I call or text someone I haven't talked to this week",
    triggers: [4],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'bored-hands',
    if: 'I have a free hour',
    then: 'I spend it on something with my hands, not my phone',
    triggers: [4],
    contexts: ['default'],
    playId: 'urge-surfing',
  },

  // Stress ----------------------------------------------------------------
  {
    id: 'stress-halt',
    if: 'stress hits',
    then: 'I check HALT - hungry, angry, lonely or tired - and fix that first',
    triggers: [5],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'stress-breathe',
    if: 'the day goes sideways',
    then: 'I do two minutes of breathing before I decide anything',
    triggers: [5],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'stress-bills',
    if: 'money stress spikes',
    then: 'I remember a bet has never paid a bill, and I call someone instead',
    triggers: [3, 5],
    contexts: ['default'],
    playId: 'the-chase',
  },

  // Promos ----------------------------------------------------------------
  {
    id: 'promo-delete',
    if: 'a promo or boost lands',
    then: 'I delete it unread, then unsubscribe',
    triggers: [7],
    contexts: ['default'],
    playId: 'block-the-apps',
  },
  {
    id: 'promo-ad-break',
    if: 'a betting ad comes on during the game',
    then: 'I mute it and look at something else until play starts again',
    triggers: [0, 7],
    contexts: ['default', 'game'],
    playId: 'urge-surfing',
  },
  {
    id: 'promo-free-bet',
    if: 'a "free" bet offer arrives',
    then: 'I read it as what it is, an offer to get me back, and delete it',
    triggers: [7],
    contexts: ['default'],
    playId: 'the-chase',
  },

  // Any day ---------------------------------------------------------------
  {
    id: 'default-panic',
    if: 'an urge shows up today',
    then: 'I open the panic button before I open anything else',
    triggers: [],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'default-timer',
    if: 'an urge hits',
    then: 'I start a ten-minute timer and let it pass',
    triggers: [],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'default-i-dont-bet',
    if: 'someone brings up a bet',
    then: 'I say "I don\'t bet" and change the subject',
    triggers: [],
    contexts: ['default'],
    playId: 'group-chat',
  },
  {
    id: 'default-close-out',
    if: 'the day is done',
    then: 'I close it out in Winback before bed',
    triggers: [],
    contexts: ['default'],
    playId: 'urge-surfing',
  },
  {
    id: 'default-fences',
    if: 'my blocker starts to feel like too much',
    then: 'I leave it on anyway',
    triggers: [],
    contexts: ['default'],
    playId: 'block-the-apps',
  },
  {
    id: 'default-skip-scores',
    if: 'I feel the pull to check scores all day',
    then: 'I check once, after the game, and put the phone down',
    triggers: [0],
    contexts: ['default'],
    playId: 'group-chat',
    avoid: true,
  },
];

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

/** Look a plan up by id; undefined for an unknown (e.g. retired) id. */
export function planById(id: string): IfThenPlan | undefined {
  return BY_ID.get(id);
}
