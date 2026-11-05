/**
 * "Share usage data" must never switch itself back on: a storage error reads
 * as off, and a choice that could not be saved says so.
 */
const mockEnv = {
  map: new Map<string, string>(),
  failReads: 0,
  failWrites: 0,
  region: 'US' as string | null,
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => {
      if (mockEnv.failReads > 0) {
        mockEnv.failReads -= 1;
        throw new Error('busy');
      }
      return mockEnv.map.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (mockEnv.failWrites > 0) {
        mockEnv.failWrites -= 1;
        throw new Error('full');
      }
      mockEnv.map.set(k, v);
    },
    removeItem: async (k: string) => void mockEnv.map.delete(k),
    multiRemove: async (ks: string[]) => ks.forEach((k) => mockEnv.map.delete(k)),
  },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: mockEnv.region }] }));
jest.mock('@/lib/supabase', () => ({ supabase: null, ensureSession: async () => null }));

const PREF = 'winback:analytics';
const CONSENT = 'winback:consent';

function load(setup: { region?: string | null; stored?: Record<string, string>; failReads?: number; failWrites?: number }) {
  mockEnv.map = new Map(Object.entries(setup.stored ?? {}));
  mockEnv.region = setup.region === undefined ? 'US' : setup.region;
  mockEnv.failReads = setup.failReads ?? 0;
  mockEnv.failWrites = setup.failWrites ?? 0;
  let mod!: typeof import('@/lib/analytics');
  jest.isolateModules(() => {
    mod = require('@/lib/analytics');
  });
  return mod;
}

// Also guards the storage keys above: with a wrong key the retry would fall
// back to the US default, which is on, and this would fail.
it('stays off when an opted-out choice cannot be read, then reads it on the retry', async () => {
  const a = load({ stored: { [PREF]: '0', [CONSENT]: '1' }, failReads: 2 });
  await a.loadAnalyticsPreference();
  expect(a.getAnalyticsEnabled()).toBe(false);
  await a.loadAnalyticsPreference();
  expect(a.getAnalyticsEnabled()).toBe(false);
  expect(a.hasConsented()).toBe(true);
});

it('is off for now when an opted-in choice cannot be read, and on again after the retry', async () => {
  const a = load({ stored: { [PREF]: '1', [CONSENT]: '1' }, failReads: 2 });
  await a.loadAnalyticsPreference();
  expect(a.getAnalyticsEnabled()).toBe(false);
  await a.loadAnalyticsPreference();
  expect(a.getAnalyticsEnabled()).toBe(true);
});

it('defaults to off for a phone that reports no region at all', () => {
  expect(load({ region: null }).getAnalyticsEnabled()).toBe(false);
});

it('keeps the regional defaults: on in the US, off in Canada', () => {
  expect(load({ region: 'US' }).getAnalyticsEnabled()).toBe(true);
  expect(load({ region: 'CA' }).getAnalyticsEnabled()).toBe(false);
});

it('reports a choice that could not be saved, and saves it on one retry', async () => {
  const failing = load({ failWrites: 2 });
  expect(await failing.setAnalyticsEnabled(false)).toBe(false);
  expect(failing.getAnalyticsEnabled()).toBe(false);
  const flaky = load({ failWrites: 1 });
  expect(await flaky.setAnalyticsEnabled(false)).toBe(true);
});
