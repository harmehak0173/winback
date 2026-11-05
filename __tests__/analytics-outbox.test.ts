/**
 * Usage events that waited offline for more than a week are dropped, not
 * sent late: the privacy policy says so, and the queue used to apply the
 * cutoff only when something new was added to it.
 */
const mockStore = new Map<string, string>();
const mockInserted: { name: string }[][] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => void mockStore.delete(k),
    multiRemove: async (ks: string[]) => ks.forEach((k) => mockStore.delete(k)),
  },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'US' }] }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: async (rows: { name: string }[]) => {
        mockInserted.push(rows);
        return { error: null };
      },
    }),
  },
  ensureSession: async () => 'user-1',
}));

const OUTBOX = 'winback:analytics-outbox';
const DAY = 86_400_000;

it('sends the fresh events and drops the ones older than a week', async () => {
  const now = Date.now();
  mockStore.set(
    OUTBOX,
    JSON.stringify([
      { name: 'old_event', props: {}, at: new Date(now - 8 * DAY).toISOString() },
      { name: 'fresh_event', props: {}, at: new Date(now - 3_600_000).toISOString() },
    ]),
  );
  let mod!: typeof import('@/lib/analytics');
  jest.isolateModules(() => {
    mod = require('@/lib/analytics');
  });
  await mod.recordConsent();
  await mod.flushOutbox();
  const sent = mockInserted.flat().map((e) => e.name);
  expect(sent).toContain('fresh_event');
  expect(sent).not.toContain('old_event');
  expect(mockStore.has(OUTBOX)).toBe(false);
});
