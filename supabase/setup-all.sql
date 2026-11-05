-- Winback - complete backend provisioning, in one paste.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent: safe to run on a fresh project or an existing one, and safe
-- to run repeatedly. It is schema.sql + analytics.sql + retention.sql, which
-- remain the per-concern sources of truth (with the reasoning in comments),
-- followed by cleanup of features that were removed.
--
-- Prerequisites: enable "Allow anonymous sign-ins" (Authentication ->
-- Providers). pg_cron is enabled by section 3 itself.

-- ===========================================================================
-- 1. Core schema (schema.sql)
-- ===========================================================================

-- One row per user; derived personalization fields from onboarding.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  monthly_spend numeric,          -- Q4 bracket, adjusted by the rest of the quiz; drives cost reveal + daily save rate
  sports text[] default '{}',     -- Q2; game-day mode + paywall personalization
  triggers text[] default '{}',   -- Q5; notification timing + trigger insights
  goal text,                      -- Q9; savings goal feature
  baseline_streak text,           -- Q10; first-milestone calibration
  quit_at timestamptz,            -- set at commitment; source of both live counters
  plan text check (plan in ('yearly', 'monthly', 'weekly', 'free')),
  -- Start of the 7-day free week of Premium. Stamped by the database when the
  -- row is first written (at commit) and never written by the client, so it
  -- cannot be extended by editing local storage or by any later profile
  -- upsert. Kept separate from quit_at because a slip resets the quit date,
  -- and that must not hand out a fresh week.
  trial_started_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
-- For projects provisioned before the free week existed.
alter table public.profiles add column if not exists trial_started_at timestamptz not null default now();

-- Data minimisation: hide_flag recorded that a user hides their betting from
-- someone AND is in financial harm. It was computed on the device, used on the
-- device to soften notification copy, and never read server-side - so storing
-- it put the most damaging fact the app knows on a server for no benefit.
-- Dropped, along with the raw `secrecy` answer it derived from, which the app
-- never uploads (see the quiz_answers guard below).
alter table public.profiles drop column if exists hide_flag;

-- Remote push was never sent from anywhere: reminders are local notifications
-- scheduled on the device. The token column only held an identifier nothing
-- used, so it is gone.
alter table public.profiles drop column if exists expo_push_token;

-- Money kept during streaks that have already ended. Synced so the lifetime
-- figure survives a reinstall or a move to a new phone, which is exactly when
-- someone most wants to see that the work was not lost.
--
-- Not an entitlement, just a number the user owns, so a tampered client can
-- only mislead itself. Nothing reads it server-side.
alter table public.profiles add column if not exists money_kept_before numeric not null default 0;

-- Daily reads completed and the longest clean streak, for the same reason: a
-- new phone picks the curriculum up where it was and keeps the best streak.
-- Numbers the user owns, not entitlements. The app writes them in their own
-- upsert, so a project without these columns only loses this write.
alter table public.profiles add column if not exists daily_index int not null default 0;
alter table public.profiles add column if not exists best_streak_days int not null default 0;


-- The free week has to be server-controlled, and a DEFAULT is not enough.
-- RLS lets a user write their own profile row, so with only a default in place
-- a client holding the anon key can POST or PATCH trial_started_at directly and
-- hand itself an unlimited free week - verified against the live database
-- before this trigger existed. Stripping the column in the app only guards our
-- own code path, not a hand-rolled REST call. This forces the value on insert
-- and freezes it on update, so the clock is the server's alone.
create or replace function public.lock_trial_started_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- The app writes this row for the first time when the user commits, so
    -- now() starts the week at commit. Anchoring it to auth.users.created_at
    -- (first launch) instead meant someone who paused mid-quiz for a week
    -- committed straight into "Your free week is up" without a single
    -- Premium day.
    --
    -- Safe only because an INSERT can happen once per account: the client has
    -- no DELETE grant (revoked just below), so the old delete-then-reinsert
    -- trick that minted a fresh week on every loop is closed. A new week needs
    -- a new account, which is the documented "per account" rule.
    -- Anchored to the commit time the app sends as quit_at, so a commit made
    -- offline (whose first upload lands hours or days later) still starts the
    -- week at commit instead of handing out a second one. Bounded both ways:
    -- never later than now(), so a client cannot push its own week into the
    -- future, and never earlier than the account itself. A client can only
    -- move it earlier, which shortens its own week.
    new.trial_started_at := greatest(
      coalesce((select u.created_at from auth.users u where u.id = new.id), now()),
      least(now(), coalesce(new.quit_at, now()))
    );
  else
    new.trial_started_at := old.trial_started_at;
  end if;
  return new;
end;
$$;

-- Load-bearing for the trigger above, not just belt and braces: the client
-- never needs to delete a profile row. Account deletion runs through the
-- delete-account edge function under the service role, and removing the auth
-- user cascades this row away anyway.
revoke delete on public.profiles from anon, authenticated;

