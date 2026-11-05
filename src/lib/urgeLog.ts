import AsyncStorage from '@react-native-async-storage/async-storage';
import { consentKnown } from './analytics';
import { getItemForWrite } from './storageRead';
import { ensureSession, supabase } from './supabase';

/**
 * Panic-session logging. Timing only, no content: this is the raw material
 * for the trigger heatmap.
 *
 * Every open is recorded on the device first, then mirrored to urge_events
 * when a backend is configured and reachable. The heatmap used to read only
 * the server, so it was empty offline, empty while the backend was down, and
 * empty for every session opened on a plane - the heatmap Premium is sold on
 * depended on the one part of the stack a craving does not wait for.
 */

const OPENS_KEY = 'winback.urgeOpens';
const MAX_OPENS = 500;

let chain: Promise<unknown> = Promise.resolve();

function parseOpens(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)))
      : [];
  } catch {
    return [];
  }
}

/** ISO times of recent panic-screen opens on this device, oldest first. */
export async function readUrgeOpens(): Promise<string[]> {
  try {
    return parseOpens(await AsyncStorage.getItem(OPENS_KEY));
  } catch {
    return [];
  }
}

function noteOpenLocally(at: string): void {
  chain = chain
    .then(async () => {
      // Unreadable storage throws here: this open goes unrecorded rather
      // than replacing the heatmap's whole history.
      const opens = parseOpens(await getItemForWrite(OPENS_KEY));
      opens.push(at);
      await AsyncStorage.setItem(OPENS_KEY, JSON.stringify(opens.slice(-MAX_OPENS)));
    })
    .catch(() => {});
}

/** The server row for one panic session, once the insert has landed. */
export type UrgeSession = { id: number; userId: string } | null;

/**
 * Record a panic session. Resolves to its server row (null offline, before
 * consent, or without a backend): the caller hands that same promise to
 * logUrgeEnd, so a session closed before its insert landed still stamps its
 * own row, never the next session's.
 */
export async function logUrgeStart(): Promise<UrgeSession> {
  noteOpenLocally(new Date().toISOString());
  const sb = supabase;
  if (!sb) return null;
  try {
    // Nothing leaves the phone before "Agree and start". Panic is reachable
    // by a link on a fresh install, before anyone has agreed to anything.
    if (!(await consentKnown())) return null;
    const userId = await ensureSession();
    if (!userId) return null;
    const { data, error } = await sb
      .from('urge_events')
      .insert({ user_id: userId })
      .select('id')
      .single();
    if (error || !data) return null;
    return { id: data.id as number, userId };
  } catch {
    // offline - the local record above still counts
    return null;
  }
}

export async function logUrgeEnd(started: Promise<UrgeSession>): Promise<void> {
  const sb = supabase;
  // Waits for this session's own insert, however long it took.
  const session = await started.catch(() => null);
  if (!sb || !session) return;
  try {
    // Owner clause is defense-in-depth: RLS already scopes this to the caller,
    // but the explicit user_id filter means integrity never rests on RLS alone.
    await sb
      .from('urge_events')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('user_id', session.userId);
  } catch {
    // offline - skip
  }
}

/** Wipe the local open log, for account deletion. */
export function clearUrgeLog(): Promise<void> {
  const run = chain.then(() => AsyncStorage.removeItem(OPENS_KEY)).catch(() => {});
  chain = run;
  return run;
}
