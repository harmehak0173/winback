// Supabase Edge Function: full account deletion (App Store and Google Play
// requirement - any app that lets users create an account must let them
// delete it in-app).
//
// Deploy: .\supabase\deploy-functions.ps1  (or npx supabase functions deploy
// delete-account --project-ref <your-project-ref>)
// Keep JWT verification ON for this one - the default. The function only ever
// deletes the account whose token calls it.
//
// 1. Deletes the auth user; every table row cascades via ON DELETE CASCADE.
// 2. Then, best-effort, deletes the copies held by third parties, keyed by the
//    same user id:
//    - RevenueCat customer record (REVENUECAT_SECRET_API_KEY), via
//      DELETE https://api.revenuecat.com/v1/subscribers/{app_user_id};
//    - PostHog person and their events (POSTHOG_PERSONAL_API_KEY,
//      POSTHOG_PROJECT_ID, POSTHOG_HOST), via
//      POST {host}/api/projects/{project_id}/persons/bulk_delete/.
//    Each is skipped when its secrets are not set, has its own timeout, and
//    can never fail the request: the database deletion is what the user asked
//    for, and it has already happened. Deleting the RevenueCat record does not
//    cancel a store subscription; the app warns about that before calling us.
//
// Logs carry a correlation id and HTTP status codes only - never a key, a
// token or the user id.

import { createClient } from 'npm:@supabase/supabase-js@2';

const THIRD_PARTY_TIMEOUT_MS = 5000;

/**
 * deleted: the provider accepted a deletion of a record it found.
 * not_found: the provider had nothing under this id (never reached the
 *   paywall, or never sent a PostHog-safe event, or usage data was off).
 * skipped: the secrets for that provider are not set.
 * failed: the call errored or was refused.
 */
type Cleanup = 'deleted' | 'not_found' | 'skipped' | 'failed';

// No CORS headers: the only caller is the native app, which needs none, so
// no browser page may call this either. Security headers only.
const cors = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

/** Error name only: a message or stack could echo a request URL or header. */
function errName(e: unknown): string {
  return e instanceof Error ? e.name : 'error';
}

async function deleteRevenueCatCustomer(appUserId: string, correlationId: string): Promise<Cleanup> {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) return 'skipped';
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
      },
    );
    await res.body?.cancel();
    // 404 means RevenueCat never saw this id: the app logs every consented
    // user in at launch, so this is a build without store keys, or a phone
    // that never reached RevenueCat. Nothing there to delete.
    if (res.ok) return 'deleted';
    if (res.status === 404) return 'not_found';
    console.error('[delete-account]', correlationId, 'revenuecat status', res.status);
    return 'failed';
  } catch (e) {
    console.error('[delete-account]', correlationId, 'revenuecat', errName(e));
    return 'failed';
  }
}

async function deletePostHogPerson(distinctId: string, correlationId: string): Promise<Cleanup> {
  const key = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
  const project = Deno.env.get('POSTHOG_PROJECT_ID');
  // The private API lives on the app host (us.posthog.com), not the ingestion
  // host the app captures to (us.i.posthog.com). Accept either.
  const host = (Deno.env.get('POSTHOG_HOST') ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace('.i.posthog.com', '.posthog.com');
  if (!key || !project || !host.startsWith('https://')) return 'skipped';
  try {
    const res = await fetch(
      `${host}/api/projects/${encodeURIComponent(project)}/persons/bulk_delete/`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        // delete_events: the person record alone is not enough - the events
        // are the data. PostHog removes them asynchronously.
        body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true }),
        signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      await res.body?.cancel();
      console.error('[delete-account]', correlationId, 'posthog status', res.status);
      return 'failed';
    }
    // PostHog answers 202 whether or not it matched anyone, so the status
    // alone proves nothing. Only a person actually queued for deletion counts.
    const body = (await res.json().catch(() => null)) as {
      persons_found?: number;
      persons_queued_for_deletion?: number;
      persons_deleted?: number;
    } | null;
    const queued = (body?.persons_queued_for_deletion ?? 0) + (body?.persons_deleted ?? 0);
    if (queued >= 1) return 'deleted';
    if (body && body.persons_found === 0) return 'not_found';
    console.error('[delete-account]', correlationId, 'posthog nothing queued');
    return 'failed';
  } catch (e) {
    console.error('[delete-account]', correlationId, 'posthog', errName(e));
    return 'failed';
  }
}

/**
 * The admin key. Supabase is retiring the legacy service_role JWT keys by the
 * end of 2026; with the new API keys a function's environment carries them in
 * SUPABASE_SECRET_KEYS, a JSON object keyed by name. Read that when it is
 * there and fall back to the legacy variable, so this keeps working before and
 * after the legacy keys are switched off (see HANDOFF.md).
 */
function adminKey(): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Not JSON: fall through to the legacy key.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors });
  }
  const correlationId = crypto.randomUUID();

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
    const key = adminKey();
    if (!key) {
      console.error('[delete-account]', correlationId, 'no admin key in the environment');
      return Response.json(
        { error: 'internal_error', correlation_id: correlationId },
        { status: 500, headers: cors },
      );
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The caller, from their own token: getUser(jwt) asks the Auth server, so a
    // forged, expired or revoked token gets no user and deletes nothing.
    const {
      data: { user },
    } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error('[delete-account]', correlationId, error.message);
      return Response.json(
        { error: 'internal_error', correlation_id: correlationId },
        { status: 500, headers: cors },
      );
    }

    // After the database deletion, never before: if that had failed, the user
    // would still have an account (and possibly a live subscription) whose
    // RevenueCat record was gone. Both run in parallel, so the worst case adds
    // one timeout to the response.
    const [revenuecat, posthog] = await Promise.all([
      deleteRevenueCatCustomer(user.id, correlationId),
      deletePostHogPerson(user.id, correlationId),
    ]);

    return Response.json({ ok: true, cleanup: { revenuecat, posthog } }, { headers: cors });
  } catch (e) {
    console.error('[delete-account]', correlationId, errName(e));
    return Response.json(
      { error: 'internal_error', correlation_id: correlationId },
      { status: 500, headers: cors },
    );
  }
});
