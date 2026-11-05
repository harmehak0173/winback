#!/usr/bin/env node
// Build gate for EAS. Runs as the `eas-build-pre-install` npm hook, before
// dependencies are installed, so it uses Node built-ins only.
//
// A production binary built without its store keys looks finished but cannot
// sell anything: the paywall renders, every purchase fails, and App Review
// rejects it. src/lib/env.ts can only log that at runtime, after the build is
// already uploaded. This fails the build instead, while it is still cheap.
//
// Checked when the profile is `production`, or when the build says it is a
// production build (EXPO_PUBLIC_APP_ENV=production) whatever its profile is
// called - a store profile renamed or extended later must not slip past.
// Development and preview builds, and anything run on your own machine
// without either, pass straight through, so local work is never blocked.
//
// Manual run: node scripts/check-build-env.mjs --profile production --platform ios
//
// OTA updates: `--update <environment>`. `eas update` never reads the `env`
// block of an eas.json build profile - only the EAS environment named by
// `--environment` - so an update published without the backend variables in
// that environment ships a bundle with no backend to every installed binary:
// no sync, no restore, and an in-app deletion that cannot reach the server.
// The npm `update:*` scripts run this first, inside that EAS environment
// (`eas env:exec`), and publish only if it passes:
//   eas env:exec production "node scripts/check-build-env.mjs --update production"
// (env:exec takes the environment as its first argument; it has no
// --environment flag, unlike eas update and eas env:create.)
// For an update every variable a build needs is required (an update reaches
// both platforms), except that a preview update needs no store keys.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const update = arg('update'); // 'production' | 'preview' when gating `eas update`
if (args.includes('--update') && !update) {
  console.error('[check-build-env] --update needs the EAS environment name (production or preview).');
  process.exit(1);
}
const profile = update ?? arg('profile') ?? process.env.EAS_BUILD_PROFILE;
const platform = update ? undefined : (arg('platform') ?? process.env.EAS_BUILD_PLATFORM); // 'ios' | 'android'
const env = process.env;
const TAG = '[check-build-env]';
const kind = update ? `${update} update` : 'production build';

const productionEnv = (env.EXPO_PUBLIC_APP_ENV ?? '').trim() === 'production';
if (!update && profile !== 'production' && !productionEnv) {
  console.log(`${TAG} profile "${profile ?? 'none'}": nothing to check.`);
  process.exit(0);
}
const needsStore = !update || update === 'production';

const errors = [];
const warnings = [];
const val = (k) => (env[k] ?? '').trim();

// 0. The legal operator must be real: the public code ships placeholders
// (src/state/legal.ts, HANDOFF.md). Checked for production builds and updates.
if (needsStore) {
  const legal = readFileSync(new URL('../src/state/legal.ts', import.meta.url), 'utf8');
  const constant = (name) => legal.match(new RegExp(`export const ${name} = '([^']*)'`))?.[1]?.trim() ?? '';
  const operator = constant('OPERATOR_NAME');
  const contact = constant('CONTACT_EMAIL');
  if (!operator || operator === 'YOUR ORGANIZATION NAME') {
    errors.push('OPERATOR_NAME in src/state/legal.ts is still the placeholder. Set your organization, then run npm run sync:legal.');
  }
  if (!contact || /@example\.(org|com|net)$/i.test(contact)) {
    errors.push('CONTACT_EMAIL in src/state/legal.ts is still a placeholder address. Set your privacy contact, then run npm run sync:legal.');
  }
}

// 1. The app must know which environment it is (a production build refuses
//    to simulate purchases; an update must match the binaries it reaches).
const expectedEnv = update ?? 'production';
if (val('EXPO_PUBLIC_APP_ENV') !== expectedEnv) {
  errors.push(`EXPO_PUBLIC_APP_ENV must be "${expectedEnv}".`);
}

