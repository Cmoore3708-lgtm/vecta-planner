import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
const serviceWorker=fs.readFileSync(new URL('../../public/service-worker.js',import.meta.url),'utf8');

test('production build splits the three oversized inline scripts',()=>{
  assert.match(packageJson.scripts.build,/split-built-html\.mjs/);
  for(const id of ['02','06','14'])assert.match(serviceWorker,new RegExp(`/assets/vecta-inline-${id}\\.js`));
});
