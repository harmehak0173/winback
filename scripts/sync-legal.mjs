/**
 * Regenerates every published copy of the legal text from src/state/legal.ts:
 *  - docs/terms.md and docs/privacy-policy.md (readable in the repo);
 *  - site/support.html, privacy.html, terms.html, delete-account.html
 *    and health-data.html: the static pages the store consoles link to.
 *
 * The app ships the legal text inside the binary, and the same text has to be
 * hosted for the store consoles. Keeping copies by hand meant they drifted:
 * the in-app Terms and the hosted Terms ended up with different clauses, so a
 * user agreed to one thing and the public document said another. legal.ts is
 * the single source of truth; this writes everything else from it.
 *
 * Output is deterministic (no build dates, no external assets, no scripts),
 * so re-running it without a legal.ts change produces no diff. It also fails
 * on copy the app must never ship: em or en dashes, "sportsbook", and any
 * leftover placeholder.
 *
 * Run: node scripts/sync-legal.mjs   (or npm run sync:legal)
 * Hosting site/ is a manual step: any static host works (GitHub Pages,
 * Netlify, Cloudflare Pages). Then set EXPO_PUBLIC_PRIVACY_URL,
 * EXPO_PUBLIC_TERMS_URL, EXPO_PUBLIC_DELETE_URL and EXPO_PUBLIC_SUPPORT_URL.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/state/legal.ts'), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// Parse legal.ts (see the format rules at the top of that file)
// ---------------------------------------------------------------------------

/** Single-quoted string constants, e.g. OPERATOR_NAME. */
const constants = {};
for (const m of src.matchAll(/export const ([A-Z_]+)\s*=\s*'((?:[^'\\\n]|\\.)*)';/g)) {
  constants[m[1]] = m[2].replace(/\\(.)/g, '$1');
}

const interpolate = (name, text) =>
  text.replace(/\$\{([A-Z_]+)\}/g, (_, key) => {
    if (!(key in constants)) throw new Error(`${name} uses \${${key}}, which is not a string constant`);
    return constants[key];
  });

/** Template-literal texts, with their constants filled in. */
const texts = {};
for (const m of src.matchAll(/export const ([A-Z_]+)\s*=\s*`([\s\S]*?)`;/g)) {
  if (/\\|\$\{(?![A-Z_]+\})/.test(m[2])) throw new Error(`${m[1]}: only \${CONSTANT} interpolation is supported`);
  texts[m[1]] = interpolate(m[1], m[2]).trim();
}

/** LEGAL_DOCS: key -> { title, body }. */
const docsBlock = src.match(/export const LEGAL_DOCS[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!docsBlock) throw new Error('could not find LEGAL_DOCS in src/state/legal.ts');
const docs = {};
for (const m of docsBlock[1].matchAll(/'?([a-z-]+)'?:\s*\{\s*title:\s*'([^']+)',\s*body:\s*([A-Z_]+)\s*\}/g)) {
  if (!texts[m[3]]) throw new Error(`LEGAL_DOCS.${m[1]} points at unknown text ${m[3]}`);
  docs[m[1]] = { title: m[2], body: texts[m[3]] };
}
for (const key of ['privacy', 'terms', 'health-data', 'delete-account', 'support']) {
  if (!docs[key]) throw new Error(`LEGAL_DOCS is missing ${key}`);
}

const updated = constants.LAST_UPDATED;
if (!updated) throw new Error('could not find LAST_UPDATED in src/state/legal.ts');

// U+2013 en dash and U+2014 em dash, built from code points so this file
// never contains the characters it bans.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

// Copy rules. Checked here because this is the one place every legal string
// passes through before it is published.
for (const [key, { title, body }] of Object.entries(docs)) {
  const all = `${title}\n${body}`;
  if (DASHES.test(all)) throw new Error(`${key}: contains an em or en dash; use a plain hyphen`);
  if (/sportsbook|\bthe books\b/i.test(all)) throw new Error(`${key}: say "the betting companies"`);
  if (/\bTODO\b|\[\s*(?:NAME|COMPANY|ADDRESS|DATE)\s*\]/i.test(all)) throw new Error(`${key}: placeholder left in`);
  for (const [, target] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (target.startsWith('doc:') && !docs[target.slice(4)]) throw new Error(`${key}: link to unknown ${target}`);
    if (!/^(doc:|https:\/\/|mailto:)/.test(target)) throw new Error(`${key}: unsupported link ${target}`);
  }
}

// ---------------------------------------------------------------------------
// Markdown (docs/)
// ---------------------------------------------------------------------------

// Pages that have a markdown twin in docs/ link to it; the rest link to site/.
const mdTarget = { privacy: 'privacy-policy.md', terms: 'terms.md' };
const toMarkdown = (body) =>
  body.replace(/\]\(doc:([a-z-]+)\)/g, (_, key) => `](${mdTarget[key] ?? `../site/${siteFile(key)}`})`);

const written = [];
const write = (rel, content) => {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  written.push(`${rel} (${content.length} chars)`);
};

write('docs/terms.md', `# Winback Terms of Use\n\nLast updated: ${updated}\n\n${toMarkdown(docs.terms.body)}\n`);
write(
  'docs/privacy-policy.md',
  `# Winback Privacy Policy\n\nLast updated: ${updated}\n\n${toMarkdown(docs.privacy.body)}\n`,
);

