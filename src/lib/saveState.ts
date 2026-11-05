import { supabase, withTimeout } from './supabase';

/**
 * Whether this account's progress is saved to an email, for You -> Save your
 * progress. "Save my progress" sends a confirmation link and nothing is
 * attached until it is tapped, so You says which of these it is. It used to
 * show the same field and "You're using Winback without an account" whatever
 * had happened, and someone who never tapped the link believed they were
 * saved until a new phone could not find them.
 */
export type SaveState =
  | { kind: 'saved'; email: string }
  | { kind: 'pending'; email: string }
  | { kind: 'none' }
  | { kind: 'unknown' };

interface AccountUser {
  email?: string | null;
  new_email?: string | null;
  is_anonymous?: boolean;
}

/** The state a user record describes. No record at all is unknown. */
export function saveStateOf(user: AccountUser | null): SaveState {
  if (!user) return { kind: 'unknown' };
  if (user.email && !user.is_anonymous) return { kind: 'saved', email: user.email };
  if (user.new_email) return { kind: 'pending', email: user.new_email };
  return { kind: 'none' };
}

/** "jane@example.com" as "j***@example.com": the phone may be shared. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Read it without ever signing in: the stored session first (it works
 * offline, and supabase-js stores updateUser's answer, so a pending save
 * shows too), then the server's copy when it answers in time.
 */
export async function readSaveState(): Promise<SaveState> {
  if (!supabase) return { kind: 'unknown' };
  const client = supabase;
  const stored = await withTimeout(
    client.auth.getSession().then(
      ({ data }) => data.session?.user ?? null,
      () => null,
    ),
    3000,
    null,
  );
  if (!stored) return { kind: 'unknown' };
  const fresh = await withTimeout(
    client.auth.getUser().then(
      ({ data }) => data.user ?? null,
      () => null,
    ),
    3000,
    null,
  );
  return saveStateOf(fresh ?? stored);
}
