/**
 * Game-day team search: a refused key or a failed request means the search
 * did not run, never "no team found"; a production build without a paid key
 * never calls the source; and the build gate refuses a store build without
 * one.
 */
// Node built-ins, typed here because the project's types are React Native's.
const { spawnSync } = require('child_process') as {
  spawnSync(
    command: string,
    args: string[],
    options: { env: Record<string, string>; encoding: 'utf8' },
  ): { status: number | null; stdout: string; stderr: string };
};
const node = process as unknown as { execPath: string; cwd(): string };

type Provider = import('@/lib/schedule/TheSportsDbProvider').TheSportsDbProvider;

const realFetch = globalThis.fetch;
const calls: string[] = [];
let respond: (url: string) => Promise<unknown>;

const reply = (status: number, body: unknown) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const BILLS = {
  idTeam: '134918',
  strTeam: 'Buffalo Bills',
  strTeamShort: 'BUF',
  strSport: 'American Football',
  strLeague: 'NFL',
};

function load(env: Record<string, string> = {}): Provider {
  Object.assign(process.env, env);
  let mod!: typeof import('@/lib/schedule/TheSportsDbProvider');
  jest.isolateModules(() => {
    mod = require('@/lib/schedule/TheSportsDbProvider');
  });
  return new mod.TheSportsDbProvider();
}

beforeEach(() => {
  calls.length = 0;
  delete process.env.EXPO_PUBLIC_THESPORTSDB_KEY;
  delete process.env.EXPO_PUBLIC_APP_ENV;
  respond = reply(200, { teams: null });
  globalThis.fetch = jest.fn(async (url: unknown) => {
    calls.push(String(url));
    return respond(String(url));
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.EXPO_PUBLIC_THESPORTSDB_KEY;
  delete process.env.EXPO_PUBLIC_APP_ENV;
});

describe('team search', () => {
  it('reports a refused key as a search that did not run', async () => {
    respond = reply(403, "The old '3' Free Sports API key is permanently disabled");
    const provider = load({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key' });
    expect(await provider.searchTeams('Buffalo Bills')).toEqual({ teams: [], ok: false });
  });

  it('reports a network error the same way', async () => {
    respond = async () => {
      throw new TypeError('Network request failed');
    };
    const provider = load({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key' });
    expect(await provider.searchTeams('Buffalo Bills')).toEqual({ teams: [], ok: false });
  });

  it('reports no match as a search that ran', async () => {
    const provider = load({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key' });
    expect(await provider.searchTeams('Nobody United')).toEqual({ teams: [], ok: true });
  });

  it('maps a match to a team', async () => {
    respond = reply(200, { teams: [BILLS] });
    const provider = load({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key' });
    expect(await provider.searchTeams('Buffalo Bills')).toEqual({
      teams: [{ id: '134918', league: 'nfl', name: 'Buffalo Bills', abbreviation: 'BUF' }],
      ok: true,
    });
  });
});

describe('which key is used', () => {
  it('uses the configured key as given', async () => {
    const provider = load({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key', EXPO_PUBLIC_APP_ENV: 'production' });
    await provider.searchTeams('Buffalo Bills');
    expect(calls[0]).toContain('/api/v1/json/paid-key/searchteams.php');
  });

  it('falls back to the test key outside production', async () => {
    const provider = load({ EXPO_PUBLIC_APP_ENV: 'preview' });
    await provider.searchTeams('Buffalo Bills');
    expect(calls[0]).toContain('/api/v1/json/123/');
  });

  it('never calls the source from a production build with no key', async () => {
    const provider = load({ EXPO_PUBLIC_APP_ENV: 'production' });
    expect(await provider.searchTeams('Buffalo Bills')).toEqual({ teams: [], ok: false });
    const team = { id: '134918', league: 'nfl' as const, name: 'Buffalo Bills', abbreviation: 'BUF' };
    expect(await provider.getUpcomingGames([team], 7)).toEqual({ games: [], complete: false, anyOk: false });
    expect(calls).toEqual([]);
  });
});

describe('build gate', () => {
  const script = `${node.cwd()}/scripts/check-build-env.mjs`;
  const productionEnv = {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    EXPO_PUBLIC_APP_ENV: 'production',
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
    EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_test',
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_test',
  };
  const gate = (extra: Record<string, string>) =>
    spawnSync(node.execPath, [script, '--profile', 'production', '--platform', 'ios'], {
      env: { ...productionEnv, ...extra },
      encoding: 'utf8',
    });

  it('refuses a production build with no TheSportsDB key', () => {
    const run = gate({});
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('EXPO_PUBLIC_THESPORTSDB_KEY is missing');
  });

  it('refuses the free and test keys', () => {
    for (const key of ['3', '123']) {
      const run = gate({ EXPO_PUBLIC_THESPORTSDB_KEY: key });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('free or test key');
    }
  });

  it('accepts a paid key', () => {
    // The public code ships legal placeholders, which the gate refuses on
    // their own; only the TheSportsDB check matters here.
    const run = gate({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key' });
    expect(`${run.stdout}${run.stderr}`).not.toMatch(
      /EXPO_PUBLIC_THESPORTSDB_KEY (is missing|is TheSportsDB's free or test key)/,
    );
  });

  it('refuses the legal placeholders the public code ships with', () => {
    const run = gate({ EXPO_PUBLIC_THESPORTSDB_KEY: 'paid-key' });
    expect(run.status).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain('OPERATOR_NAME');
  });
});
