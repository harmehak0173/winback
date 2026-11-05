import { ensureSession, supabase, withTimeout } from './supabase';
import { readTriggerLog } from './triggers';
import { readUrgeOpens } from './urgeLog';
import { readUrgeWins } from './urgeWins';

/**
 * Trigger insights: aggregate the user's own urge moments into a
 * day-of-week x time-of-day grid so the app can show them WHEN their urges
 * actually hit.
 *
 * Local first. The grid is built from what this device recorded - panic opens,
 * urges ridden out (panic, quick log, close-out close calls) and urge tags from
 * the trigger picker - and the server's urge_events only supplement it (older
 * history, another phone). It used to read the server alone, so it was blank
 * offline and while the backend was down.
 *
 * One moment can leave several traces (a panic open, the trigger tagged on
 * that screen, the "I'm past it" win), so traces within ten minutes of each
 * other count once. RLS scopes the server query to the caller's own rows.
 */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const BLOCK_LABELS = ['Morning', 'Afternoon', 'Evening', 'Late night'];

/** Traces closer together than this are the same urge. */
const SAME_URGE_MS = 10 * 60_000;
/** The server supplement must never hold the Insights tab on a spinner. */
const SERVER_TIMEOUT_MS = 6_000;

function blockOf(hour: number): number {
  if (hour >= 6 && hour < 12) return 0; // morning
  if (hour >= 12 && hour < 18) return 1; // afternoon
  if (hour >= 18 && hour < 24) return 2; // evening
  return 3; // late night (0-6)
}
// JS getDay(): 0=Sun..6=Sat -> our Mon-first index 0=Mon..6=Sun.
const dayIndex = (d: Date) => (d.getDay() + 6) % 7;

export interface UrgePattern {
  grid: number[][]; // [block 0..3][day 0..6]
  total: number;
  peak: { block: number; day: number; count: number } | null;
}

const emptyGrid = () => Array.from({ length: 4 }, () => Array<number>(7).fill(0));

/**
 * Pure: bucket urge moments (epoch ms) into the grid, counting traces within
 * ten minutes of each other once. Exported so the rule is testable.
 */
export function buildUrgePattern(times: number[]): UrgePattern {
  const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
  const grid = emptyGrid();
  let total = 0;
  let peak: UrgePattern['peak'] = null;
  let lastKept = Number.NEGATIVE_INFINITY;
  for (const ms of sorted) {
    if (ms - lastKept < SAME_URGE_MS) continue;
    lastKept = ms;
    const t = new Date(ms);
    const b = blockOf(t.getHours());
    const d = dayIndex(t);
    grid[b][d] += 1;
    total += 1;
    if (!peak || grid[b][d] > peak.count) peak = { block: b, day: d, count: grid[b][d] };
  }
  return { grid, total, peak };
}

async function serverUrgeTimes(): Promise<number[]> {
  const sb = supabase;
  if (!sb) return [];
  try {
    const userId = await ensureSession();
    if (!userId) return [];
    const { data, error } = await sb
      .from('urge_events')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return data.map((row) => Date.parse(row.started_at as string));
  } catch {
    return [];
  }
}

export async function fetchUrgePattern(): Promise<UrgePattern> {
  const [opens, wins, log, server] = await Promise.all([
    readUrgeOpens(),
    readUrgeWins(),
    readTriggerLog(),
    withTimeout(serverUrgeTimes(), SERVER_TIMEOUT_MS, [] as number[]),
  ]);
  const times = [
    ...opens.map((iso) => Date.parse(iso)),
    ...wins.wins.map((w) => Date.parse(w.startedAt ?? w.at)),
    // Only urges: a slip is not an urge ridden out, and it is not a moment
    // the heatmap should teach someone to expect.
    ...log.filter((e) => e.kind === 'urge').map((e) => Date.parse(e.at)),
    ...server,
  ];
  return buildUrgePattern(times);
}

/** One-line, plain-language read of the peak cell. */
export function peakSentence(p: UrgePattern): string | null {
  if (!p.peak || p.total < 3) return null;
  const day = DAY_LABELS[p.peak.day];
  const block = BLOCK_LABELS[p.peak.block].toLowerCase();
  return `Your urges cluster on ${day} ${block === 'late night' ? 'late nights' : block + 's'}. Line up a plan for that window.`;
}
