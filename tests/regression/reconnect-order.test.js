import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('reconnect flushes queued local writes before downloading cloud state', () => {
  const match = html.match(/async function vectaHandleReconnect\(\)\{([\s\S]*?)\n\}/);
  assert.ok(match, 'one named reconnect coordinator must exist');
  const body = match[1];
  const flush = body.indexOf('await flushPendingSync()');
  const refresh = body.indexOf('refreshPlannerCoreFromCloudAndRender()');
  assert.ok(flush >= 0, 'reconnect must flush the offline queue');
  assert.ok(refresh > flush, 'cloud refresh must happen after the offline queue flush');
  assert.equal((html.match(/addEventListener\('online'/g) || []).length, 1, 'only one online listener may own reconnect');
  assert.match(html, /addEventListener\('online',vectaHandleReconnect\)/);
});