drop trigger if exists profiles_lock_trial on public.profiles;
create trigger profiles_lock_trial
  before insert or update on public.profiles
  for each row execute function public.lock_trial_started_at();

-- Raw quiz answers, one row per question (answers stored as option labels).
create table if not exists public.quiz_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null,
  answer text[] not null default '{}',
  answered_at timestamptz default now(),
  primary key (user_id, question_id)
);

-- Generous size limits; the app's answers sit far inside them. NOT VALID, so
-- a re-run never re-checks old rows.
alter table public.quiz_answers drop constraint if exists quiz_answers_size;
alter table public.quiz_answers add constraint quiz_answers_size check (
  char_length(question_id) <= 32
  and cardinality(answer) <= 16
  and octet_length(array_to_string(answer, '')) <= 1024
) not valid;

-- The `secrecy` answer (who the user hides their betting from) never leaves
-- the phone. The app filters it before every upload; the database refuses it
-- too, so an old build or a hand-rolled REST call cannot store it.
--
-- Purge first, so the constraint below can be added on a project where an
-- older build already uploaded some.
delete from public.quiz_answers where question_id = 'secrecy';

-- Drop the row silently instead of raising: the app upserts every answer in
-- one batch, and an error would throw away the other answers along with it.
create or replace function public.quiz_answers_drop_secrecy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.question_id = 'secrecy' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_answers_no_secrecy on public.quiz_answers;
create trigger quiz_answers_no_secrecy
  before insert or update on public.quiz_answers
  for each row execute function public.quiz_answers_drop_secrecy();

-- Hard backstop if the trigger is ever dropped: the row is rejected outright.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quiz_answers_no_secrecy'
      and conrelid = 'public.quiz_answers'::regclass
  ) then
    alter table public.quiz_answers
      add constraint quiz_answers_no_secrecy check (question_id <> 'secrecy');
  end if;
end;
$$;


-- Daily "I stayed clean today" check-ins.
create table if not exists public.check_ins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz default now(),
  primary key (user_id, day)
);

-- Panic-button sessions (for later trigger insights; no content, just timing).
create table if not exists public.urge_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Insights, the deletion cascade and the retention job read it by user,
-- newest first.
create index if not exists urge_events_user_started_idx
  on public.urge_events (user_id, started_at desc);

alter table public.profiles enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.check_ins enable row level security;
alter table public.urge_events enable row level security;

-- Users (including anonymous users) can only touch their own rows.
-- Dropped first so this whole file stays re-runnable: bare CREATE POLICY
-- errors on an already-provisioned project, which aborts the script and can
-- leave later statements unapplied.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- A second lock on deletes. The free-week trigger is safe only because a
-- profile row is inserted once, and the revoked DELETE privilege is otherwise
-- all that enforces it. Cascades and the service role skip RLS, so account
-- deletion still works.
drop policy if exists "no client delete" on public.profiles;
create policy "no client delete" on public.profiles
  as restrictive for delete to anon, authenticated
  using (false);

drop policy if exists "own quiz answers" on public.quiz_answers;
create policy "own quiz answers" on public.quiz_answers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own check-ins" on public.check_ins;
create policy "own check-ins" on public.check_ins for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own urge events" on public.urge_events;
create policy "own urge events" on public.urge_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Trigger functions only ever run as triggers; they are not API endpoints.
revoke all on function public.lock_trial_started_at() from public, anon, authenticated;
revoke all on function public.quiz_answers_drop_secrecy() from public, anon, authenticated;

-- Only the privileges the app uses. The project default gives the API roles
-- everything, which left row level security as the only barrier. A signed-out
-- caller holds nothing (the app always signs in, anonymously, first), and a
-- signed-in one exactly the operations the app makes (supabase/tests).
revoke all on table public.profiles, public.quiz_answers, public.check_ins,
                    public.urge_events from anon, authenticated;
grant select, insert, update         on public.profiles     to authenticated;
grant select, insert, update         on public.quiz_answers to authenticated;
grant select, insert, update, delete on public.check_ins    to authenticated;
grant select, insert, update         on public.urge_events  to authenticated;

-- ===========================================================================
-- 2. Funnel analytics (analytics.sql)
-- ===========================================================================

create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_name_created_idx on public.events (name, created_at);
create index if not exists events_user_idx on public.events (user_id);
-- The retention job purges by age. BRIN is tiny and costs nothing on insert.
create index if not exists events_created_at_brin on public.events using brin (created_at);

alter table public.events enable row level security;

-- Dropped first so this file stays re-runnable (bare CREATE POLICY errors on
-- an already-provisioned project and aborts the script).
drop policy if exists "insert own events" on public.events;
create policy "insert own events" on public.events for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "read own events" on public.events;
create policy "read own events" on public.events for select to authenticated
  using ((select auth.uid()) = user_id);

