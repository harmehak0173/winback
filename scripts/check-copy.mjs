#!/usr/bin/env node
/**
 * Copy gate: `npm run check:copy`. Exits non-zero on any failure.
 *
 * 1. House copy rules, everywhere user-facing:
 *    - src/**: every string literal and JSX text, plus the whole file for the
 *      long dashes (comments included - the rule is plain hyphens everywhere).
 *    - site/** (the hosted pages) and docs/privacy-policy.md, docs/terms.md.
 *      `--all-docs` adds the rest of docs/.
 *    Fails on U+2014 / U+2013 (and their HTML entities), "the books",
 *    "sportsbook" and "addict(s)" (the word, not "addiction").
 *    In src/** copy it also fails on the words behind unsourced physiological
 *    claims ("brain", "nervous system", "wiring", "dopamine", "rewire"): say
 *    what people commonly report, hedged, instead.
 *
 * 2. The reminder line bank and engine (src/lib/lineBank.ts,
 *    src/lib/schedule/reminderPlan.ts), run for real: the TypeScript is
 *    transpiled with the project's own compiler into a temp folder and
 *    imported. For a set of sample quiz profiles, in three time zones, over
 *    ~9 weeks of daily rebuilds that cross daylight-saving changes, it checks:
 *    every line is sanitized and short enough; no money amount and no banned
 *    word in any push; discreet pushes carry no betting word, number, team or
 *    day count; no repeated line within 14 days in the daily slots; day
 *    numbers equal the streak's own floor formula at each push's own time;
 *    morning and evening land on the chosen wall-clock time across DST; at
 *    most 3 a day and 50 in total; every route is a known one; game-day only
 *    for Premium; evening close-outs skipped once closed, and replaced by
 *    lights out or an evening final; every open evening keeps exactly one
 *    push of its own, however busy the day; lights out gone once tonight's
 *    is done; a goal name with an amount in it never reaches a push.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const DASH_RE = new RegExp(`[${EM}${EN}]|&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;`, 'i');
const WORDS_RE = /the books|sportsbook|\baddicts?\b/i;
const HEALTH_RE = /\bbrains?\b|nervous system|\bwiring\b|dopamine|\brewir/i;

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

// ---------------------------------------------------------------------------
// 1. Copy rules over files
// ---------------------------------------------------------------------------

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scanSource(file) {
  const text = fs.readFileSync(file, 'utf8');
  const dash = DASH_RE.exec(text);
  if (dash) fail(`${rel(file)}:${lineOf(text, dash.index)}`, 'long dash (use a plain hyphen)');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    let s = null;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      s = node.text;
    } else if (ts.isJsxText(node)) {
      s = node.getText(sf);
    }
    if (s != null) {
      const m = WORDS_RE.exec(s);
      if (m) fail(`${rel(file)}:${lineOf(text, node.getStart(sf))}`, `banned word "${m[0]}" in copy`);
      const h = HEALTH_RE.exec(s);
      if (h) {
        fail(
          `${rel(file)}:${lineOf(text, node.getStart(sf))}`,
          `physiological claim "${h[0]}" in copy (hedge it as what people report)`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function scanDoc(file) {
  const text = fs.readFileSync(file, 'utf8');
  const dash = DASH_RE.exec(text);
  if (dash) fail(`${rel(file)}:${lineOf(text, dash.index)}`, 'long dash (use a plain hyphen)');
  const words = new RegExp(WORDS_RE.source, 'gi');
  for (const m of text.matchAll(words)) {
    fail(`${rel(file)}:${lineOf(text, m.index)}`, `banned word "${m[0]}"`);
  }
}

/** The file scans, then the engine checks in each time zone. */
function main() {
  const allDocs = process.argv.includes('--all-docs');
  const srcFiles = walk(SRC, ['.ts', '.tsx']);
  for (const f of srcFiles) scanSource(f);
  const docFiles = [
    ...walk(path.join(ROOT, 'site'), ['.html', '.md', '.txt']),
    ...(allDocs
      ? walk(path.join(ROOT, 'docs'), ['.md'])
      : ['docs/privacy-policy.md', 'docs/terms.md']
          .map((p) => path.join(ROOT, p))
          .filter((p) => fs.existsSync(p))),
  ];
  for (const f of docFiles) scanDoc(f);
  console.log(`copy rules: ${srcFiles.length} source files, ${docFiles.length} documents scanned`);

  // ---------------------------------------------------------------------------
  // 2. Engine checks, once per time zone, each in its own process
  // ---------------------------------------------------------------------------

  const ZONES = ['America/New_York', 'Europe/London', 'Australia/Sydney'];
  let engineFailed = false;
  for (const tz of ZONES) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--engine', tz], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    process.stdout.write(r.stdout ?? '');
    if (r.status !== 0) {
      engineFailed = true;
      process.stderr.write(r.stderr ?? '');
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} copy problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
  }
  if (failures.length || engineFailed) {
    console.error('\ncheck:copy FAILED');
    process.exit(1);
  }
  console.log('\ncheck:copy passed');
}

