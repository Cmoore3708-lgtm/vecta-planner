import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../../api/fleet-nightly-refresh.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('nightly MOT refresh persists Fleet state and authority from the same DVSA result', () => {
  assert.match(route, /const MOT_AUTHORITY_ID = 'fleet_mot_authority_v260'/);
  assert.match(route, /authorityRecords\[registration\]=\{registration,expiry:mot\.motExpiryDate,checked_at:checkedAt,source:'DVSA automatic nightly refresh'\}/);
  assert.match(route, /await writeSetting\(FLEET_STATE_ID,state\);\s*await writeSetting\(MOT_AUTHORITY_ID,/);
});

test('stale devices merge authority records by checked timestamp before saving', () => {
  assert.match(html, /function fleetMergeMotAuthorityRecords\(/);
  assert.match(html, /localStamp>=remoteStamp/);
  assert.match(html, /fleetMotAuthorityPersistQueue/);
  assert.match(html, /select\('value'\)\.eq\('id',FLEET_MOT_AUTHORITY_CLOUD_ID\)\.maybeSingle\(\)/);
});

test('newer Fleet plan timestamps block rollback from older authority data', () => {
  assert.match(html, /planStamp&&authorityStamp&&planStamp>authorityStamp/);
  assert.match(html, /authorityStamp>=planStamp/);
  assert.match(html, /dvsaIsoDate\(canonical\.currentDueDate\)!==expiry/);
});
