/**
 * Clearing the sign-in marker after restore must land: a lost clear signed
 * the person out of the account they had just restored at the next launch.
 */
const mockStore = new Map<string, string>();
const mockFail = { removes: 0 };
const mockAuth = {
  signOut: jest.fn(async () => ({ error: null })),
  getSession: jest.fn(async () => ({ data: { session: { user: { id: 'email-account-B' } } }, error: null })),
  signInAnonymously: jest.fn(async () => ({ data: { user: { id: 'anon-C' } }, error: null })),
  onAuthStateChange: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => {
      if (mockFail.removes > 0) {
        mockFail.removes -= 1;
        throw new Error('SQLITE_BUSY');
      }
      mockStore.delete(k);
    },
  },
}));
jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js');
  return { ...actual, createClient: () => ({ auth: mockAuth }) };
});
jest.mock('@/lib/secureAuthStorage', () => ({
  clearStoredSession: jest.fn(async () => {}),
  ensureFreshInstall: jest.fn(async () => {}),
  readStoredUserId: jest.fn(async () => 'email-account-B'),
  secureAuthStorage: {},
  sessionReadFailed: () => false,
}));

const PENDING = 'winback:signin-pending';

function load() {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
  let mod!: typeof import('@/lib/supabase');
  jest.isolateModules(() => {
    mod = require('@/lib/supabase');
  });
  return mod;
}

beforeEach(() => {
  mockStore.clear();
  mockFail.removes = 0;
  jest.clearAllMocks();
});

it('clears the marker through one failed write, so the next launch keeps the account', async () => {
  const thisLaunch = load();
  await thisLaunch.setSignInPending(true);
  mockFail.removes = 1;
  expect(await thisLaunch.setSignInPending(false)).toBe(true);
  expect(mockStore.has(PENDING)).toBe(false);

  const nextLaunch = load();
  expect(await nextLaunch.ensureSession()).toBe('email-account-B');
  expect(mockAuth.signOut).not.toHaveBeenCalled();
});

it('says so when the clear keeps failing', async () => {
  const mod = load();
  await mod.setSignInPending(true);
  mockFail.removes = 2;
  expect(await mod.setSignInPending(false)).toBe(false);
});
