/**
 * The database, tested without touching the real project: setup-all.sql and
 * the hardening migration run in PGlite (Postgres compiled to WebAssembly),
 * on top of the pieces a Supabase project provides (the API roles, auth.uid(),
 * the auth tables the SQL reads, and a stand-in for pg_cron).
 *
 *   npm run test:sql
 *
 * Each test signs in as a user the way PostgREST does: the role is
 * `authenticated` and auth.uid() reads the JWT subject.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const file = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const SUPABASE_PRELUDE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  phone text,
  is_anonymous boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sign_in_at timestamptz
);
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamp
);
create table auth.refresh_tokens (
  id bigserial primary key,
  user_id varchar(255),
  created_at timestamptz,
  updated_at timestamptz
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  provider text not null
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema cron;
create table cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text,
  command text,
  active boolean default true
);
create function cron.schedule(job_name text, job_schedule text, job_command text) returns bigint
  language sql as $$
    insert into cron.job (jobname, schedule, command) values (job_name, job_schedule, job_command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
    returning jobid
  $$;
create function cron.unschedule(job_id bigint) returns boolean
  language sql as $$ delete from cron.job where jobid = job_id returning true $$;

-- What a Supabase project grants the API roles on new objects in public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

// pg_cron is the one extension the stand-in replaces.
const withoutCronExtension = (sql) =>
  sql.replace(/^create extension if not exists pg_cron[^;]*;/im, '-- pg_cron: stand-in schema above');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db;

/** Run `fn` as a signed-in user, the way PostgREST does. */
async function as(uid, fn) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_PRELUDE);
  await db.exec(withoutCronExtension(file('setup-all.sql')));
  await db.exec(file('migrations-2026-10-27-hardening.sql'));
  await db.query(`insert into auth.users (id, is_anonymous) values ($1, true), ($2, true)`, [A, B]);
});

describe('migrations', () => {
  test('setup-all.sql and the hardening migration can be run again', async () => {
    await db.exec(withoutCronExtension(file('setup-all.sql')));
    await db.exec(file('migrations-2026-10-27-hardening.sql'));
    const { rows } = await db.query(`select count(*)::int as n from cron.job where jobname = 'winback-retention'`);
    assert.equal(rows[0].n, 1);
  });

  test('the deletion verification query passes', async () => {
    const { rows } = await db.query(`
      select
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='hide_flag') as hide_flag_col,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='money_kept_before') as money_kept_col,
        (select count(*)::int from pg_indexes where schemaname='public' and indexname in ('urge_events_user_started_idx','events_created_at_brin')) as new_indexes,
        (select count(*)::int from pg_policies where schemaname='public' and policyname='no client delete') as delete_lock,
        (select count(*)::int from pg_trigger where tgname='events_cap_payload') as event_cap,
        (select count(*)::int from pg_constraint where conname='quiz_answers_size') as quiz_size,
        has_table_privilege('authenticated','public.profiles','DELETE') as auth_can_delete`);
    assert.deepEqual(rows[0], {
      hide_flag_col: 0,
      money_kept_col: 1,
      new_indexes: 2,
      delete_lock: 1,
      event_cap: 1,
      quiz_size: 1,
      auth_can_delete: false,
    });
  });
});