-- Write and read your own events; nothing else, and nothing signed out.
revoke all on table public.events from anon, authenticated;
grant select, insert on public.events to authenticated;

-- Size cap on the way in: the name to 64 characters, props over 4 KB
-- replaced. Truncated rather than rejected, so one oversized event never
-- fails the app's whole batch.
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

-- Example funnel query (run with service role in the SQL editor):
-- select name, count(distinct user_id) as users
-- from events
-- where name like 'funnel_%' or name in ('paywall_viewed','purchase_succeeded','free_continued')
-- group by name order by min(created_at);

-- ===========================================================================
-- 3. Retention job (retention.sql): anonymous accounts unused for 12 months
--    and usage events older than 24 months are deleted daily.
-- ===========================================================================

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
      -- Never an account with a real identity, even if is_anonymous lags.
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

-- Service-only. Supabase's default privileges grant EXECUTE on new public
-- functions to the API roles, which would expose this as an RPC.
revoke all on function public.purge_expired_data() from public, anon, authenticated;

-- The activity dates above come from the phone's clock (the app sends them),
-- so a phone set ahead could write rows dated years in the future: the
-- 24-month delete would not reach them for years, and a future-dated row
-- counts as "activity" and keeps an abandoned account forever. Clamp every
-- one of them to the server's clock on the way in. Past dates are kept, so an
-- event queued offline keeps the time it happened.
create or replace function public.clamp_client_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  case tg_table_name
    when 'events' then new.created_at := least(coalesce(new.created_at, now()), now());
    when 'check_ins' then new.created_at := least(coalesce(new.created_at, now()), now());
    when 'urge_events' then new.started_at := least(coalesce(new.started_at, now()), now());
    when 'quiz_answers' then new.answered_at := least(coalesce(new.answered_at, now()), now());
    when 'profiles' then new.updated_at := least(coalesce(new.updated_at, now()), now());
    else null;
  end case;
  return new;
end;
$$;

drop trigger if exists events_clamp_time on public.events;
create trigger events_clamp_time
  before insert or update on public.events
  for each row execute function public.clamp_client_time();
drop trigger if exists check_ins_clamp_time on public.check_ins;
create trigger check_ins_clamp_time
  before insert or update on public.check_ins
  for each row execute function public.clamp_client_time();
drop trigger if exists urge_events_clamp_time on public.urge_events;
create trigger urge_events_clamp_time
  before insert or update on public.urge_events
  for each row execute function public.clamp_client_time();
drop trigger if exists quiz_answers_clamp_time on public.quiz_answers;
create trigger quiz_answers_clamp_time
  before insert or update on public.quiz_answers
  for each row execute function public.clamp_client_time();
drop trigger if exists profiles_clamp_time on public.profiles;
create trigger profiles_clamp_time
  before insert or update on public.profiles
  for each row execute function public.clamp_client_time();
revoke all on function public.clamp_client_time() from public, anon, authenticated;

-- Rows already dated in the future (from before this trigger) are pulled back.
update public.events set created_at = now() where created_at > now();
update public.check_ins set created_at = now() where created_at > now();
update public.urge_events set started_at = now() where started_at > now();
update public.quiz_answers set answered_at = now() where answered_at > now();
update public.profiles set updated_at = now() where updated_at > now();

-- Daily at 03:17 UTC. pg_cron must live in pg_catalog on Supabase.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- Unschedule-then-schedule keeps exactly one copy of the job however many
-- times this file runs (unschedule by jobid never errors when absent).
select cron.unschedule(jobid) from cron.job where jobname = 'winback-retention';
select cron.schedule(
  'winback-retention',
  '17 3 * * *',
  $$select * from public.purge_expired_data()$$
);

-- Verify: one row, active = true.
--   select jobname, schedule, active from cron.job where jobname = 'winback-retention';
-- Dry-run the count without deleting anything: run the body of the `stale`
-- CTE above as a plain select count(*).

-- ===========================================================================
-- 4. Removed features
-- ===========================================================================

-- The AI edge functions (estimate-spend, notification-lines) are gone, and so
-- is their per-user quota. Nothing about a user is sent to an AI service.
drop function if exists public.bump_ai_usage(uuid, text, int);
drop table if exists public.ai_usage;

-- ===========================================================================
-- Verify
-- ===========================================================================

-- Five tables, each with rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','quiz_answers','check_ins','urge_events','events')
order by tablename;

-- Each of these should return 0 rows:
--   select 1 from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'profiles'
--     and privilege_type = 'DELETE' and grantee in ('anon','authenticated');
--   select 1 from public.quiz_answers where question_id = 'secrecy';
--   select 1 from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name = 'expo_push_token';
--   select 1 from pg_tables where schemaname = 'public' and tablename = 'ai_usage';
-- And this should return one active row:
--   select jobname, schedule, active from cron.job where jobname = 'winback-retention';
