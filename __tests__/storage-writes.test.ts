/**
 * A failed storage read must never shrink a record that only goes up: the
 * write is skipped instead of replacing 40 urges ridden out with 1.
 */
const mockDisk = { map: new Map<string, string>(), failReads: 0 };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => {
      if (mockDisk.failReads > 0) {
        mockDisk.failReads -= 1;
        throw new Error('SQLITE_BUSY');
      }
      return mockDisk.map.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => void mockDisk.map.set(k, v),
    removeItem: async (k: string) => void mockDisk.map.delete(k),
  },
}));
jest.mock('@/lib/analytics', () => ({ track: () => {}, consentKnown: async () => false }));
jest.mock('@/lib/supabase', () => ({ supabase: null, ensureSession: async () => null }));

import { logTrigger, readTriggerLog } from '@/lib/triggers';
import { logUrgeStart, readUrgeOpens } from '@/lib/urgeLog';
import { logUrgeWin, readUrgeWins } from '@/lib/urgeWins';

beforeEach(() => {
  mockDisk.map.clear();
  mockDisk.failReads = 0;
});

describe('urges ridden out', () => {
  beforeEach(async () => {
    for (let i = 0; i < 40; i++) await logUrgeWin('panic');
  });

  it('logs through a single failed read (one retry)', async () => {
    mockDisk.failReads = 1;
    await logUrgeWin('panic');
    expect((await readUrgeWins()).total).toBe(41);
  });

  it('keeps the total when storage cannot be read at all', async () => {
    mockDisk.failReads = 2;
    await logUrgeWin('panic');
    expect((await readUrgeWins()).total).toBe(40);
  });
});

it('keeps the whole trigger log when storage cannot be read', async () => {
  for (let i = 0; i < 25; i++) await logTrigger('Late at night', 'urge');
  mockDisk.failReads = 2;
  await logTrigger('Late at night', 'urge');
  expect(await readTriggerLog()).toHaveLength(25);
});

it('keeps the panic-open history when storage cannot be read', async () => {
  for (let i = 0; i < 10; i++) await logUrgeStart();
  await new Promise((r) => setTimeout(r, 20));
  mockDisk.failReads = 2;
  await logUrgeStart();
  await new Promise((r) => setTimeout(r, 700));
  expect(await readUrgeOpens()).toHaveLength(10);
});
