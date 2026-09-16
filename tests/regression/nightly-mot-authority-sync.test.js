import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../../api/fleet-nightly-refresh.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('nightly MOT refresh persists Fleet state and authority from the same DVSA result', () => {
  assert.match(route, /const MOT_AUTHORITY_ID = 'fleet_mot_authority_v260'/);
  assert.match(route, /const motDueDate=mot\.motExpiryDate\|\|firstMotDueDate\(mot\.firstUsedDate\)/);
  assert.match(route, /authorityRecords\[registration\]=\{registration,expiry:motDueDate,checked_at:checkedAt/);
  assert.match(route, /await writeSetting\(FLEET_STATE_ID,state\);\s*await writeSetting\(MOT_AUTHORITY_ID,/);
});

test('vehicles without MOT history use the statutory first-MOT deadline', () => {
  assert.match(route, /due\.setUTCFullYear\(due\.getUTCFullYear\(\) \+ 3\)/);
  assert.match(route, /due\.setUTCDate\(due\.getUTCDate\(\) - 1\)/);
  assert.match(html, /data\.firstUsedDate\|\|data\.first_used_date/);
  assert.match(html, /vehicle\.motDueDate=fresh;vehicle\.motDue=fresh;vehicle\.mot_due=fresh/);
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
