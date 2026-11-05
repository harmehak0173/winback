/**
 * The keychain adapter tells a failed read from an empty one: it retries a
 * read that throws once, and if it fails again it says so through
 * sessionReadFailed() instead of passing the failure off as "no session".
 */
const mockAsync = new Map<string, string>();
const mockSecure = { map: new Map<string, string>(), throws: 0 };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockAsync.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockAsync.set(k, v),
    removeItem: async (k: string) => void mockAsync.delete(k),
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => {
    if (mockSecure.throws > 0) {
      mockSecure.throws -= 1;
      throw new Error('User interaction is not allowed.');
    }
    return mockSecure.map.get(k) ?? null;
  },
  setItemAsync: async (k: string, v: string) => void mockSecure.map.set(k, v),
  deleteItemAsync: async (k: string) => void mockSecure.map.delete(k),
}));

const SESSION_KEY = 'sb-example-auth-token';

function load() {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  let mod!: typeof import('@/lib/secureAuthStorage');
  jest.isolateModules(() => {
    mod = require('@/lib/secureAuthStorage');
  });
  return mod;
}

beforeEach(() => {
  mockAsync.clear();
  mockSecure.map.clear();
  mockSecure.throws = 0;
  // An install that has run before, so the fresh-install wipe stays out of it.
  mockAsync.set('winback:installed', '2026-10-01T00:00:00.000Z');
});

it('reads the session through one failed attempt', async () => {
  const mod = load();
  await mod.secureAuthStorage.setItem(SESSION_KEY, '{"user":{"id":"account-A"}}');
  mockSecure.throws = 1;
  expect(await mod.secureAuthStorage.getItem(SESSION_KEY)).toBe('{"user":{"id":"account-A"}}');
  expect(mod.sessionReadFailed()).toBe(false);
});

it('reports a read that keeps failing, rather than an empty store', async () => {
  const mod = load();
  await mod.secureAuthStorage.setItem(SESSION_KEY, '{"user":{"id":"account-A"}}');
  mockSecure.throws = 2;
  expect(await mod.secureAuthStorage.getItem(SESSION_KEY)).toBeNull();
  expect(mod.sessionReadFailed()).toBe(true);
  // The next good read clears it.
  expect(await mod.secureAuthStorage.getItem(SESSION_KEY)).toBe('{"user":{"id":"account-A"}}');
  expect(mod.sessionReadFailed()).toBe(false);
});

it('treats a store that is simply empty as empty', async () => {
  const mod = load();
  expect(await mod.secureAuthStorage.getItem(SESSION_KEY)).toBeNull();
  expect(mod.sessionReadFailed()).toBe(false);
});
