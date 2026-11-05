import { useSyncExternalStore } from 'react';
import { MY_REASONS_KEY } from './secureAuthStorage';
import { readDeviceValue, writeDeviceValue } from './trial';

/**
 * Your reasons, in your own words: up to three short lines that the panic
 * screen shows back when an urge hits. Without them it shows the costs picked
 * in the quiz, which are ours, not theirs.
 *
 * Kept only on this phone, like your person's name and number: SecureStore
 * on native (AsyncStorage on the web test build, as in lib/trial.ts). Never
 * synced, never in a usage event, never on a discreet surface (widget,
 * reminders). Wiped with the rest of this account's local data, and on a
 * fresh install.
 */

/** Most reasons kept. */
export const MAX_REASONS = 3;
/** Longest reason, in characters: about one line on the panic screen. */
export const MAX_REASON_LENGTH = 60;

/** Trim, fold runs of spaces, cap the length, drop blanks and repeats. */
export function cleanReasons(input: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH).trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === MAX_REASONS) break;
  }
  return out;
}

let cache: string[] | null = null;
const listeners = new Set<() => void>();
const NONE: string[] = [];

function publish(next: string[]) {
  cache = next;
  for (const listener of listeners) listener();
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? cleanReasons(value) : [];
  } catch {
    return [];
  }
}

/** The saved reasons: [] when there are none or the read fails. */
export async function loadReasons(): Promise<string[]> {
  const reasons = parse(await readDeviceValue(MY_REASONS_KEY));
  publish(reasons);
  return reasons;
}

/**
 * Save them (an empty list removes them). Resolves true only when the phone
 * kept them: the write is read back, because the secure store can refuse a
 * write without saying so. Either way the panic screen shows the new ones
 * for as long as Winback stays open.
 */
export async function saveReasons(input: readonly unknown[]): Promise<boolean> {
  const reasons = cleanReasons(input);
  const value = reasons.length ? JSON.stringify(reasons) : null;
  await writeDeviceValue(MY_REASONS_KEY, value);
  publish(reasons);
  return (await readDeviceValue(MY_REASONS_KEY)) === value;
}

/** Forget them on this phone: account erase and switching accounts. */
export async function clearReasons(): Promise<void> {
  publish([]);
  await writeDeviceValue(MY_REASONS_KEY, null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (cache === null) void loadReasons();
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => cache ?? NONE;

/** The saved reasons, read once and kept current on every screen using them. */
export function useMyReasons(): string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
