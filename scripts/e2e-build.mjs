#!/usr/bin/env node
/**
 * Build the web export the end-to-end tests run against, with no backend.
 *
 * EXPO_NO_DOTENV=1 keeps .env out, and --clear stops Metro re-inlining live
 * keys from its cache. The export is then scanned: if anything that looks
 * like a live key made it in, the build fails rather than letting a test
 * talk to the real project.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-e2e');

const env = { ...process.env, EXPO_NO_DOTENV: '1' };
for (const k of Object.keys(env)) if (k.startsWith('EXPO_PUBLIC_')) delete env[k];

const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', OUT], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) process.exit(r.status ?? 1);

// Markers of live configuration: a Supabase project URL (a 20-character
// project ref - supabase-js itself mentions "*.supabase.co", which is fine)
// and the key formats of Supabase, PostHog and RevenueCat.
const LIVE = [
  /https:\/\/[a-z0-9]{20}\.supabase\.co/,
  /sb_publishable_/,
  /\bphc_[A-Za-z0-9]{10,}/,
  /\b(appl|goog)_[A-Za-z0-9]{10,}/,
];
const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|json)$/.test(e.name)) {
      const text = fs.readFileSync(p, 'utf8');
      for (const re of LIVE) if (re.test(text)) found.push(`${path.relative(ROOT, p)}: ${re}`);
    }
  }
};
walk(OUT);
if (found.length) {
  console.error(`The export has live configuration inlined:\n  ${found.join('\n  ')}`);
  process.exit(1);
}
console.log(`e2e build ready: ${path.relative(ROOT, OUT)} (no live configuration found)`);