describe('row level security', () => {
  test('each person reads and writes only their own rows', async () => {
    await as(A, () => db.query(`insert into public.profiles (id, quit_at) values ($1, now())`, [A]));
    await as(B, () => db.query(`insert into public.profiles (id, quit_at) values ($1, now())`, [B]));
    const seen = await as(A, () => db.query(`select id from public.profiles`));
    assert.deepEqual(seen.rows.map((r) => r.id), [A]);
    await assert.rejects(
      as(A, () => db.query(`insert into public.check_ins (user_id, day) values ($1, current_date)`, [B])),
      /row-level security/,
    );
  });

  test('a signed-out caller is refused outright', async () => {
    // The app always signs in (anonymously) before it touches a table, so the
    // anon role holds no privilege at all, not just an empty result.
    await db.exec('set role anon');
    try {
      await assert.rejects(db.query(`select count(*) from public.profiles`), /permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('the free week', () => {
  test('a client cannot choose or move trial_started_at', async () => {
    const C = '00000000-0000-4000-8000-00000000000c';
    await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [C]);
    await as(C, () =>
      db.query(`insert into public.profiles (id, quit_at, trial_started_at) values ($1, now(), '2000-01-01')`, [C]),
    );
    const before = await db.query(`select trial_started_at from public.profiles where id = $1`, [C]);
    assert.ok(new Date(before.rows[0].trial_started_at).getFullYear() > 2000);
    await as(C, () => db.query(`update public.profiles set trial_started_at = '2100-01-01' where id = $1`, [C]));
    const after = await db.query(`select trial_started_at from public.profiles where id = $1`, [C]);
    assert.deepEqual(after.rows[0].trial_started_at, before.rows[0].trial_started_at);
  });

  test('a profile cannot be deleted and re-inserted for a fresh week', async () => {
    await assert.rejects(
      as(A, () => db.query(`delete from public.profiles where id = $1`, [A])),
      /permission denied/,
    );
    // Even if the privilege were ever granted again, the restrictive policy holds.
    await db.exec('grant delete on public.profiles to authenticated');
    try {
      const r = await as(A, () => db.query(`delete from public.profiles where id = $1`, [A]));
      assert.equal(r.affectedRows, 0);
    } finally {
      await db.exec('revoke delete on public.profiles from authenticated');
    }
  });
});

describe('what the server keeps', () => {
  test('the secrecy answer is dropped and the rest of the batch saved', async () => {
    await as(A, () =>
      db.query(
        `insert into public.quiz_answers (user_id, question_id, answer) values
           ($1, 'freq', '{"Pretty much every day"}'), ($1, 'secrecy', '{"Yes"}')`,
        [A],
      ),
    );
    const { rows } = await db.query(`select question_id from public.quiz_answers where user_id = $1 order by 1`, [A]);
    assert.deepEqual(rows.map((r) => r.question_id), ['freq']);
  });

  test('a quiz answer far beyond any real one is refused', async () => {
    const huge = `{${Array.from({ length: 20 }, (_, i) => `"option ${i}"`).join(',')}}`;
    await assert.rejects(
      as(A, () => db.query(`insert into public.quiz_answers (user_id, question_id, answer) values ($1, 'cost', $2)`, [A, huge])),
      /quiz_answers_size/,
    );
  });

  test('client dates in the future are pulled back to now', async () => {
    await as(A, () =>
      db.query(`insert into public.check_ins (user_id, day, created_at) values ($1, current_date, now() + interval '5 years')`, [A]),
    );
    const { rows } = await db.query(`select created_at <= now() as ok from public.check_ins where user_id = $1`, [A]);
    assert.equal(rows[0].ok, true);
  });

  test('usage events are truncated, never rejected', async () => {
    const bigProps = JSON.stringify({ blob: 'x'.repeat(10_000) });
    await as(A, () =>
      db.query(`insert into public.events (user_id, name, props) values ($1, $2, $3::jsonb)`, [A, 'n'.repeat(100), bigProps]),
    );
    const { rows } = await db.query(`select length(name) as len, props from public.events where user_id = $1`, [A]);
    assert.equal(rows[0].len, 64);
    assert.deepEqual(rows[0].props, { truncated: true });
  });
});

describe('privileges', () => {
  const TABLES = ['profiles', 'quiz_answers', 'check_ins', 'urge_events', 'events'];
  const can = async (role, table, priv) =>
    (await db.query(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, priv])).rows[0].ok;

  test('a signed-out caller holds no privilege on any table', async () => {
    for (const t of TABLES) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        assert.equal(await can('anon', t, p), false, `anon ${p} on ${t}`);
      }
    }
  });

  test('a signed-in user holds only what the app uses', async () => {
    const expected = {
      profiles: ['SELECT', 'INSERT', 'UPDATE'],
      quiz_answers: ['SELECT', 'INSERT', 'UPDATE'],
      check_ins: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      urge_events: ['SELECT', 'INSERT', 'UPDATE'],
      events: ['SELECT', 'INSERT'],
    };
    for (const t of TABLES) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        assert.equal(await can('authenticated', t, p), expected[t].includes(p), `authenticated ${p} on ${t}`);
      }
    }
  });

  test('every write the app makes still works', async () => {
    const D = '00000000-0000-4000-8000-0000000000e1';
    await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [D]);
    await as(D, async () => {
      // supabase-js upserts (ON CONFLICT DO UPDATE), as syncProfile and syncQuizAnswers send them.
      await db.query(`insert into public.profiles (id, quit_at) values ($1, now())
                      on conflict (id) do update set quit_at = excluded.quit_at`, [D]);
      await db.query(`insert into public.profiles (id, money_kept_before) values ($1, 12)
                      on conflict (id) do update set money_kept_before = excluded.money_kept_before`, [D]);
      await db.query(`insert into public.quiz_answers (user_id, question_id, answer) values ($1, 'goal', '{"A trip"}')
                      on conflict (user_id, question_id) do update set answer = excluded.answer`, [D]);
      await db.query(`insert into public.check_ins (user_id, day) values ($1, current_date)
                      on conflict (user_id, day) do nothing`, [D]);
      await db.query(`delete from public.check_ins where user_id = $1 and day = current_date`, [D]);
      const { rows } = await db.query(`insert into public.urge_events (user_id) values ($1) returning id`, [D]);
      await db.query(`update public.urge_events set ended_at = now() where id = $1 and user_id = $2`, [rows[0].id, D]);
      await db.query(`insert into public.events (user_id, name) values ($1, 'app_opened')`, [D]);
      // And the reads: restore, the free week, Insights.
      await db.query(`select * from public.profiles where id = $1`, [D]);
      await db.query(`select question_id, answer from public.quiz_answers where user_id = $1`, [D]);
      await db.query(`select day from public.check_ins where user_id = $1`, [D]);
      await db.query(`select started_at from public.urge_events order by started_at desc limit 500`);
    });
  });

  test('the policies apply to signed-in users and read auth.uid() once per query', async () => {
    const { rows } = await db.query(`
      select tablename, policyname, roles::text as roles, coalesce(qual, with_check) as expr
      from pg_policies where schemaname = 'public' and policyname <> 'no client delete'`);
    assert.equal(rows.length, 6);
    for (const r of rows) {
      assert.equal(r.roles, '{authenticated}', `${r.policyname} roles`);
      assert.match(r.expr, /\(\s*SELECT auth\.uid\(\)/i, `${r.policyname} wraps auth.uid()`);
    }
  });
});

