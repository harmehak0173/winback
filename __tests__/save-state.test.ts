/**
 * You -> Save your progress tells the truth about where the save stands:
 * saved, waiting on the confirmation link, not saved, or not known.
 */
jest.mock('@/lib/supabase', () => ({ supabase: null, withTimeout: (p: Promise<unknown>) => p }));

import { maskEmail, readSaveState, saveStateOf } from '@/lib/saveState';

describe('saveStateOf', () => {
  it('is saved once the email is confirmed and the account is no longer anonymous', () => {
    expect(saveStateOf({ email: 'jane@example.com', is_anonymous: false })).toEqual({
      kind: 'saved',
      email: 'jane@example.com',
    });
  });

  it('is pending while the confirmation link has not been tapped', () => {
    expect(saveStateOf({ email: '', new_email: 'jane@example.com', is_anonymous: true })).toEqual({
      kind: 'pending',
      email: 'jane@example.com',
    });
  });

  it('is not saved for an anonymous account with no email on the way', () => {
    expect(saveStateOf({ is_anonymous: true })).toEqual({ kind: 'none' });
  });

  it('is unknown with no account record to go on', () => {
    expect(saveStateOf(null)).toEqual({ kind: 'unknown' });
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain only', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });

  it('hides anything that is not an address', () => {
    expect(maskEmail('nonsense')).toBe('***');
  });
});

it('is unknown in a build with no backend', async () => {
  expect(await readSaveState()).toEqual({ kind: 'unknown' });
});
