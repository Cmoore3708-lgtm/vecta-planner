import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('cloud IO protections are enforced by tests, not source-rewriting workflows', () => {
  assert.match(html, /function scheduleCloudRefresh\(payload\)/);
  assert.doesNotMatch(html, /table:'workshop_settings'\},scheduleCloudRefresh/);
  assert.match(html, /async function persistMainSettings\(\)/);
  assert.match(html, /fleetMotAuthorityLastPersisted/);
  assert.match(html, /fleetCloudLastPersistedPayload/);
  assert.match(html, /vecta_legacy_local_only/);
});
