import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './helpers.js';

const html = source();
const worker = source('service-worker.js');

test('synthetic Test startup never waits for IndexedDB before rendering', () => {
  assert.match(html, /var startupBackupRestore=vectaRestoreLatestBackupIfNeeded\(\);/);
  assert.match(html, /if\(!window\.VECTA_PUBLIC_SYNTHETIC_TEST\)await startupBackupRestore;/);
  assert.match(html, /else startupBackupRestore\.then\(/);
  assert.match(html, /bindTop\(\);\n  vectaSetStartupLoading\(false\);render\(\);/);
});

test('Test service-worker updates do not reload a page during startup', () => {
  assert.match(html, /controllerchange',function\(\)\{\n      if\(window\.VECTA_PUBLIC_SYNTHETIC_TEST\)return;/);
  assert.match(html, /controllerchange',function\(\)\{if\(!window\.VECTA_PUBLIC_SYNTHETIC_TEST\)vectaSafeApplyAppUpdate\(\)\}/);
  assert.match(worker, /!\/vecta-workshop-pro-test\/i\.test\(self\.location\.hostname\)/);
  assert.doesNotMatch(worker, /const CORE=\[\n  '\/'/);
});

test('service-worker bounds Safari navigation and cloud waits', () => {
  assert.match(worker, /function fetchWithTimeout\(/);
  assert.match(worker, /const cached=\(await caches\.match\('\/index\.html'\)\) \|\| \(await caches\.match\('\/'\)\);\s*if\(cached\) return await htmlResponseFrom\(cached\)/);
  assert.match(worker, /fetchWithTimeout\(req,\{cache:'no-store'\},8000\)/);
  assert.doesNotMatch(worker, /const fresh=await fetch\(req,\{cache:'no-store'\}\)/);
});
