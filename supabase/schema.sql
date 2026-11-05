-- Winback - Supabase schema
-- Run in the SQL editor of your Supabase project. Idempotent: safe to re-run.
-- Prerequisite: enable "Allow anonymous sign-ins" (Authentication → Providers).
--
-- setup-all.sql = this file + analytics.sql + retention.sql + cleanup of
-- removed features. For an existing project, run the newest
-- migrations-*.sql file instead (or setup-all.sql again; both are idempotent).

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