// ===========================================================================
// Engine harness
// ===========================================================================

/** Stand-ins for the few native modules the pure engine's imports touch. */
const STUBS = {
  '@react-native-async-storage/async-storage':
    'export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };',
};

/**
 * Transpile `entry` and everything it imports from src/ into `outDir` as ES
 * modules, rewriting the `@/` alias and relative specifiers. Type-only
 * imports are erased by the compiler, so nothing native is pulled in.
 */
function buildGraph(entries, outDir) {
  const done = new Map();
  const resolveFile = (spec, fromFile) => {
    const base = spec.startsWith('@/')
      ? path.join(SRC, spec.slice(2))
      : path.resolve(path.dirname(fromFile), spec);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    throw new Error(`cannot resolve ${spec} from ${rel(fromFile)}`);
  };
  const outName = (file) => path.join(outDir, rel(file).replace(/\.(ts|tsx)$/, '.mjs'));
  const emit = (file) => {
    if (done.has(file)) return done.get(file);
    const target = outName(file);
    done.set(file, target);
    const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: false,
      },
      fileName: file,
    });
    // Only real import/export statements (line-anchored), never a quoted
    // "from '...'" inside a comment or a string.
    const IMPORT_RE = /^(\s*(?:import|export)\s[^;]*?\bfrom\s*|\s*import\s*)(['"])([^'"]+)\2/gm;
    const code = outputText.replace(IMPORT_RE, (all, lead, q, spec) => {
      let dest;
      if (STUBS[spec]) {
        dest = path.join(outDir, '__stubs', `${spec.replace(/[^a-z0-9]/gi, '_')}.mjs`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, STUBS[spec]);
      } else if (spec.startsWith('@/') || spec.startsWith('.')) {
        dest = emit(resolveFile(spec, file));
      } else {
        throw new Error(`${rel(file)} imports "${spec}", which the engine checks cannot load`);
      }
      let r = path.relative(path.dirname(target), dest).replace(/\\/g, '/');
      if (!r.startsWith('.')) r = `./${r}`;
      return `${lead}${q}${r}${q}`;
    });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, code);
    return target;
  };
  return entries.map((e) => emit(path.join(SRC, e)));
}

