/**
 * Sports schedule abstraction for game-day mode.
 *
 * Consumers never import a concrete provider directly: the app swaps one in at
 * start via `setScheduleProvider()` (TheSportsDB today, a paid feed later).
 *
 * Consumers:
 *  - The reminder engine (notifications.ts): pre-game, halftime and
 *    post-game check-ins for saved teams (Premium).
 *  - The You tab's team search.
 *
 * Every provider method must settle quickly and never throw: a hung or failed
 * request has to degrade to "no games" rather than stall the reminder rebuild,
 * which is serialized behind it.
 */

/** Leagues mirror the Q2 sports multi-select. */
export type League =
  | 'nfl'
  | 'nba'
  | 'nhl'
  | 'mlb'
  | 'ncaaf'
  | 'ncaab'
  | 'soccer'
  | 'ufc'
  | 'boxing';

export interface Team {
  id: string;
  league: League;
  name: string;
  abbreviation: string;
}

export interface Game {
  id: string;
  league: League;
  homeTeam: Team;
  awayTeam: Team;
  /** Scheduled start, UTC. */
  startsAt: Date;
  /**
   * Best-effort start of the break that live in-game promos push hardest
   * into (halftime, or hockey's first intermission). Absent for sports with
   * no such break (baseball, fights).
   */
  estimatedHalftimeAt?: Date;
  /** Best-effort end, for the post-game close-out. Absent for fight cards. */
  estimatedEndAt?: Date;
}

/** Result of a games fetch. `complete` is false when any request failed. */
export interface UpcomingGames {
  games: Game[];
  /** Every team's schedule was read. A partial read must not replace a cache. */
  complete: boolean;
  /** At least one team's schedule was read. */
  anyOk: boolean;
}

/** Result of a team search. */
export interface TeamSearch {
  teams: Team[];
  /**
   * The source answered. False for a refused key, a server error, a timeout
   * or no network, so the app never says "no team by that name" when the
   * truth is that the search did not run.
   */
  ok: boolean;
}

export interface ScheduleProvider {
  /** Search teams so the user can pick theirs during game-day setup. */
  searchTeams(query: string, leagues?: League[]): Promise<TeamSearch>;
  /** Upcoming games for the user's teams inside a window (for scheduling check-ins). */
  getUpcomingGames(teams: Team[], withinDays: number): Promise<UpcomingGames>;
}

/**
 * Minutes from start to the break, per league. Football and basketball have a
 * halftime; hockey's first intermission plays the same part; soccer's half is
 * 45 minutes plus stoppage. Baseball and fight cards have no single break, so
 * no pulse check is scheduled for them.
 */
export const HALFTIME_OFFSET_MIN: Record<League, number | null> = {
  nfl: 95,
  ncaaf: 100,
  nba: 75,
  ncaab: 55,
  nhl: 40,
  soccer: 48,
  mlb: null,
  ufc: null,
  boxing: null,
};

/**
 * Typical start-to-final minutes, per league, for the post-game close-out.
 * Rough on purpose: the push says "that's the game", never a score, so
 * landing a few minutes early or late costs nothing. Fight cards run for
 * hours with no fixed end, so they get no post-game push.
 */
export const GAME_LENGTH_MIN: Record<League, number | null> = {
  nfl: 195,
  ncaaf: 210,
  nba: 150,
  ncaab: 120,
  nhl: 160,
  mlb: 165,
  soccer: 115,
  ufc: null,
  boxing: null,
};

/** Fill in the league-based estimates for a game's break and end. */
export function withEstimates(game: Omit<Game, 'estimatedHalftimeAt' | 'estimatedEndAt'>): Game {
  const start = game.startsAt.getTime();
  const half = HALFTIME_OFFSET_MIN[game.league];
  const length = GAME_LENGTH_MIN[game.league];
  return {
    ...game,
    ...(half != null ? { estimatedHalftimeAt: new Date(start + half * 60_000) } : {}),
    ...(length != null ? { estimatedEndAt: new Date(start + length * 60_000) } : {}),
  };
}

/** Placeholder used when no data source is configured. Returns empty data. */
class StubScheduleProvider implements ScheduleProvider {
  async searchTeams(): Promise<TeamSearch> {
    return { teams: [], ok: true };
  }
  async getUpcomingGames(): Promise<UpcomingGames> {
    return { games: [], complete: true, anyOk: true };
  }
}

let provider: ScheduleProvider = new StubScheduleProvider();

export function getScheduleProvider(): ScheduleProvider {
  return provider;
}

/** Swap in a real implementation at app start. */
export function setScheduleProvider(p: ScheduleProvider): void {
  provider = p;
}
