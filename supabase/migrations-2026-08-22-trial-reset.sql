-- SUPERSEDED - do not run. Run migrations-2026-09-27-launch.sql instead: it
-- includes this fix (the DELETE revoke) and replaces the trigger below with
-- one that starts the free week at commit. Running this file AFTER that one
-- would put the old first-launch anchor back. Kept for history only.
--
-- Original note: URGENT: run this before launch.
--
-- Fixes a live exploit found in the pre-ship review. RLS permits a user to
-- delete their own profiles row. The trial trigger stamped now() on INSERT, so
-- DELETE + re-INSERT handed out a fresh 7-day Premium trial, repeatably, with
-- two authenticated REST calls and no app involvement. Verified against the
-- production project on 2026-08-22.
--
-- The fix anchors the trial to auth.users.created_at, which the client cannot
-- reach or change, and removes the DELETE grant the exploit relied on.

-- The original body is in git history (git log -p -- this file). It is
-- replaced by a guard, so running this file by mistake cannot put the old
-- first-launch free-week anchor back over the launch migration's trigger.
do $$
begin
  raise exception 'SUPERSEDED: run migrations-2026-09-27-launch.sql (or setup-all.sql) instead.';
end;
$$;
