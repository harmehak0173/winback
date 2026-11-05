import { addDays, daysBetween, type DayKey } from '@/lib/day';
import type { League } from '@/lib/schedule/ScheduleProvider';

/**
 * Big game plans: the dates the betting companies circle, claimed back
 * (hook 15).
 *
 * Only dates verified against the league's own published schedule ship here.
 * A wrong date undermines trust in every other reminder, so an event whose
 * dates cannot be confirmed is left out rather than estimated. There is no
 * remote config: each season's list ships with a release (or an OTA update).
 *
 * Copy is about the user's plan and the betting companies' marketing - never
 * matchups, stakes or any bet. Eligibility comes from the quiz sports answer
 * or a saved team's league, so nobody sees an event for a sport they do not
 * follow. Discreet pushes never name the event.
 *
 * Verified 2026-09-27:
 * - MLB postseason: mlb.com/news/2026-mlb-playoff-and-world-series-schedule
 *   (Wild Card Sept. 29 - Oct. 1; World Series Oct. 23 - Oct. 31 if needed).
 * - NFL Thanksgiving: nfl.com/news/thanksgiving-2026-nfl-schedule-release
 *   (Thanksgiving Eve game Nov. 25; tripleheader Thu Nov. 26).
 * - NFL playoffs and Super Bowl LXI: nfl.com/news/2026-27-national-football-league-important-dates
 *   (Wild Card Jan. 16-18; Conference Championships Jan. 31; Super Bowl Feb. 14).
 * - Men's NCAA tournament: ncaa.org (76-team bracket announcement, opening
 *   round March 16) and ncaa.com (Selection Sunday March 14; Final Four
 *   April 3 and 5, Detroit).
 * NBA and NHL playoff dates for 2027 were not yet published, so they are not here.
 */

export interface BigEvent {
  id: string;
  /** How the card names it. Never used in a discreet push. */
  name: string;
  /** Quiz `sports` option indexes that make it relevant. */
  sports: number[];
  /** Saved-team leagues that make it relevant. */
  leagues: League[];
  /** First day the countdown card and prep items show. */
  prepFrom: DayKey;
  /** First game day of the event. */
  startsOn: DayKey;
  /** Last possible game day. */
  endsOn: DayKey;
  /** The official page the dates were checked against. */
  source: string;
}

/** Quiz `sports` indexes: 0 NFL, 1 NBA, 2 NHL / MLB, 3 College, 4 Soccer, 5 UFC / boxing, 6 Other. */
export const BIG_EVENTS: BigEvent[] = [
  {
    id: 'mlb-postseason-2026',
    name: 'the MLB postseason',
    sports: [2],
    leagues: ['mlb'],
    prepFrom: '2026-09-22',
    startsOn: '2026-09-29',
    endsOn: '2026-10-31',
    source: 'https://www.mlb.com/news/2026-mlb-playoff-and-world-series-schedule',
  },
  {
    id: 'nfl-thanksgiving-2026',
    name: 'the Thanksgiving games',
    sports: [0],
    leagues: ['nfl'],
    prepFrom: '2026-11-19',
    startsOn: '2026-11-25',
    endsOn: '2026-11-26',
    source: 'https://www.nfl.com/news/thanksgiving-2026-nfl-schedule-release',
  },
  {
    id: 'nfl-playoffs-2027',
    name: 'the NFL playoffs',
    sports: [0],
    leagues: ['nfl'],
    prepFrom: '2027-01-09',
    startsOn: '2027-01-16',
    endsOn: '2027-01-31',
    source: 'https://www.nfl.com/news/2026-27-national-football-league-important-dates',
  },
  {
    id: 'super-bowl-lxi',
    name: 'the Super Bowl',
    sports: [0],
    leagues: ['nfl'],
    prepFrom: '2027-02-07',
    startsOn: '2027-02-14',
    endsOn: '2027-02-14',
    source: 'https://www.nfl.com/news/2026-27-national-football-league-important-dates',
  },
  {
    id: 'march-madness-2027',
    name: 'March Madness',
    sports: [3],
    leagues: ['ncaab'],
    prepFrom: '2027-03-09',
    startsOn: '2027-03-16',
    endsOn: '2027-04-05',
    source: 'https://www.ncaa.com/news/basketball-men/article/2026-05-07/2027-march-madness-mens-ncaa-tournament-schedule-dates',
  },
];

export interface PrepItem {
  text: string;
  /** Playbook play id, or empty string. */
  playId: string;
}

/** One 30-second prep item a day in the run-up. Nothing here names a bet. */
export const PREP_ITEMS: PrepItem[] = [
  { text: 'Decide where you will watch it, and with whom.', playId: 'watching-with-friends' },
  { text: "Tell whoever is hosting that you're off betting, before the day.", playId: 'watching-with-friends' },
  { text: 'Skip the office pool or bracket this year, even the free one.', playId: 'group-chat' },
  { text: 'Check that your blocker and self-exclusion are still on.', playId: 'block-the-apps' },
  { text: 'Expect the promos to arrive right on schedule, and unsubscribe from the first one.', playId: 'block-the-apps' },
  { text: 'Plan to mute the group chat for the day.', playId: 'group-chat' },
  { text: 'Pick what you will do at halftime or between games.', playId: 'urge-surfing' },
  { text: "Move this week's money where it has a job before the day comes.", playId: 'payday-plan' },
];

export type BigEventPhase = 'prep' | 'live' | 'after';

export interface ActiveBigEvent {
  event: BigEvent;
  phase: BigEventPhase;
  /** Days until startsOn (0 once it has started). */
  daysToGo: number;
  /** Today's prep item (prep and live phases). */
  prep: PrepItem;
}

/**
 * The event that matters today for this user, if any: the prep window, the
 * event itself, or the one day after it ends (for "you watched it clean").
 * Pure; the first matching event in date order wins.
 */
export function activeBigEvent(
  today: DayKey,
  sports: number[],
  teamLeagues: League[],
): ActiveBigEvent | null {
  for (const event of BIG_EVENTS) {
    const relevant =
      event.sports.some((s) => sports.includes(s)) ||
      event.leagues.some((l) => teamLeagues.includes(l));
    if (!relevant) continue;
    if (daysBetween(event.prepFrom, today) < 0) continue;
    if (daysBetween(addDays(event.endsOn, 1), today) > 0) continue;
    const toStart = daysBetween(today, event.startsOn);
    const phase: BigEventPhase =
      toStart > 0 ? 'prep' : daysBetween(event.endsOn, today) > 0 ? 'after' : 'live';
    const n = daysBetween(event.prepFrom, today);
    return {
      event,
      phase,
      daysToGo: Math.max(0, toStart),
      prep: PREP_ITEMS[((n % PREP_ITEMS.length) + PREP_ITEMS.length) % PREP_ITEMS.length],
    };
  }
  return null;
}
