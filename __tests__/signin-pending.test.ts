/**
 * A sign-in whose account was never read must not survive a relaunch: the
 * first session use drops it (on this phone only) before anything uploads.
 */
const mockStore = new Map<string, string>();
const mockSession: { current: { user: { id: string } } | null } = { current: null };
const mockAuth = {
  signOut: jest.fn(async (_opts?: { scope?: string }) => {
    mockSession.current = null;
    return { error: null };
  }),
  getSession: jest.fn(async () => ({ data: { session: mockSession.current } })),
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
    removeItem: async (k: string) => void mockStore.delete(k),
  },
}));
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: mockAuth }) }));
jest.mock('@/lib/secureAuthStorage', () => ({
  clearStoredSession: jest.fn(async () => {}),
  ensureFreshInstall: jest.fn(async () => {}),
  readStoredUserId: jest.fn(async () => mockSession.current?.user.id ?? null),
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
  mockSession.current = { user: { id: 'account-B' } };
  jest.clearAllMocks();
});

it('drops a sign-in left unread by the last launch, on this phone only', async () => {
  mockStore.set(PENDING, '1');
  const { ensureSession } = load();
  const id = await ensureSession();
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mockStore.has(PENDING)).toBe(false);
  // A fresh anonymous account, not the one nobody could read.
  expect(id).toBe('anon-C');
});

it('leaves an ordinary session alone', async () => {
  const { ensureSession } = load();
  expect(await ensureSession()).toBe('account-B');
  expect(mockAuth.signOut).not.toHaveBeenCalled();
});

it('never drops the sign-in in progress in this same launch', async () => {
  const { ensureSession, setSignInPending } = load();
  await ensureSession();
  await setSignInPending(true);
  expect(await ensureSession()).toBe('account-B');
  expect(mockAuth.signOut).not.toHaveBeenCalled();
  expect(mockStore.get(PENDING)).toBe('1');
});

it('backs out of a sign-in with a local sign-out, so other phones stay signed in', async () => {
  const { forgetSession } = load();
  await forgetSession('local');
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