describe('the retention job', () => {
  test('the API roles cannot run it', async () => {
    await assert.rejects(
      as(A, () => db.query(`select * from public.purge_expired_data()`)),
      /permission denied/,
    );
  });

  test('it deletes only anonymous accounts idle for 12 months, and events older than 24', async () => {
    const stale = '00000000-0000-4000-8000-0000000000d1';
    const recent = '00000000-0000-4000-8000-0000000000d2';
    const named = '00000000-0000-4000-8000-0000000000d3';
    const old = `now() - interval '13 months'`;
    await db.exec(`
      insert into auth.users (id, is_anonymous, created_at, updated_at, last_sign_in_at) values
        ('${stale}', true, ${old}, ${old}, ${old}),
        ('${recent}', true, ${old}, ${old}, now() - interval '2 months'),
        ('${named}', false, ${old}, ${old}, ${old});
      insert into public.profiles (id, updated_at) values ('${stale}', ${old});
      insert into public.urge_events (user_id, started_at) values ('${stale}', ${old});
      insert into public.events (user_id, name, created_at) values ('${recent}', 'old', now() - interval '25 months');
    `);
    const { rows } = await db.query(`select * from public.purge_expired_data()`);
    assert.deepEqual(rows[0], { anonymous_accounts_deleted: 1, events_deleted: 1 });
    const left = await db.query(`select id from auth.users where id in ($1, $2, $3) order by id`, [stale, recent, named]);
    assert.deepEqual(left.rows.map((r) => r.id), [recent, named]);
    const orphans = await db.query(`select count(*)::int as n from public.profiles where id = $1`, [stale]);
    assert.equal(orphans.rows[0].n, 0);
  });

  test('it never deletes an account that has linked an email, even if the anonymous flag lags', async () => {
    const linked = '00000000-0000-4000-8000-0000000000d4';
    const withEmail = '00000000-0000-4000-8000-0000000000d5';
    const old = `now() - interval '13 months'`;
    await db.exec(`
      insert into auth.users (id, is_anonymous, created_at, updated_at, last_sign_in_at) values
        ('${linked}', true, ${old}, ${old}, ${old});
      insert into auth.identities (user_id, provider) values ('${linked}', 'email');
      insert into auth.users (id, is_anonymous, email, created_at, updated_at, last_sign_in_at) values
        ('${withEmail}', true, 'someone@example.com', ${old}, ${old}, ${old});
    `);
    const { rows } = await db.query(`select * from public.purge_expired_data()`);
    assert.equal(rows[0].anonymous_accounts_deleted, 0);
    const left = await db.query(`select count(*)::int as n from auth.users where id in ($1, $2)`, [linked, withEmail]);
    assert.equal(left.rows[0].n, 2);
  });
});

