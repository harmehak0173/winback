import {
  type Game,
  type League,
  type ScheduleProvider,
  type Team,
  type TeamSearch,
  type UpcomingGames,
  withEstimates,
} from './ScheduleProvider';

/**
 * ScheduleProvider backed by TheSportsDB's v1 API.
 *
 * The key comes from EXPO_PUBLIC_THESPORTSDB_KEY. The old shared free key "3"
 * is switched off (every request answers 403), and TheSportsDB's terms allow
 * its free test key "123" for development only: an app in a store needs a
 * paid key. So a production build uses the configured key and nothing else
 * (scripts/check-build-env.mjs refuses a production build or update without
 * one), and only development and preview builds fall back to the test key.
 * The key ships in the bundle like every EXPO_PUBLIC_ value, so only a key
 * that is fine to be public belongs there.
 *
 * All failures degrade to empty results, and every request is bounded by a
 * timeout: React Native's fetch has none on Android, and a hung request here
 * used to stall the whole serialized reminder rebuild. A team search also
 * says whether the source answered, so a failure is never shown as "no team
 * found".
 */
const TEST_KEY = '123';
const KEY =
  process.env.EXPO_PUBLIC_THESPORTSDB_KEY ||
  (process.env.EXPO_PUBLIC_APP_ENV === 'production' ? '' : TEST_KEY);
/** null in a production build with no key: the source is unavailable. */
const BASE = KEY ? `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(KEY)}` : null;

const REQUEST_TIMEOUT_MS = 6000;
/** A rebuild runs on every foreground; the schedule does not change that fast. */
const GAMES_TTL_MS = 30 * 60_000;
/**
 * A game that started this recently is still kept. Its halftime and
 * post-game reminders are still ahead, and a rebuild mid-game (tapping the
 * halftime push is a foreground) must not drop them. Matches the engine's
 * own window in reminderPlan.buildCandidates.
 */
const IN_PROGRESS_MS = 4 * 3_600_000;

interface SportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string | null;
  strSport?: string | null;
  strLeague?: string | null;
}

interface SportsDbEvent {
  idEvent: string;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strTimestamp?: string | null; // "2026-09-13T17:00:00" (UTC)
  dateEvent?: string | null;
  strTime?: string | null;
  strTimeLocal?: string | null;
  strSport?: string | null;
  strLeague?: string | null;
  strStatus?: string | null;
  strPostponed?: string | null;
}

/**
 * League from sport plus league name. The league name separates college from
 * pro: "Lakers" on the free key finds an NCAA football side, which the old
 * sport-only mapping filed as NFL and let through an NFL-only filter.
 */
function toLeague(sport?: string | null, league?: string | null): League | null {
  const college = /\bNCAA\b|college/i.test(league ?? '');
  switch (sport) {
    case 'American Football':
      return college ? 'ncaaf' : 'nfl';
    case 'Basketball':
      return college ? 'ncaab' : 'nba';
    case 'Ice Hockey':
      return 'nhl';
    case 'Baseball':
      return 'mlb';
    case 'Soccer':
      return 'soccer';
    case 'Fighting':
      return 'ufc';
    case 'Boxing':
      return 'boxing';
    default:
      return null;
  }
}

/** Statuses that mean there is no game to check in for. */
const DEAD_STATUS = /^(CANC|PST|ABD|SUSP|AWD|WO|FT|AET|AOT|PEN)$|cancel|postpon|abandon|finish/i;

/**
 * The start time, or null when the event has none worth scheduling around.
 *
 * Unconfirmed kickoffs come back as midnight Eastern - 04:00Z in daylight
 * time, 05:00Z in standard time - on the hour, with no local time. A
 * reminder built on that lands in the middle of the night or on the wrong
 * day, so such events are skipped until the time is confirmed; the next
 * rebuild picks them up. Only those two sentinel hours: 00:00Z to 03:00Z on
 * the hour are real 8pm to 11pm Eastern starts, common in the NBA, NHL and
 * MLB, and must not be dropped just because a feed left out the local time.
 */