// ---------------------------------------------------------------------------
// HTML (site/)
// ---------------------------------------------------------------------------

function siteFile(key) {
  // A landing page (index.html), if the operator adds one, is never written from here.
  return `${key}.html`;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escape, then turn [label](target) into links. */
const inline = (s) =>
  esc(s).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, target) => {
    const href = target.startsWith('doc:') ? siteFile(target.slice(4)) : target;
    return `<a href="${href}">${label}</a>`;
  });

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function bodyToHtml(body) {
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(`<ul>\n${list.join('\n')}\n</ul>`);
    list = null;
  };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith('### ')) {
      flush();
      out.push(`<h3 id="${slug(line.slice(4))}">${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flush();
      out.push(`<h2 id="${slug(line.slice(3))}">${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('- ')) {
      (list ??= []).push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join('\n');
}

/** First sentence of the body, as plain text, for the meta description. */
const description = (body) => {
  const first = body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
  const plain = first.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const sentence = plain.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? plain;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
};

/**
 * The support page is Supabase's Site URL, where the "Save my progress"
 * confirmation link lands, and that link can carry a session token in the
 * address. This clears it from the address bar and the history, and says
 * what happened, so a shared or bookmarked address never holds a token.
 */
const CONFIRM_SCRIPT = `<script>
(function () {
  var where = location.hash + location.search;
  if (!/access_token|refresh_token|[?&#]code=|error_code/.test(where)) return;
  var failed = /error_code|error=/.test(where);
  history.replaceState(null, '', location.pathname);
  var note = document.createElement('p');
  note.setAttribute('role', 'status');
  note.textContent = failed
    ? 'This link did not work, or it has expired. Open Winback and send a new one.'
    : 'Email confirmed. Go back to Winback.';
  var main = document.getElementById('main');
  main.insertBefore(note, main.querySelector('.updated'));
})();
</script>
`;

const NAV = ['support', 'privacy', 'terms', 'health-data', 'delete-account'];
const NAV_LABEL = {
  support: 'Support',
  privacy: 'Privacy',
  terms: 'Terms',
  'health-data': 'Health data',
  'delete-account': 'Delete account',
};

// Brand tokens from src/theme/tokens.ts. System fonts only: no external
// requests, so the pages load anywhere and track nobody.
const CSS = `:root{--bg:#0A0B0D;--surface:#131519;--hairline:#20242B;--text:#F2F3F5;--muted:#A9AEB6;--faint:#8A8F98;--accent:#FF8A3D}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--muted);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-underline-offset:2px}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
.skip{position:absolute;left:-999px;top:0;background:var(--accent);color:#0b0b0d;padding:8px 12px}
.skip:focus{left:16px;top:16px}
header,main,footer{max-width:44rem;margin:0 auto;padding:0 16px}
header{padding-top:20px;padding-bottom:12px;border-bottom:1px solid var(--hairline)}
nav{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 20px}
.brand{color:var(--text);font-weight:800;font-size:20px;letter-spacing:-0.02em;text-decoration:none;margin-right:auto}
nav ul{display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;margin:0;padding:0;font-size:15px}
nav a{text-decoration:none}
nav a[aria-current="page"]{color:var(--text);text-decoration:underline}
main{padding-top:28px;padding-bottom:40px}
h1{color:var(--text);font-size:30px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 6px}
h2{color:var(--text);font-size:19px;line-height:1.3;margin:32px 0 8px}
h3{color:var(--text);font-size:16px;margin:24px 0 6px}
p,ul{margin:0 0 14px}
ul{padding-left:22px}
li{margin:0 0 8px}
.updated{color:var(--faint);font-size:14px;margin-bottom:24px}
footer{border-top:1px solid var(--hairline);padding-top:16px;padding-bottom:32px;color:var(--faint);font-size:14px}
footer p{margin:0 0 6px}`;

function page(key) {
  const { title, body } = docs[key];
  const nav = NAV.map((k) => {
    const current = k === key ? ' aria-current="page"' : '';
    return `<li><a href="${siteFile(k)}"${current}>${NAV_LABEL[k]}</a></li>`;
  }).join('');
  const email = constants.CONTACT_EMAIL;
  return `<!doctype html>
<!-- Generated by scripts/sync-legal.mjs from src/state/legal.ts. Do not edit by hand. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="description" content="${esc(description(body))}">
<title>${esc(key === 'support' ? title : `${title} - Winback`)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="img/icon-32.png">
<link rel="apple-touch-icon" href="img/icon-180.png">
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header>
<nav aria-label="Winback pages"><a class="brand" href="index.html">Winback</a><ul>${nav}</ul></nav>
</header>
<main id="main">
<h1>${esc(title)}</h1>
<p class="updated">Last updated: ${esc(updated)}</p>
${bodyToHtml(body)}
</main>
<footer>
<p>Winback is operated by ${esc(constants.OPERATOR_NAME)}. Contact: <a href="mailto:${esc(email)}">${esc(email)}</a></p>
<p>Winback is a support tool, not treatment. If you are in immediate danger, call your local emergency number.</p>
</footer>
${key === 'support' ? CONFIRM_SCRIPT : ''}</body>
</html>
`;
}

for (const key of NAV) write(`site/${siteFile(key)}`, page(key));

for (const line of written) console.log(`wrote ${line}`);
console.log('legal pages regenerated from src/state/legal.ts');