/**
 * The end state must not depend on how a project got there. Two other paths
 * are built from scratch and checked for the same privileges, policies and
 * retention guard as the main database above:
 *  - a fresh project from setup-all.sql alone;
 *  - the live project's path: the setup script as it stood before the
 *    2026-09-27 launch, then the launch migration, then the hardening one.
 *    (Needs git history; skipped in a shallow clone.)
 */
async function endStateOf(scripts) {
  const fresh = new PGlite();
  await fresh.exec(SUPABASE_PRELUDE);
  for (const sql of scripts) await fresh.exec(withoutCronExtension(sql));
  const grants = await fresh.query(`
    select t.table_name, r.role, p.priv,
           has_table_privilege(r.role, 'public.' || t.table_name, p.priv) as ok
    from (values ('profiles'), ('quiz_answers'), ('check_ins'), ('urge_events'), ('events')) t(table_name)
    cross join (values ('anon'), ('authenticated')) r(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
    order by 1, 2, 3`);
  const policies = await fresh.query(`
    select tablename, policyname, roles::text as roles, coalesce(qual, with_check) as expr
    from pg_policies where schemaname = 'public' order by 1, 2`);
  const purge = await fresh.query(`select prosrc from pg_proc where proname = 'purge_expired_data'`);
  const extras = await fresh.query(`
    select
      (select count(*)::int from pg_trigger where tgname = 'events_cap_payload') as event_cap,
      (select count(*)::int from pg_constraint where conname = 'quiz_answers_size') as quiz_size,
      (select count(*)::int from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'hide_flag') as hide_flag`);
  await fresh.close();
  return {
    grants: grants.rows.map((r) => `${r.table_name} ${r.role} ${r.priv} ${r.ok}`),
    policies: policies.rows.map((r) => `${r.tablename} ${r.policyname} ${r.roles} ${/\(\s*SELECT auth\.uid\(\)/i.test(r.expr) || r.policyname === 'no client delete'}`),
    purgeGuardsIdentity: /auth\.identities/.test(purge.rows[0].prosrc),
    extras: extras.rows[0],
  };
}

describe('every path ends in the same state', () => {
  let expected;
  before(async () => {
    expected = await endStateOf([file('setup-all.sql'), file('migrations-2026-10-27-hardening.sql')]);
    assert.equal(expected.purgeGuardsIdentity, true);
    assert.deepEqual(expected.extras, { event_cap: 1, quiz_size: 1, hide_flag: 0 });
  });

  test('a fresh project from setup-all.sql alone', async () => {
    assert.deepEqual(await endStateOf([file('setup-all.sql')]), expected);
  });

  let preLaunch = null;
  try {
    preLaunch = execSync('git show 183e52f^:supabase/setup-all.sql', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    // shallow clone: no history to rebuild the live path from
  }
  test('the live path: pre-launch setup, launch migration, hardening migration', { skip: !preLaunch }, async () => {
    const launch = execSync('git show 183e52f:supabase/migrations-2026-09-27-launch.sql', { encoding: 'utf8' });
    assert.deepEqual(
      await endStateOf([preLaunch, launch, file('migrations-2026-10-27-hardening.sql')]),
      expected,
    );
  });
});