function eventStart(e: SportsDbEvent): Date | null {
  let d: Date | null = null;
  if (e.strTimestamp) {
    const t = new Date(e.strTimestamp.endsWith('Z') ? e.strTimestamp : e.strTimestamp + 'Z');
    if (!Number.isNaN(t.getTime())) d = t;
  }
  if (!d && e.dateEvent && e.strTime) {
    const t = new Date(`${e.dateEvent}T${e.strTime}Z`);
    if (!Number.isNaN(t.getTime())) d = t;
  }
  if (!d) return null;
  const hour = d.getUTCHours();
  const placeholder =
    !e.strTimeLocal && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && (hour === 4 || hour === 5);
  return placeholder ? null : d;
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class TheSportsDbProvider implements ScheduleProvider {
  private cache: { key: string; at: number; result: UpcomingGames } | null = null;

  async searchTeams(query: string, leagues?: League[]): Promise<TeamSearch> {
    const q = query.trim();
    if (!q) return { teams: [], ok: true };
    if (!BASE) return { teams: [], ok: false };
    // null is a failed request; `teams: null` is the source's "no match".
    const data = await getJson<{ teams: SportsDbTeam[] | null }>(
      `${BASE}/searchteams.php?t=${encodeURIComponent(q)}`,
    );
    if (!data) return { teams: [], ok: false };
    const out: Team[] = [];
    for (const t of data.teams ?? []) {
      const league = toLeague(t.strSport, t.strLeague);
      if (!league || !t.idTeam || !t.strTeam) continue;
      if (leagues?.length && !leagues.includes(league)) continue;
      out.push({ id: t.idTeam, league, name: t.strTeam, abbreviation: t.strTeamShort || t.strTeam });
    }
    return { teams: out, ok: true };
  }

  async getUpcomingGames(teams: Team[], withinDays: number): Promise<UpcomingGames> {
    if (!BASE) return { games: [], complete: teams.length === 0, anyOk: teams.length === 0 };
    const key = `${withinDays}|${teams.map((t) => t.id).sort().join(',')}`;
    if (this.cache && this.cache.key === key && Date.now() - this.cache.at < GAMES_TTL_MS) {
      return this.cache.result;
    }
    const now = Date.now();
    const horizon = now + withinDays * 86_400_000;
    // One request per team, in parallel: each is bounded by the timeout, so the
    // whole fetch takes at most one timeout, not one per team.
    const responses = await Promise.all(
      teams.map((team) =>
        getJson<{ events: SportsDbEvent[] | null }>(
          `${BASE}/eventsnext.php?id=${encodeURIComponent(team.id)}`,
        ),
      ),
    );
    const seen = new Set<string>();
    const games: Game[] = [];
    let failed = 0;
    for (const data of responses) {
      if (!data) {
        failed += 1;
        continue;
      }
      for (const e of data.events ?? []) {
        if (!e.idEvent || seen.has(e.idEvent)) continue;
        if (e.strPostponed === 'yes' || DEAD_STATUS.test(e.strStatus ?? '')) continue;
        const league = toLeague(e.strSport, e.strLeague);
        const startsAt = eventStart(e);
        if (!league || !startsAt) continue;
        if (startsAt.getTime() <= now - IN_PROGRESS_MS || startsAt.getTime() > horizon) continue;
        seen.add(e.idEvent);
        const mk = (id: string | null | undefined, name: string | null | undefined): Team => ({
          id: id ?? name ?? 'unknown',
          league,
          name: name ?? 'TBD',
          abbreviation: name ?? 'TBD',
        });
        games.push(
          withEstimates({
            id: e.idEvent,
            league,
            homeTeam: mk(e.idHomeTeam, e.strHomeTeam),
            awayTeam: mk(e.idAwayTeam, e.strAwayTeam),
            startsAt,
          }),
        );
      }
    }
    const result: UpcomingGames = {
      games: games.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
      complete: failed === 0,
      anyOk: failed < teams.length || teams.length === 0,
    };
    // Only a full read is worth reusing; a failed one is retried next time.
    this.cache = result.complete ? { key, at: now, result } : null;
    return result;
  }
}
