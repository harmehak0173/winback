#!/usr/bin/env node
/**
 * Serve a web export for the end-to-end tests: 127.0.0.1 only, never a file
 * outside the export folder, and unknown paths fall back to index.html the
 * way a static host does for client-side routes.
 *
 *   node scripts/serve-export.mjs [dir=dist-e2e] [port=8197]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? 'dist-e2e');
const PORT = Number(process.argv[3] ?? 8197);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};
const inside = (f) => f === ROOT || f.startsWith(ROOT + path.sep);

// The app export has an index.html; the generated site/ pages may not.
if (!fs.existsSync(ROOT) || !fs.readdirSync(ROOT).some((f) => f.endsWith('.html'))) {
  console.error(`No export at ${ROOT}. Run: npm run e2e:build`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    let f = path.resolve(ROOT, '.' + path.posix.normalize('/' + p));
    if (!inside(f)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f)) f = path.join(ROOT, 'index.html');
    if (!fs.existsSync(f)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));