async function engineChecks(tz) {
  const errors = [];
  const bad = (msg) => {
    if (errors.length < 60) errors.push(msg);
  };
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winback-copy-'));
  let L, P, S;
  try {
    const [lb, rp, si] = buildGraph(
      ['lib/lineBank.ts', 'lib/schedule/reminderPlan.ts', 'lib/scheduleInput.ts'],
      outDir,
    );
    L = await import(pathToFileURL(lb).href);
    P = await import(pathToFileURL(rp).href);
    S = await import(pathToFileURL(si).href);
  } catch (e) {
    console.error(`[${tz}] could not load the engine: ${e.message}`);
    return true;
  }

  const DAY = 86_400_000;
  const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const localAt = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0);

  // --- Pools ---------------------------------------------------------------
  const pools = {
    MORNING_LEADS: L.MORNING_LEADS,
    EVENING_BODIES: L.EVENING_BODIES,
    LIGHTS_OUT_BODIES: L.LIGHTS_OUT_BODIES,
    COMEBACK_BODIES: L.COMEBACK_BODIES,
  };
  for (const [name, pool] of Object.entries(pools)) {
    if (new Set(pool).size !== pool.length) bad(`${name} has duplicate lines`);
    for (const s of pool) {
      if (L.sanitize(s) !== s) bad(`${name}: not sanitized: "${s}"`);
      if (L.PUSH_BANNED.test(s)) bad(`${name}: banned word: "${s}"`);
      if (L.MONEY_PATTERN.test(s)) bad(`${name}: money: "${s}"`);
    }
  }
  for (const name of ['MORNING_LEADS', 'EVENING_BODIES', 'LIGHTS_OUT_BODIES']) {
    if (pools[name].length < 14)
      bad(`${name} has ${pools[name].length} lines; 14 needed for no repeats in two weeks`);
  }
  const discreetLines = [
    L.DISCREET_TITLE,
    ...L.DISCREET_MORNING,
    ...L.DISCREET_EVENING,
    L.DISCREET_WEEKLY,
    L.DISCREET_BUSY_DAY,
    L.DISCREET_BUSY_EVENING,
    L.DISCREET_CHECKING_IN,
    L.DISCREET_NIGHT,
    L.DISCREET_OPEN_APP,
    L.DISCREET_RETURN,
  ];
  for (const s of discreetLines) {
    if (L.DISCREET_BANNED.test(s)) bad(`discreet line reveals too much: "${s}"`);
  }

  // --- Profiles ------------------------------------------------------------
  const prefs = S.DEFAULT_REMINDER_PREFS;
  const lateOnly = S.mergeReminderPrefs(prefs, {
    morning: { hour: 7, minute: 30 },
    lateNight: { hour: 0, minute: 15 },
  });
  const team = (id, league, name) => ({ id, league, name, abbreviation: name });
  const PROFILES = [
    { name: 'empty', answers: {} },
    {
      name: 'nfl-payday-late',
      answers: { freq: 0, sports: [0], style: 0, triggers: [0, 1, 2], history: 3, goal: 0, secrecy: 2 },
      lateNightUser: true,
    },
    {
      name: 'college-soccer-premium',
      answers: { freq: 2, sports: [3, 4], style: 2, triggers: [0, 3, 6], history: 2, goal: 1 },
      isPremium: true,
      teams: [team('134918', 'nfl', 'Buffalo Bills'), team('133604', 'soccer', 'Arsenal')],
    },
    {
      name: 'nba-nhl-mlb-discreet',
      answers: { freq: 1, sports: [1, 2], style: 3, triggers: [4, 5], history: 1, goal: 2, secrecy: 0 },
      discreet: true,
      isPremium: true,
      teams: [team('134860', 'nba', 'Boston Celtics')],
    },
    {
      name: 'fights-all-triggers',
      answers: { freq: 3, sports: [5, 6], style: 4, triggers: [0, 1, 2, 3, 4, 5, 6], history: 0, goal: 3 },
      lateNightUser: true,
      prefs: lateOnly,
    },
    { name: 'other-only', answers: { sports: [6], style: 5, triggers: [0], goal: 3 } },
    {
      name: 'comeback-goal-followup',
      answers: { sports: [0], triggers: [1], goal: 1 },
      comeback: true,
      goal: { name: 'Trip fund', target: 1200 },
      followUp: true,
    },
  ];

  // The start dates cross a daylight-saving change in every zone checked:
  // Oct 25 (Europe), Nov 1 (US), Oct 4 and Apr 4 (Sydney), Mar 14 (US) and Mar 28 (Europe).
  const RUNS = [
    { from: localAt(2026, 9, 24), days: 64 },
    { from: localAt(2027, 3, 1), days: 45 },
  ];

  const syntheticGames = (now) => {
    const k = (n, h, mi) => {
      const d = new Date(now);
      d.setDate(d.getDate() + n);
      d.setHours(h, mi, 0, 0);
      return d;
    };
    const game = (id, league, start, half, len, home, away) => ({
      id,
      league,
      startsAt: start.toISOString(),
      estimatedHalftimeAt: half == null ? null : new Date(start.getTime() + half * 60_000).toISOString(),
      estimatedEndAt: len == null ? null : new Date(start.getTime() + len * 60_000).toISOString(),
      homeName: home,
      awayName: away,
    });
    return [
      game('9001', 'nba', k(0, 19, 30), 75, 150, 'Boston Celtics', 'Cleveland Cavaliers'),
      game('9002', 'nfl', k(1, 13, 0), 95, 195, 'Buffalo Bills', 'Miami Dolphins'),
      // A double-header day: the second game's final lands in the evening.
      game('9006', 'nfl', k(1, 16, 25), 95, 195, 'New York Jets', 'Buffalo Bills'),
      game('9003', 'mlb', k(2, 19, 5), null, 165, 'New York Yankees', 'Boston Red Sox'),
      game('9004', 'soccer', k(3, 12, 30), 48, 115, 'Arsenal', 'Chelsea'),
      game('9005', 'nfl', k(4, 20, 15), 95, 195, 'Kansas City Chiefs', 'Buffalo Bills'),
    ];
  };

  let checked = 0;
  for (const prof of PROFILES) {
    for (const run of RUNS) {
      const quit = new Date(run.from.getTime() - 3 * DAY + 5.5 * 3_600_000).toISOString();
      const deliveredMorning = new Map();
      const deliveredEvening = new Map();
      const deliveredNight = new Map();
      for (let i = 0; i < run.days; i++) {
        const now = new Date(run.from);
        now.setDate(now.getDate() + i);
        now.setHours(6, 45, 0, 0);
        const today = dayKey(now);
        const closedToday = i % 3 === 0;
        // Lights out closes the day too, so a closed night implies a closed day.
        const nightClosedToday = closedToday && i % 2 === 0;
        const p = prof.prefs ?? prefs;
        const input = {
          quitDate: quit,
          answers: prof.answers,
          discreet: !!prof.discreet,
          isPremium: !!prof.isPremium,
          closedToday,
          nightClosedToday,
          prefs: prof.followUp ? S.mergeReminderPrefs(p, { types: { followUp: true } }) : p,
          teams: prof.teams ?? [],
          lastMilestoneSeen: 0,
          comebackStartedDay: prof.comeback ? dayKey(new Date(now.getTime() - 2 * DAY)) : null,
          todayPlanSet: i % 2 === 0,
          goal: prof.goal ?? null,
          keptNow: 250 + i * 40,
          dailyRate: 40,
          lateNightUser: !!prof.lateNightUser,
          urgeFollowUpAt: prof.followUp ? new Date(now.getTime() + 3_600_000).toISOString() : null,
          cutLinesRemaining: 6,
        };
        const games = prof.teams ? syntheticGames(now) : [];
        let plan;
        try {
          plan = P.planReminders(input, games, now);
          // The same input without Premium must drop every game-day push.
          const free = P.planReminders({ ...input, isPremium: false }, games, now);
          if (free.some((r) => r.kind.startsWith('game-')))
            bad(`${prof.name}: game-day push without Premium`);
        } catch (e) {
          bad(`${prof.name} ${today}: engine threw: ${e.stack}`);
          continue;
        }
        const where = `${prof.name} @${today}`;
        checked += plan.length;
        // The night each lights out belongs to: after midnight it is the
        // night before (a calendar day back, not 24h, which a DST change breaks).
        const nightOf = (r) => {
          const d = new Date(r.at);
          if (d.getHours() < 12) d.setDate(d.getDate() - 1);
          return dayKey(d);
        };

        if (plan.length > P.MAX_PENDING) bad(`${where}: ${plan.length} pending, over ${P.MAX_PENDING}`);
        const perDay = new Map();
        for (const r of plan) {
          const k = dayKey(r.at);
          perDay.set(k, (perDay.get(k) ?? 0) + 1);
        }
        for (const [k, n] of perDay) if (n > P.MAX_PER_DAY) bad(`${where}: ${n} pushes on ${k}`);

        for (const r of plan) {
          const tag = `${where} ${r.kind} ${r.at.toString().slice(0, 21)}`;
          const text = `${r.title} ${r.body}`;
          if (r.at.getTime() <= now.getTime()) bad(`${tag}: in the past`);
          if (!r.title || !r.body) bad(`${tag}: empty copy`);
          if (L.sanitize(r.title) !== r.title || L.sanitize(r.body) !== r.body) bad(`${tag}: not sanitized`);
          if (DASH_RE.test(text)) bad(`${tag}: long dash`);
          if (r.title.length > 60) bad(`${tag}: title too long (${r.title.length})`);
          if (r.body.length > 200) bad(`${tag}: body too long (${r.body.length})`);
          if (L.PUSH_BANNED.test(text)) bad(`${tag}: banned word: "${text}"`);
          if (L.MONEY_PATTERN.test(text)) bad(`${tag}: money in a push: "${text}"`);
          if (!P.parseReminderUrl(r.url)) bad(`${tag}: unknown route ${r.url}`);
          if (input.discreet) {
            if (r.title !== L.DISCREET_TITLE) bad(`${tag}: discreet title "${r.title}"`);
            if (L.DISCREET_BANNED.test(r.body)) bad(`${tag}: discreet body reveals: "${r.body}"`);
            for (const t of input.teams) if (text.includes(t.name)) bad(`${tag}: team name in discreet push`);
          }
          // Day numbers: the streak's own floor, at this push's own time.
          const m = /^Day (\d+)\./.exec(r.title);
          if (m && r.kind === 'morning') {
            const expected = Math.floor((r.at.getTime() - Date.parse(quit)) / DAY);
            if (Number(m[1]) !== expected) bad(`${tag}: says day ${m[1]}, streak shows ${expected}`);
          }
          // Wall-clock times hold across DST.
          if (['morning', 'milestone', 'payday', 'comeback', 'goal'].includes(r.kind)) {
            if (r.at.getHours() !== p.morning.hour || r.at.getMinutes() !== p.morning.minute) {
              bad(`${tag}: morning at ${r.at.getHours()}:${r.at.getMinutes()}`);
            }
          }
          if (['closeout', 'recap', 'milestone-eve'].includes(r.kind)) {
            if (r.at.getHours() !== p.evening.hour || r.at.getMinutes() !== p.evening.minute) {
              bad(`${tag}: evening at ${r.at.getHours()}:${r.at.getMinutes()}`);
            }
          }
          if (
            r.kind === 'lights-out' &&
            (r.at.getHours() !== p.lateNight.hour || r.at.getMinutes() !== p.lateNight.minute)
          ) {
            bad(`${tag}: lights out at ${r.at.getHours()}:${r.at.getMinutes()}`);
          }
          // Quiet once the day is closed.
          if (
            closedToday &&
            dayKey(r.at) === today &&
            ['closeout', 'recap', 'milestone-eve'].includes(r.kind)
          ) {
            bad(`${tag}: close-out ask on a closed day`);
          }
          if (closedToday && r.kind === 'game-post' && dayKey(r.at) === today && /close out today/i.test(r.body)) {
            bad(`${tag}: post-game asks to close out a closed day`);
          }
        }

        if (nightClosedToday && plan.some((r) => r.kind === 'lights-out' && nightOf(r) === today)) {
          bad(`${where}: lights out tonight after tonight's lights out`);
        }

        // Every open evening in the window keeps exactly one push of its own
        // (the close-out, the Sunday recap, a milestone eve, lights out or an
        // evening final), however many game pushes that day has.
        for (let d = 0; d < P.HORIZON_DAYS; d++) {
          const day = new Date(now);
          day.setDate(day.getDate() + d);
          const k = dayKey(day);
          if (d === 0 && closedToday) continue;
          const evening = plan.filter(
            (r) =>
              (['closeout', 'recap', 'milestone-eve'].includes(r.kind) && dayKey(r.at) === k) ||
              (r.kind === 'lights-out' && nightOf(r) === k) ||
              (r.kind === 'game-post' && r.slot === `e:${k}`),
          );
          if (!evening.length) bad(`${where}: no evening push on ${k}`);
          if (evening.filter((r) => r.kind !== 'game-post').length > 1) {
            bad(`${where}: ${evening.length} evening pushes on ${k}`);
          }
        }

        // Late-night users on a Sunday: lights out carries the week.
        if (input.lateNightUser && !input.discreet) {
          for (const r of plan) {
            if (r.kind === 'lights-out' && new Date(nightOf(r) + 'T12:00:00').getDay() === 0 && !/your week/.test(r.body)) {
              bad(`${where}: Sunday lights out without the week: "${r.body}"`);
            }
          }
        }

        // Lights out and an evening final replace that evening's close-out.
        const nights = new Set(plan.filter((r) => r.kind === 'lights-out').map(nightOf));
        const finals = new Set(
          plan.filter((r) => r.kind === 'game-post' && r.slot).map((r) => r.slot.slice(2)),
        );
        for (const r of plan) {
          if (r.kind !== 'closeout' && r.kind !== 'recap') continue;
          const k = dayKey(r.at);
          if (nights.has(k)) bad(`${where}: close-out and lights out both on ${k}`);
          if (finals.has(k)) bad(`${where}: close-out and an evening final both on ${k}`);
        }
        if (input.isPremium && prof.teams && !input.discreet) {
          const kinds = new Set(plan.map((r) => r.kind));
          if (!kinds.has('game-pre') && !kinds.has('game-half') && !kinds.has('game-post')) {
            bad(`${where}: Premium with teams but no game-day push`);
          }
          if (plan.some((r) => r.kind === 'game-half' && r.title.includes('Yankees')))
            bad(`${where}: halftime for baseball`);
        }

        // What this day actually delivers, from the rebuild made that morning.
        for (const r of plan) {
          if (dayKey(r.at) !== today || input.discreet) continue;
          if (r.kind === 'morning') deliveredMorning.set(today, r.body);
          if (r.kind === 'closeout') deliveredEvening.set(today, r.body);
          if (r.kind === 'lights-out') deliveredNight.set(today, r.body);
        }
      }

      // No repeats inside any 14-day window, for the daily slots.
      const noRepeats = (label, delivered) => {
        const days = [...delivered.keys()].sort();
        for (let a = 0; a < days.length; a++) {
          for (let b = a + 1; b < days.length; b++) {
            const gap = (Date.parse(`${days[b]}T12:00:00Z`) - Date.parse(`${days[a]}T12:00:00Z`)) / DAY;
            if (gap >= 14) break;
            if (delivered.get(days[a]) === delivered.get(days[b])) {
              bad(
                `${prof.name}: ${label} repeats within 14 days (${days[a]}, ${days[b]}): "${delivered.get(days[a])}"`,
              );
            }
          }
        }
      };
      noRepeats('morning', deliveredMorning);
      noRepeats('close-out', deliveredEvening);
      noRepeats('lights out', deliveredNight);

      // The morning lead itself (the line behind the call to action).
      const profile = L.profileFrom(
        prof.answers,
        (prof.teams ?? []).map((t) => t.league),
      );
      const leads = new Map();
      for (let i = 0; i < run.days; i++) {
        const d = new Date(run.from);
        d.setDate(d.getDate() + i);
        const key = dayKey(d);
        leads.set(key, L.morningLead({ key, dayNumber: i + 3, profile, bigEvent: null }));
      }
      noRepeats('morning lead', leads);
    }
  }

  // A goal checkpoint names the goal and never an amount.
  const g = L.goalLine('Trip fund', 50, false);
  if (!g.body.includes('Trip fund') || L.MONEY_PATTERN.test(g.body) || /\d/.test(g.body))
    bad('goal line shows an amount');
  // A goal the user named with an amount in it never puts the amount on a
  // lock screen: the push falls back to not naming the goal.
  const HOSTILE_GOALS = ['$5,000 emergency fund', 'Pay off 12k card', 'Pay off $4,000 card', '500 dollars', 'Save 1200', '€800 trip'];
  for (const name of HOSTILE_GOALS) {
    const lines = [
      L.goalLine(name, 25, false),
      ...[1, 15].flatMap((d) => [0, 1, 2, 3].map((m) => L.paydayLine(`2027-0${m + 1}-${String(d).padStart(2, '0')}`, name, false))),
    ];
    for (const l of lines) {
      const text = `${l.title} ${l.body}`;
      if (L.MONEY_PATTERN.test(text) || /\d/.test(text)) bad(`goal "${name}" leaks into a push: "${text}"`);
    }
  }
  // One comeback push per comeback day, each from the same list the screen shows.
  if (L.COMEBACK_BODIES.length !== 7) bad(`COMEBACK_BODIES has ${L.COMEBACK_BODIES.length} lines, 7 needed`);

  fs.rmSync(outDir, { recursive: true, force: true });
  if (errors.length) {
    console.error(`[${tz}] engine: ${errors.length} problem(s)`);
    for (const e of errors) console.error(`  - ${e}`);
    return true;
  }
  console.log(`engine [${tz}]: ${checked} scheduled pushes checked across ${PROFILES.length} profiles`);
  return false;
}

// ---------------------------------------------------------------------------
// Entry. Child mode runs the engine checks in one time zone: TZ is set by the
// parent before the process starts, so every Date in the child uses it.
// ---------------------------------------------------------------------------
if (process.argv[2] === '--engine') {
  const failed = await engineChecks(process.argv[3]);
  process.exit(failed ? 1 : 0);
} else {
  main();
}
