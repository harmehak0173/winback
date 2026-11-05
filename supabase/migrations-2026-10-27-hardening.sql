-- Hardening migration, 2026-10-27. Run ONCE on the existing project, in the
-- Supabase SQL editor (Dashboard -> SQL Editor -> New query), after the
-- 2026-09-27 launch migration. It is idempotent, so running it again is
-- harmless. A fresh project gets the same result from setup-all.sql.
--
-- From a review of the SQL against the app's own queries. What it changes:
--  1. Two profile changes setup-all.sql has carried since August that the
--     launch migration never repeated: hide_flag dropped, money_kept_before
--     added. A project that only ran the migrations may still hold hide_flag
--     (the most sensitive fact the app ever derived), and every
--     money_kept_before sync fails on it.
--  2. An index on urge_events by user, newest first. The Insights query, the
--     account-deletion cascade and the retention job all scanned the whole
--     table without one.
--  3. A second lock on deleting a profile row. Only a revoked privilege stops a
--     user deleting their own row and re-inserting it with a fresh free week
--     (exploitable before 2026-08-22). This policy keeps that shut even if the
--     privilege is ever granted again. Account deletion is unaffected: the
--     cascade and the service role do not go through RLS.
--  4. Usage events are capped on the way in: the name to 64 characters, and
--     props over 4 KB replaced by {"truncated": true}. Truncated, never
--     rejected, so one oversized event cannot fail the app's whole batch.
--  5. Quiz answers get generous size limits (a 32-character question id, at
--     most 16 options, 1 KB of labels); the app's answers sit far inside them.
--     NOT VALID: existing rows are not re-checked, new writes are.
--  6. A small BRIN index for the retention job's purge of old events.
--  7. The trigger functions can no longer be called through the API (they
--     only ever run as triggers, which this does not affect).
--  8. The API roles hold only what the app uses: nothing for a signed-out
--     caller, and per table only the operations the app makes.
--  9. The row level security policies apply to signed-in users and read
--     auth.uid() once per query (same rules as before).
-- 10. The retention job never deletes an account with a real identity (a
--     confirmed email or phone), even if its anonymous flag lags.
-- All of it is tested in supabase/tests (npm run test:sql), including this
-- exact sequence: the pre-launch setup script, the launch migration, then
-- this file. The checks at the bottom should all pass afterwards.

-- Do not queue behind a long query while holding table locks.
set local lock_timeout = '5s';

-- 1. Parity with setup-all.sql -------------------------------------------------
alter table public.profiles drop column if exists hide_flag;
alter table public.profiles add column if not exists money_kept_before numeric not null default 0;

-- 2. urge_events index ----------------------------------------------------------
create index if not exists urge_events_user_started_idx
  on public.urge_events (user_id, started_at desc);

-- 3. No client deletes of a profile, whatever the grants say --------------------
drop policy if exists "no client delete" on public.profiles;
create policy "no client delete" on public.profiles
  as restrictive for delete to anon, authenticated
  using (false);

-- 4. Usage event size cap -------------------------------------------------------
create or replace function public.cap_event_payload()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := left(new.name, 64);
  if pg_column_size(new.props) > 4096 then
    new.props := jsonb_build_object('truncated', true);
  end if;
  return new;
end;
$$;
revoke all on function public.cap_event_payload() from public, anon, authenticated;
drop trigger if exists events_cap_payload on public.events;
create trigger events_cap_payload
  before insert on public.events
  for each row execute function public.cap_event_payload();

-- 5. Quiz answer size limits ----------------------------------------------------
alter table public.quiz_answers drop constraint if exists quiz_answers_size;
alter table public.quiz_answers add constraint quiz_answers_size check (
  char_length(question_id) <= 32
  and cardinality(answer) <= 16
  and octet_length(array_to_string(answer, '')) <= 1024
) not valid;

-- 6. Events purge index ---------------------------------------------------------
create index if not exists events_created_at_brin on public.events using brin (created_at);

-- 7. Trigger functions are not API endpoints ------------------------------------
revoke all on function public.lock_trial_started_at() from public, anon, authenticated;
revoke all on function public.quiz_answers_drop_secrecy() from public, anon, authenticated;
revoke all on function public.clamp_client_time() from public, anon, authenticated;

-- 8. Only the privileges the app uses -------------------------------------------
-- The project default gives the API roles everything (TRUNCATE included), which
-- left row level security as the only barrier. A signed-out caller now holds
-- nothing (the app always signs in, anonymously, before touching a table), and
-- a signed-in one holds exactly the operations the app makes. Tested against
-- every write and read the app sends (supabase/tests).
revoke all on table public.profiles, public.quiz_answers, public.check_ins,
                    public.urge_events, public.events from anon, authenticated;
