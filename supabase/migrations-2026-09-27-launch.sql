-- Launch migration, 2026-09-27. Run this ONCE on the existing project, in the
-- Supabase SQL editor (Dashboard -> SQL Editor -> New query). It is idempotent,
-- so running it again is harmless. A fresh project gets the same result from
-- setup-all.sql, which already contains everything below.
--
-- It also includes the 2026-08-22 unlimited-free-week fix (the DELETE revoke),
-- so it is safe to run whether or not that older migration was ever applied.
--
-- What it changes:
--  1. Removes the AI quota table and function (the AI features are gone).
--  2. Drops profiles.expo_push_token (no remote push; reminders are local),
--     and adds profiles.daily_index and best_streak_days (restored on a new
--     phone).
--  3. Refuses the `secrecy` quiz answer at the database, and purges any copy.
--  4. Starts the free week when the user commits instead of at first launch,
--     and re-asserts the DELETE revoke that makes that safe.
--  5. Schedules the daily retention job (pg_cron): anonymous accounts with no
--     activity for 12 months are deleted, and usage events older than 24
--     months are deleted. Activity dates sent by the app are clamped to the
--     server's clock, so a phone set ahead cannot keep its rows (or its
--     account) out of that job's reach.
-- The verification queries at the bottom should all pass afterwards.

-- ---------------------------------------------------------------------------
-- 1. AI removal
-- ---------------------------------------------------------------------------
drop function if exists public.bump_ai_usage(uuid, text, int);
drop table if exists public.ai_usage;

-- ---------------------------------------------------------------------------
-- 2. No remote push
-- ---------------------------------------------------------------------------
-- Older builds upsert this column after commit; once it is gone that write
-- fails harmlessly (the app only logs a warning) and nothing else is affected.
alter table public.profiles drop column if exists expo_push_token;

-- Curriculum position and best streak travel with the account, so a new
-- phone restores them. The app syncs them in a separate upsert.
alter table public.profiles add column if not exists daily_index int not null default 0;
alter table public.profiles add column if not exists best_streak_days int not null default 0;

-- ---------------------------------------------------------------------------
-- 3. The `secrecy` answer never reaches the server
-- ---------------------------------------------------------------------------
delete from public.quiz_answers where question_id = 'secrecy';

-- Drops the row silently rather than raising, so a batch upsert from an older
-- build still saves every other answer.
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

-- Hard backstop if the trigger is ever dropped.
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

-- ---------------------------------------------------------------------------
-- 4. The free week starts at commit
-- ---------------------------------------------------------------------------
-- The app writes the profile row for the first time at commit, so stamping
-- now() on INSERT starts the week there. It used to be anchored to
-- auth.users.created_at (first launch), which cost users who paused mid-quiz
-- some or all of their week.
--
-- Stamping now() on insert was once exploitable (delete the row, re-insert,
-- fresh week). That only worked while the client could DELETE its profile;
-- the revoke below closes it, so each account gets exactly one INSERT and one
-- week. Existing rows keep the start they already have.
create or replace function public.lock_trial_started_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
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

revoke delete on public.profiles from anon, authenticated;

drop trigger if exists profiles_lock_trial on public.profiles;
create trigger profiles_lock_trial
  before insert or update on public.profiles
  for each row execute function public.lock_trial_started_at();

-- ---------------------------------------------------------------------------
-- 5. Retention job (same as retention.sql; see that file for the reasoning
--    behind the inactivity rule)
-- ---------------------------------------------------------------------------
-- An anonymous account is purged only when every one of these is older than
-- 12 months: its creation, last sign-in and last update; every session's
-- creation, update and token refresh; and the newest row it wrote in any
-- table. Accounts with a saved email are never purged by this job.
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
      and u.created_at < cutoff
      and coalesce(u.last_sign_in_at, u.created_at) < cutoff
      and coalesce(u.updated_at, u.created_at) < cutoff
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
        where rt.user_id = u.id::text
          and greatest(rt.created_at, rt.updated_at) >= cutoff
      )
      and not exists (select 1 from public.profiles p where p.id = u.id and p.updated_at >= cutoff)
      and not exists (select 1 from public.quiz_answers q where q.user_id = u.id and q.answered_at >= cutoff)
      and not exists (select 1 from public.check_ins c where c.user_id = u.id and c.created_at >= cutoff)
      and not exists (select 1 from public.urge_events ue where ue.user_id = u.id and ue.started_at >= cutoff)
      and not exists (select 1 from public.events e where e.user_id = u.id and e.created_at >= cutoff)
    order by u.created_at
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

-- Rows already dated in the future (from before this trigger) are pulled back.
update public.events set created_at = now() where created_at > now();
update public.check_ins set created_at = now() where created_at > now();
update public.urge_events set started_at = now() where started_at > now();
update public.quiz_answers set answered_at = now() where answered_at > now();
update public.profiles set updated_at = now() where updated_at > now();

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.unschedule(jobid) from cron.job where jobname = 'winback-retention';
select cron.schedule(
  'winback-retention',
  '17 3 * * *',
  $$select * from public.purge_expired_data()$$
);

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
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
