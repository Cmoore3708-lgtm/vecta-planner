import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
const serviceWorker=fs.readFileSync(new URL('../../public/service-worker.js',import.meta.url),'utf8');

test('production build splits the three oversized inline scripts',()=>{
  assert.match(packageJson.scripts.build,/split-built-html\.mjs/);
  const splitter=fs.readFileSync(new URL('../../scripts/split-built-html.mjs',import.meta.url),'utf8');
  assert.match(splitter,/createHash\('sha256'\)/, 'split scripts must use content-hashed filenames so service-worker caches cannot serve old application code');
  assert.doesNotMatch(serviceWorker,/\/assets\/vecta-inline-0[27]\.js|\/assets\/vecta-inline-15\.js/, 'the service worker must not pre-cache fixed script filenames');
});
