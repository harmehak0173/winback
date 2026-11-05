import AsyncStorage from '@react-native-async-storage/async-storage';
import { getItemForWrite } from './storageRead';

/**
 * What was happening when an urge or a slip hit.
 *
 * The heatmap knew WHEN urges arrive and never knew WHY, which made the one
 * feature Premium is sold on a clock rather than an insight. Worse, the app
 * already asks for this in onboarding ("when do you find yourself betting the
 * most?") and then never shows the answer back, so it holds a genuinely useful
 * fact about the user from minute one and does nothing with it.
 *
 * Recording is local-first and never blocks a screen. Someone mid-craving is
 * not waiting on a network write, and the whole point is to ask at a moment
 * when any friction means they simply will not answer.
 *
 * The options are deliberately the SAME labels the quiz uses. The comparison
 * that makes this worth paying for - what you predicted against what actually
 * happens - only works if both sides speak the same vocabulary.
 */

const KEY = 'winback.triggerLog';
const MAX_ENTRIES = 500;

const listeners = new Set<(log: TriggerEntry[]) => void>();
// Read-modify-write, so writes are chained: two chips tapped in quick
// succession must not both read the same log and lose one entry.
let chain: Promise<unknown> = Promise.resolve();

export type TriggerKind = 'urge' | 'slip';

export interface TriggerEntry {
  /** Option label, matching the quiz's `triggers` options exactly. */
  label: string;
  kind: TriggerKind;
  /** ISO timestamp. */
  at: string;
}

/**
 * The pickable options, in the quiz's own words and order. Indexes 0-6 are
 * the quiz's `triggers` options exactly (TRIGGER_* in quiz-data.ts), so plans
 * and summaries can use one index space. The last two are not quiz answers:
 * nobody predicts "a promo" in onboarding, but the betting companies'
 * marketing is a trigger they aim on purpose, and logging it is how someone
 * sees how often it lands; and the urge to switch off a blocker is the moment
 * reviews of every blocker describe losing.
 */
export const TRIGGER_OPTIONS = [
  'When my teams are playing',
  'Right after payday',
  'Late at night',
  'After a loss, trying to win it back',
  "When I'm bored",
  "When I'm stressed",
  "When I've been drinking",
  'Saw a promo or ad',
  'Wanted to undo a block',
] as const;

/** Index of 'Saw a promo or ad' in TRIGGER_OPTIONS (not a quiz option). */
export const TRIGGER_PROMO = 7;
/**
 * Index of 'Wanted to undo a block' (not a quiz option). Reviews of every
 * gambling blocker say the same thing: it gets switched off in the middle of
 * an urge. Logging that moment is how someone sees it is an urge, not a
 * decision, and when it tends to come.
 */
export const TRIGGER_UNDO_BLOCK = 8;

/** Shorter labels for chips, so a picker does not become a wall of text. */
export const TRIGGER_SHORT: Record<string, string> = {
  'When my teams are playing': 'My teams playing',
  'Right after payday': 'Just got paid',
  'Late at night': 'Late night',
  'After a loss, trying to win it back': 'Chasing a loss',
  "When I'm bored": 'Bored',
  "When I'm stressed": 'Stressed',
  "When I've been drinking": 'Drinking',
  'Saw a promo or ad': 'Saw a promo',
  'Wanted to undo a block': 'Undoing a block',
};

function parseLog(raw: string | null): TriggerEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate rather than cast. A null or malformed element used to reach
    // summarise() and throw while Insights was rendering.
    return parsed.filter(
      (e): e is TriggerEntry =>
        !!e && typeof e === 'object' && typeof e.label === 'string' && typeof e.at === 'string',
    );
  } catch {
    return [];
  }
}

