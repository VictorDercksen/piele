// Serves the production build with the headers and rewrites from vercel.json, so the
// production browser suite checks the CSP and deep links before a real deployment.
// Sources are treated as regular expressions, which covers the patterns vercel.json uses.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = 'dist/piele-web/browser';
const port = Number(process.env['PIELE_WEB_PORT'] ?? 4400);
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const matches = (source, path) => new RegExp(`^${source}$`).test(path);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

async function file(path) {
  const full = normalize(join(root, path));
  if (!full.startsWith(normalize(root))) return null;
  try {
    return (await stat(full)).isFile() ? full : null;
  } catch {
    return null;
  }
}

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  for (const rule of config.headers ?? []) {
    if (matches(rule.source, path)) {
      for (const { key, value } of rule.headers) response.setHeader(key, value);
    }
  }
  let target = await file(path);
  if (!target) {
    const rewrite = (config.rewrites ?? []).find((rule) => matches(rule.source, path));
    target = rewrite ? await file(rewrite.destination) : null;
  }
  if (!target) {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
  response.end(await readFile(target));
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
