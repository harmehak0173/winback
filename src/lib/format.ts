/** "$12,345" - whole-dollar formatting used across the reveal and counters. */
export function formatDollars(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Split a money amount into ["1,234", "56"] for the big-int / small-dec layout. */
export function splitMoney(amount: number): [string, string] {
  const [int, dec] = amount.toFixed(2).split('.');
  return [Number(int).toLocaleString('en-US'), dec];
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Elapsed ms → "HH:MM:SS" within the current day (streak clock). */
export function hmsWithinDay(elapsedMs: number): string {
  const totalSec = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hh = Math.floor((totalSec % 86400) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

/** Elapsed ms → "M:SS" (panic urge timer). */
export function minSec(elapsedMs: number): string {
  const s = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

export const DAY_MS = 86_400_000;
