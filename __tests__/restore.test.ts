/**
 * Signing in must never mistake "could not read the account" for "the account
 * is empty": that told people their history was gone and let onboarding upload
 * a new quit date over the real one.
 */
type Mode = 'ok' | 'error' | 'hang';
const mockBackend: { mode: Record<string, Mode>; rows: Record<string, unknown>; session: string | null } = {
  mode: {},
  rows: {},
  session: 'user-B',
};

jest.mock('@/lib/supabase', () => {
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const step of ['select', 'eq', 'gte', 'order', 'limit', 'maybeSingle']) chain[step] = () => chain;
    chain.then = (resolve: (v: unknown) => void) => {
      const mode = mockBackend.mode[table] ?? 'ok';
      if (mode === 'hang') return;
      if (mode === 'error') return resolve({ data: null, error: { message: 'Network request failed' } });
      return resolve({ data: mockBackend.rows[table] ?? null, error: null });
    };
    return chain;
  };
  return {
    supabase: { from: (table: string) => query(table) },
    ensureSession: async () => mockBackend.session,
    withTimeout: <T,>(p: PromiseLike<T>, ms: number, fallback: T) =>
      new Promise<T>((resolve) => {
        const t = setTimeout(() => resolve(fallback), ms);
        Promise.resolve(p).then(
          (v) => {
            clearTimeout(t);
            resolve(v);
          },
          () => {
            clearTimeout(t);
            resolve(fallback);
          },
        );
      }),
  };
});

import { restoreFromServer } from '@/lib/restore';

const all = (m: Mode) => ({ profiles: m, quiz_answers: m, check_ins: m });

beforeEach(() => {
  mockBackend.mode = {};
  mockBackend.rows = {};
  mockBackend.session = 'user-B';
});

it('reports a failed read as failed, not as an empty account', async () => {
  mockBackend.mode = all('error');
  const r = await restoreFromServer();
  expect(r.failed).toBe(true);
  expect(r.found).toBe(false);
});

it('reports a truly empty account as empty', async () => {
  const r = await restoreFromServer();
  expect(r).toMatchObject({ failed: false, found: false, userId: 'user-B' });
});

it('fails the whole restore when only the profile read fails (no "welcome back" without a streak)', async () => {
  mockBackend.mode = { profiles: 'error' };
  mockBackend.rows = { check_ins: [{ day: '2026-10-20' }] };
  const r = await restoreFromServer();
  expect(r.failed).toBe(true);
});

it('restores a real profile', async () => {
  mockBackend.rows = { profiles: { quit_at: '2026-09-01T10:00:00Z', monthly_spend: 300 } };
  const r = await restoreFromServer();
  expect(r).toMatchObject({ found: true, failed: false, quitDate: '2026-09-01T10:00:00Z', monthlySpend: 300 });
});

it('drops a quit date that does not parse rather than passing it on', async () => {
  mockBackend.rows = { profiles: { quit_at: 'not a date' } };
  const r = await restoreFromServer();
  expect(r.found).toBe(true);
  expect(r.quitDate).toBeNull();
});

it('treats a missing session as failed', async () => {
  mockBackend.session = null;
  expect((await restoreFromServer()).failed).toBe(true);
});

it('gives up on a hung request as failed', async () => {
  jest.useFakeTimers();
  try {
    mockBackend.mode = all('hang');
    const pending = restoreFromServer();
    await jest.advanceTimersByTimeAsync(13_000);
    expect((await pending).failed).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