// 2. Backend. Without it there is no account, sync or in-app deletion.
const supabaseUrl = val('EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseUrl) errors.push('EXPO_PUBLIC_SUPABASE_URL is missing.');
else if (!/^https:\/\//.test(supabaseUrl)) errors.push('EXPO_PUBLIC_SUPABASE_URL must be an https:// URL.');

const anonKey = val('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (!anonKey) errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.');
else if (anonKey.startsWith('sb_secret_')) {
  errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is a secret key. Use the publishable (anon) key.');
}

// 3. RevenueCat public SDK key for the platform being built. `test_` keys
//    belong to RevenueCat's Test Store and cannot sell real subscriptions.
const RC = {
  ios: { name: 'EXPO_PUBLIC_REVENUECAT_IOS_KEY', prefix: 'appl_' },
  android: { name: 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', prefix: 'goog_' },
};
const platforms = platform === 'ios' || platform === 'android' ? [platform] : ['ios', 'android'];
for (const p of needsStore ? platforms : []) {
  const { name, prefix } = RC[p];
  const key = val(name);
  if (!key) errors.push(`${name} is missing (needed for ${p} purchases).`);
  else if (key.startsWith('test_')) errors.push(`${name} is a RevenueCat Test Store key (test_...). Use the ${prefix} key.`);
  else if (!key.startsWith(prefix)) errors.push(`${name} should start with "${prefix}" for ${p}.`);
}

// 3b. Game-day schedules. TheSportsDB's old free key "3" is switched off
//     (every request answers 403) and its terms allow the free test key
//     "123" for development only, so a store build or update needs a paid
//     key. Without one, game-day mode, the first Premium feature, finds no
//     team. The provider has no fallback in production, so this is the gate.
const FREE_SPORTSDB_KEYS = new Set(['1', '2', '3', '123']);
if (needsStore) {
  const sportsDb = val('EXPO_PUBLIC_THESPORTSDB_KEY');
  if (!sportsDb) {
    errors.push('EXPO_PUBLIC_THESPORTSDB_KEY is missing (a paid TheSportsDB key; game-day mode needs it).');
  } else if (FREE_SPORTSDB_KEYS.has(sportsDb)) {
    errors.push(`EXPO_PUBLIC_THESPORTSDB_KEY is TheSportsDB's free or test key ("${sportsDb}"). A store app needs a paid key.`);
  }
}

// 4. Anything named EXPO_PUBLIC_* is compiled into the app and readable by
//    anyone who unzips it. Server secrets must never be exposed that way:
//    checked by name, and by value, since a pasted key can sit under an
//    innocent name.
/** The role inside a legacy Supabase JWT key (eyJ...), or null. */
const jwtRole = (v) => {
  const parts = v.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
};
for (const k of Object.keys(env)) {
  if (!k.startsWith('EXPO_PUBLIC_')) continue;
  const v = val(k) ?? '';
  if (/OPENAI|SECRET|SERVICE|ADMIN|PRIVATE|PASSWORD|TOKEN|PERSONAL_API/i.test(k)) {
    errors.push(`${k} looks like a server secret. EXPO_PUBLIC_ variables ship inside the app; remove it.`);
  } else if (v.startsWith('sb_secret_') || jwtRole(v) === 'service_role') {
    errors.push(`${k} holds a Supabase secret (service role) key. Only the publishable (anon) key may ship in the app.`);
  } else if (/^phx_/.test(v) || /^sk_(live|test)_/.test(v)) {
    errors.push(`${k} holds a private API key (PostHog personal or a secret key). Remove it from EXPO_PUBLIC_ variables.`);
  }
}

// 5. Not fatal, but the listing and in-app links are weaker without them.
for (const k of [
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
  'EXPO_PUBLIC_DELETE_URL',
]) {
  if (!val(k)) warnings.push(`${k} is not set (optional, but the store listings need hosted pages).`);
}

for (const w of warnings) console.warn(`${TAG} warning: ${w}`);

if (errors.length) {
  console.error(`${TAG} ${kind} (${platforms.join('/')}) refused:`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    `${TAG} Set these with \`eas env:create --environment ${expectedEnv}\` (plaintext or sensitive visibility, not secret), then ${update ? 'publish the update again' : 'rebuild'}.`,
  );
  process.exit(1);
}

console.log(`${TAG} ${kind} (${platforms.join('/')}) environment looks complete.`);
