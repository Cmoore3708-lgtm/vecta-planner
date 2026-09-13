import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

test('every local script loaded by the production shell exists', () => {
  const html = read('index.html');
  const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(source => source.startsWith('/'));
  assert.ok(sources.length >= 7, 'expected the seven production rule modules');
  for (const source of sources) {
    const publicPath = `public/${source.replace(/^\//, '')}`;
    assert.ok(exists(publicPath), `${source} must resolve from public/`);
  }
});

test('PWA shell files and every pre-cached asset exist', () => {
  const worker = read('service-worker.js');
  const publicWorker = read('public/service-worker.js');
  assert.equal(worker, publicWorker, 'root and public service workers must be identical');
  const cacheList = worker.match(/const CORE(?:_FILES)?\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(cacheList, 'service worker must define its core precache list');
  const assets = [...cacheList[1].matchAll(/["'](\/[^"']+)["']/g)].map(match => match[1]);
  for (const asset of assets) {
    if (asset === '/' || asset === '/index.html' || asset === '/booking') continue;
    assert.ok(exists(`public/${asset.replace(/^\//, '')}`), `${asset} must exist for offline precaching`);
  }
});

test('service worker caches the deployed HTML without rewriting application code', () => {
  const worker = read('service-worker.js');
  assert.doesNotMatch(worker, /patchAppShellHtml|htmlResponseFrom|cachePatchedShell/);
  assert.doesNotMatch(worker, /patched\.replace|oldRegister|safeRegister/);
  assert.match(worker, /async function cacheShell\(response\)/);
  assert.match(read('index.html'), /window\.__vectaCacheResetPromise=Promise\.resolve\(\)/);
});

test('Vercel rewrites and cron targets resolve to production files', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.ok(exists('index.html'));
  assert.ok(exists('booking.html') || exists('public/booking.html'));
  for (const cron of config.crons || []) {
    const endpoint = String(cron.path || '').replace(/^\/api\//, 'api/');
    assert.ok(exists(`${endpoint}.js`), `${cron.path} must have a server function`);
  }
});

test('integration suite cannot silently be empty', () => {
  const files = fs.readdirSync(path.join(root, 'tests/integration')).filter(name => name.endsWith('.test.js'));
  assert.ok(files.length > 0);
});

test('additional-work approvals derive customer identity from an existing job', () => {
  const source = read('api/additional-work.js');
  assert.match(source, /jobs\?select=id,registration,vehicle,customer_name,customer_email,customer_phone/);
  assert.match(source, /if\(!job\)return res\.status\(404\)/);
  assert.match(source, /registration:job\.registration/);
  assert.doesNotMatch(source, /registration:b\.registration/);
  assert.match(source, /b\.items\.length>50/);
  assert.match(source, /Number\.isFinite\(x\.price\)/);
});

test('Git tracks one production tree and no generated or historical application copies', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }).trim().split('\n');
  assert.equal(tracked.filter(path => path.startsWith('node_modules/')).length, 0);
  assert.equal(tracked.filter(path => path.startsWith('dist/')).length, 0);
  assert.equal(tracked.filter(path => path.startsWith('css/')).length, 0);
  assert.deepEqual(tracked.filter(path => path.startsWith('assets/')).sort(), [
    'assets/vecta-header.png',
    'assets/vecta-logo.png',
    'assets/vecta-logo.webp',
  ]);
});
