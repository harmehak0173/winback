-- Winback funnel analytics. Run in the Supabase SQL editor. Idempotent.
-- Every event is owned by the (anonymous) user who produced it; query funnels
-- in the dashboard with the service role. Rows older than 24 months are
-- deleted by the daily job in retention.sql. Nothing is written here when the
-- user has turned off "Share usage data". created_at is sent by the app (the
-- time the event happened, possibly offline); retention.sql adds a trigger
-- that clamps it to the server's clock, so a phone set ahead cannot write rows
-- the 24-month delete never reaches.

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
