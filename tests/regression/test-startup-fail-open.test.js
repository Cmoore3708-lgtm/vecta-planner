import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const worker = fs.readFileSync('service-worker.js', 'utf8');

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

