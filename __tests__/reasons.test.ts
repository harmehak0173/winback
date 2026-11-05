/**
 * The user's own reasons: cleaned before they are kept, reported as saved
 * only when the phone really kept them, and gone once cleared.
 */
const mockDevice = { map: new Map<string, string>(), dropWrites: false };

jest.mock('@/lib/secureAuthStorage', () => ({ MY_REASONS_KEY: 'winback.reasons' }));
jest.mock('@/lib/trial', () => ({
  readDeviceValue: async (k: string) => mockDevice.map.get(k) ?? null,
  writeDeviceValue: async (k: string, v: string | null) => {
    if (mockDevice.dropWrites) return;
    if (v == null) mockDevice.map.delete(k);
    else mockDevice.map.set(k, v);
  },
}));

import {
  cleanReasons,
  clearReasons,
  loadReasons,
  MAX_REASON_LENGTH,
  saveReasons,
} from '@/lib/reasons';

const KEY = 'winback.reasons';

beforeEach(() => {
  mockDevice.map.clear();
  mockDevice.dropWrites = false;
});

describe('cleanReasons', () => {
  it('trims and folds runs of spaces', () => {
    expect(cleanReasons(['  my   kids  '])).toEqual(['my kids']);
  });

  it('drops blanks, non-text and repeats that differ only in case', () => {
    expect(cleanReasons(['', '   ', 5, null, 'Home', 'home', 'HOME '])).toEqual(['Home']);
  });

  it('caps each reason at one line', () => {
    const [long] = cleanReasons(['x'.repeat(MAX_REASON_LENGTH + 20)]);
    expect(long).toHaveLength(MAX_REASON_LENGTH);
  });

  it('keeps at most three', () => {
    expect(cleanReasons(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
});

describe('saving and loading', () => {
  it('keeps them as typed, cleaned, on this phone', async () => {
    expect(await saveReasons(['My daughter', '  Getting the house back '])).toBe(true);
    expect(JSON.parse(mockDevice.map.get(KEY)!)).toEqual(['My daughter', 'Getting the house back']);
    expect(await loadReasons()).toEqual(['My daughter', 'Getting the house back']);
  });

  it('removes the record when every field is empty', async () => {
    await saveReasons(['Something']);
    expect(await saveReasons(['', '  '])).toBe(true);
    expect(mockDevice.map.has(KEY)).toBe(false);
    expect(await loadReasons()).toEqual([]);
  });

  it('says so when the phone did not keep the write', async () => {
    mockDevice.dropWrites = true;
    expect(await saveReasons(['My daughter'])).toBe(false);
  });

  it('reads an unreadable or wrong-shaped record as none', async () => {
    mockDevice.map.set(KEY, '{not json');
    expect(await loadReasons()).toEqual([]);
    mockDevice.map.set(KEY, '"one string"');
    expect(await loadReasons()).toEqual([]);
  });

  it('forgets them when cleared', async () => {
    await saveReasons(['My daughter']);
    await clearReasons();
    expect(mockDevice.map.has(KEY)).toBe(false);
    expect(await loadReasons()).toEqual([]);
  });
});