export async function readTriggerLog(): Promise<TriggerEntry[]> {
  try {
    return parseLog(await AsyncStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/** Record one. Never throws and never blocks the caller. */
export function logTrigger(label: string, kind: TriggerKind): Promise<void> {
  const entry: TriggerEntry = { label, kind, at: new Date().toISOString() };
  const run = chain.then(async () => {
    // Unreadable storage throws here and this entry is dropped, rather than
    // replacing the whole log with it.
    const log = parseLog(await getItemForWrite(KEY));
    log.push(entry);
    // Trim from the front: recent behaviour is what the summary is about, and
    // an unbounded list in AsyncStorage is a slow leak.
    const trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch {
      // A dropped entry is not worth interrupting anyone for.
    }
    for (const cb of listeners) cb(trimmed);
  });
  chain = run.catch(() => {});
  return run.catch(() => {});
}

/** Wipe, for account deletion. */
export function clearTriggerLog(): Promise<void> {
  const run = chain.then(async () => {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // nothing to do
    }
    for (const cb of listeners) cb([]);
  });
  chain = run.catch(() => {});
  return run.catch(() => {});
}

/**
 * Called with the whole log after every write, so derived views (today's
 * plays, the weekly recap) update without polling storage.
 */
export function subscribeTriggerLog(cb: (log: TriggerEntry[]) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * The TRIGGER_OPTIONS index logged most often as an urge within the last
 * `days` days, or null when nothing was logged. Ties go to the earlier option,
 * so it is stable rather than flipping between two equal triggers.
 */
export function topLoggedTrigger(log: TriggerEntry[], now: number, days = 30): number | null {
  const since = now - days * 86_400_000;
  const counts = new Array<number>(TRIGGER_OPTIONS.length).fill(0);
  for (const e of log) {
    if (e.kind !== 'urge') continue;
    const t = Date.parse(e.at);
    if (!Number.isFinite(t) || t < since) continue;
    const i = TRIGGER_OPTIONS.indexOf(e.label as (typeof TRIGGER_OPTIONS)[number]);
    if (i >= 0) counts[i] += 1;
  }
  let best = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0 && (best < 0 || counts[i] > counts[best])) best = i;
  }
  return best < 0 ? null : best;
}

export interface TriggerSummary {
  /** Labels ranked by how often they actually happened, most first. */
  ranked: { label: string; count: number }[];
  total: number;
  /** Predicted in onboarding and confirmed by real entries. */
  confirmed: string[];
  /** Predicted in onboarding but never actually logged. */
  predictedNotSeen: string[];
  /** Never predicted, but showing up in the log. The useful surprise. */
  surprises: string[];
}

/**
 * Compare what they said in onboarding against what actually happened.
 *
 * Pure so it can be tested directly. `predicted` is the set of labels chosen
 * in the quiz; `log` is what was recorded in the moment.
 */
export function summarise(log: TriggerEntry[], predicted: string[]): TriggerSummary {
  const counts = new Map<string, number>();
  for (const e of log) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);

  const ranked = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    // Ties broken by the canonical option order, so the display is stable
    // rather than reshuffling every time two triggers are level.
    .sort(
      (a, b) =>
        b.count - a.count ||
        TRIGGER_OPTIONS.indexOf(a.label as never) - TRIGGER_OPTIONS.indexOf(b.label as never),
    );

  const seen = new Set(counts.keys());
  const predictedSet = new Set(predicted);

  return {
    ranked,
    total: log.length,
    confirmed: predicted.filter((p) => seen.has(p)),
    predictedNotSeen: predicted.filter((p) => !seen.has(p)),
    surprises: ranked.map((r) => r.label).filter((l) => !predictedSet.has(l)),
  };
}

/**
 * The play that answers each trigger.
 *
 * A chart that names your worst trigger and then stops is a diagnosis with no
 * prescription. Every trigger maps to something in the playbook, so the insight
 * ends in an action rather than a fact.
 */
export const TRIGGER_PLAY: Record<string, string> = {
  'After a loss, trying to win it back': 'the-chase',
  'Right after payday': 'payday-plan',
  'When my teams are playing': 'watching-with-friends',
  'Late at night': 'block-the-apps',
  "When I'm bored": 'urge-surfing',
  "When I'm stressed": 'urge-surfing',
  "When I've been drinking": 'urge-surfing',
  'Saw a promo or ad': 'block-the-apps',
  'Wanted to undo a block': 'block-the-apps',
};
