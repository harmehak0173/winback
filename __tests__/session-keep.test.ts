/**
 * An account is never replaced by accident: a refresh that failed for want
 * of a network, or a keychain that could not be read, leaves the phone's
 * account alone; only a truly empty store, or a session the server rejected,
 * gets a new anonymous account.
 */
const mockStore = new Map<string, string>();
const mockReadFailed = { current: false };
const mockAuth = {
  getSession: jest.fn(),
  signInAnonymously: jest.fn(async () => ({ data: { user: { id: 'anon-new' } }, error: null })),
  signOut: jest.fn(async () => ({ error: null })),
  onAuthStateChange: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => void mockStore.delete(k),
  },
}));
jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js');
  return { ...actual, createClient: () => ({ auth: mockAuth }) };
});
jest.mock('@/lib/secureAuthStorage', () => ({
  clearStoredSession: jest.fn(async () => {}),
  ensureFreshInstall: jest.fn(async () => {}),
  readStoredUserId: jest.fn(async () => null),
  secureAuthStorage: {},
  sessionReadFailed: () => mockReadFailed.current,
}));

const { AuthApiError, AuthRetryableFetchError } = jest.requireActual('@supabase/supabase-js');

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
  mockReadFailed.current = false;
  jest.clearAllMocks();
});

it('keeps the account when the refresh failed for want of a network', async () => {
  mockAuth.getSession.mockResolvedValue({
    data: { session: null },
    error: new AuthRetryableFetchError('Network request failed', 0),
  });
  expect(await load().ensureSession()).toBeNull();
  expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
});

it('keeps the account when the keychain could not be read', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockReadFailed.current = true;
  expect(await load().ensureSession()).toBeNull();
  expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
});

it('starts an account on a phone with none', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await load().ensureSession()).toBe('anon-new');
  expect(mockAuth.signInAnonymously).toHaveBeenCalledTimes(1);
});

it('starts a new account when the server rejected the session', async () => {
  mockAuth.getSession.mockResolvedValue({
    data: { session: null },
    error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
  });
  expect(await load().ensureSession()).toBe('anon-new');
});

it('returns the stored account when there is one', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'account-A' } } }, error: null });
  expect(await load().ensureSession()).toBe('account-A');
  expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
});
