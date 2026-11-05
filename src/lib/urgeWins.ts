import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './analytics';
import { getItemForWrite } from './storageRead';

/**
 * Urges ridden out: the wins column.
 *
 * A number that only goes up. A slip resets the streak, and it must never
 * touch this: someone who rode out forty urges and then lost one still rode
 * out forty, and telling them so is the opposite of the all-or-nothing story
 * that turns one bet into a lost month.
 *
 * Local-first and on this device only. It is written the moment someone taps
 * "I'm past it", often shaky and offline, and nothing about it needs a server.
 * The recent list is capped for storage; the lifetime total is kept on its
 * own, so the cap never makes the count stall or shrink.
 */

const KEY = 'winback.urgeWins';
const MAX_ENTRIES = 500;

export type UrgeWinSource = 'panic' | 'quick' | 'closeout';

export interface UrgeWin {
  /** ISO time the win was logged. */
  at: string;
  source: UrgeWinSource;
  /** ISO time the urge started (panic sessions), when known. */
  startedAt?: string;
}

export interface UrgeWinStore {
  /** Lifetime count. Never decreases. */
  total: number;
  /** The most recent wins, oldest first, at most 500. */
  wins: UrgeWin[];
}

const EMPTY: UrgeWinStore = { total: 0, wins: [] };
const SOURCES: readonly UrgeWinSource[] = ['panic', 'quick', 'closeout'];

const listeners = new Set<(store: UrgeWinStore) => void>();
// Read-modify-write, so writes are chained: two quick taps must not both read
// the same list and have the second write drop the first win.
let chain: Promise<unknown> = Promise.resolve();

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

function validWin(v: unknown): v is UrgeWin {
  if (!v || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  return (
    isIso(w.at) &&
    SOURCES.includes(w.source as UrgeWinSource) &&
    (w.startedAt === undefined || isIso(w.startedAt))
  );
}

function parseStore(raw: string | null): UrgeWinStore {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY;
    const p = parsed as Record<string, unknown>;
    const wins = Array.isArray(p.wins) ? p.wins.filter(validWin).slice(-MAX_ENTRIES) : [];
    const total =
      typeof p.total === 'number' && Number.isFinite(p.total) && p.total >= 0 ? Math.trunc(p.total) : 0;
    // The total can never be below what is visibly in the list.
    return { total: Math.max(total, wins.length), wins };
  } catch {
    return EMPTY;
  }
}

async function readStore(): Promise<UrgeWinStore> {
  try {
    return parseStore(await AsyncStorage.getItem(KEY));
  } catch {
    return EMPTY;
  }
}

/** The lifetime total and the recent wins. Never throws. */
export function readUrgeWins(): Promise<UrgeWinStore> {
  return readStore();
}

/** Lifetime count of urges ridden out. */
export async function urgeWinCount(): Promise<number> {
  return (await readStore()).total;
}

/**
 * Log one urge ridden out. Never throws and never blocks the caller: the
 * person tapping this has just come through a craving and is not waiting on
 * storage. `startedAt` is when the urge began (the panic session's open), so
 * the heatmap places it at the moment it hit rather than when it ended.
 */
export function logUrgeWin(source: UrgeWinSource, startedAt?: string): Promise<void> {
  const at = new Date().toISOString();
  const win: UrgeWin = isIso(startedAt) ? { at, source, startedAt } : { at, source };
  track('urge_won', { source });
  const run = chain.then(async () => {
    // Unreadable storage throws here and the win goes unlogged: one lost
    // entry, never a lifetime total reset to 1.
    const store = parseStore(await getItemForWrite(KEY));
    const wins = [...store.wins, win].slice(-MAX_ENTRIES);
    const next = { total: store.total + 1, wins };
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Unwritable storage: still show the win for this session.
    }
    for (const cb of listeners) cb(next);
  });
  chain = run.catch(() => {});
  return run.catch(() => {});
}

/** Wipe, for account deletion. */
export function clearUrgeWins(): Promise<void> {
  const run = chain.then(async () => {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {}
    for (const cb of listeners) cb(EMPTY);
  });
  chain = run.catch(() => {});
  return run.catch(() => {});
}

/** Called with the new store after every write. */
export function subscribeUrgeWins(cb: (store: UrgeWinStore) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
