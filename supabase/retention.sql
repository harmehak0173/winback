-- Winback - data retention. Run in the Supabase SQL editor after schema.sql and
-- analytics.sql. Idempotent: safe to re-run.
--
-- What it enforces (and what the privacy policy promises):
--  1. An ANONYMOUS account (no saved email) that has shown no sign of life for
--     12 months is deleted, with everything tied to it. Anonymous users cannot
--     sign back in once their phone is gone, so without this their answers and
--     history would sit on the server forever with nobody able to reach or
--     delete them. Supabase does not clean up anonymous users on its own.
--  2. Rows in `events` (first-party usage analytics) older than 24 months are
--     deleted, for every account.
--
-- Accounts with a saved email are kept until the user deletes them: they can
-- always sign back in, and delete from the app or by email.
--
-- "No sign of life" means ALL of these are older than 12 months:
--  - the account's creation, last sign-in and last update (auth.users);
--  - every session's creation, update and token refresh (auth.sessions,
--    auth.refresh_tokens). This is the important one: an anonymous app keeps
--    its session alive by refreshing its token, which does NOT touch
--    auth.users.last_sign_in_at, so judging by last sign-in alone would delete
--    people who open the app every day;
--  - the newest row the account wrote: profile update, quiz answer, check-in,
--    panic session or usage event.
-- Any one of them inside the window keeps the account. The app refreshes its
-- token whenever it is opened online, so in practice an account is only
-- purged after a year in which the app never reached the server.
--
-- Deleting the auth user cascades to every table (ON DELETE CASCADE), exactly
-- like in-app deletion. Third-party copies are not reached from here:
-- PostHog only ever holds non-health usage events and expires them on its own
-- schedule; RevenueCat keeps purchase records (see the privacy policy).

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