grant select, insert, update         on public.profiles     to authenticated;
grant select, insert, update         on public.quiz_answers to authenticated;
grant select, insert, update, delete on public.check_ins    to authenticated;
grant select, insert, update         on public.urge_events  to authenticated;
grant select, insert                 on public.events       to authenticated;

-- 9. Policies for signed-in users, reading auth.uid() once per query -------------
-- Same rules as before. (select auth.uid()) is evaluated once per statement
-- instead of once per row, and the policies no longer run for anon at all.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "own quiz answers" on public.quiz_answers;
create policy "own quiz answers" on public.quiz_answers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own check-ins" on public.check_ins;
create policy "own check-ins" on public.check_ins for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own urge events" on public.urge_events;
create policy "own urge events" on public.urge_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "insert own events" on public.events;
create policy "insert own events" on public.events for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "read own events" on public.events;
create policy "read own events" on public.events for select to authenticated
  using ((select auth.uid()) = user_id);

-- 10. The retention job never deletes an account with a real identity ----------
-- is_anonymous used to be the only guard. An account that has confirmed an
-- email (an identity other than 'anonymous', or an email or phone on file) is
-- now kept even if that flag lags. Same signature, so the cron job is unchanged.
create or replace function public.purge_expired_data()
returns table (anonymous_accounts_deleted integer, events_deleted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff constant timestamptz := now() - interval '12 months';
  v_accounts integer := 0;
  v_events integer := 0;
begin
  with stale as (
    select u.id
    from auth.users u
    where u.is_anonymous is true
      and coalesce(u.email, '') = ''
      and coalesce(u.phone, '') = ''
      and not exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider <> 'anonymous'
      )
      and u.created_at < cutoff
      and coalesce(u.last_sign_in_at, u.created_at) < cutoff
      and coalesce(u.updated_at, u.created_at) < cutoff
      -- refreshed_at is read through jsonb so this still runs on an auth
      -- schema version that predates the column.
      and not exists (
        select 1 from auth.sessions s
        where s.user_id = u.id
          and greatest(
                s.created_at,
                s.updated_at,
                (to_jsonb(s) ->> 'refreshed_at')::timestamptz
              ) >= cutoff
      )
      and not exists (
        select 1 from auth.refresh_tokens rt
        where rt.user_id::text = u.id::text
          and greatest(rt.created_at, rt.updated_at) >= cutoff
      )
      and not exists (select 1 from public.profiles p where p.id = u.id and p.updated_at >= cutoff)
      and not exists (select 1 from public.quiz_answers q where q.user_id = u.id and q.answered_at >= cutoff)
      and not exists (select 1 from public.check_ins c where c.user_id = u.id and c.created_at >= cutoff)
      and not exists (select 1 from public.urge_events ue where ue.user_id = u.id and ue.started_at >= cutoff)
      and not exists (select 1 from public.events e where e.user_id = u.id and e.created_at >= cutoff)
    order by u.created_at
    -- Bounded per run so one job never holds long locks on auth.users; the
    -- job runs daily, so any backlog clears over a few days.
    limit 5000
  )
  delete from auth.users u
  using stale
  where u.id = stale.id;
  get diagnostics v_accounts = row_count;

  delete from public.events
  where created_at < now() - interval '24 months';
  get diagnostics v_events = row_count;

  return query select v_accounts, v_events;
end;
$$;
revoke all on function public.purge_expired_data() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verify (run after the migration; one row, expected values in the comments)
-- ---------------------------------------------------------------------------
--   select
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'profiles' and column_name = 'hide_flag')           as hide_flag_col,      -- 0
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'profiles' and column_name = 'money_kept_before')   as money_kept_col,     -- 1
--     (select count(*) from pg_indexes
--       where schemaname = 'public' and indexname in ('urge_events_user_started_idx', 'events_created_at_brin')) as new_indexes,   -- 2
--     (select count(*) from pg_policies where schemaname = 'public' and policyname = 'no client delete') as delete_lock,         -- 1
--     (select count(*) from pg_trigger where tgname = 'events_cap_payload')                              as event_cap,           -- 1
--     (select count(*) from pg_constraint where conname = 'quiz_answers_size')                           as quiz_size,           -- 1
--     has_table_privilege('authenticated', 'public.profiles', 'DELETE')                                  as auth_can_delete;     -- false
--
-- And the nightly retention job should be succeeding (last 5 runs):
--   select d.status, d.start_time, left(d.return_message, 200) as msg
--   from cron.job_run_details d join cron.job j using (jobid)
--   where j.jobname = 'winback-retention' order by d.start_time desc limit 5;
