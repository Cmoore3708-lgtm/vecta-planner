import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');

test('service-sheet date edits update the canonical Fleet service plan', () => {
  const start = html.indexOf('async function syncServiceSheetDueDateToFleet');
  const end = html.indexOf('async function saveServiceSheet', start);
  assert.ok(start > -1 && end > start, 'Fleet date synchroniser must exist before service-sheet save');
  const implementation = html.slice(start, end);
  assert.match(implementation, /data-due-field="service"/);
  assert.match(implementation, /fleetVehicleForRegistration\(reg\)/);
  assert.match(implementation, /fleetPlanMatching\(vehicle\.id,'service'\)/);
  assert.match(implementation, /plan\.currentDueDate=next/);
  assert.match(implementation, /plan\.manualDueDate=true/);
});

test('service-sheet save waits for Fleet cloud confirmation and fails closed', () => {
  assert.match(html, /await syncServiceSheetDueDateToFleet\(sheet,reg\)/);
  assert.match(html, /await persistFleetCloudSnapshot\(\)/);
  assert.match(html, /Fleet Manager did not confirm the amended service date/);
  assert.match(html, /The service date was NOT saved/);
});

test('whole-Fleet cloud saves are serialised so an older snapshot cannot win', () => {
  assert.match(html, /fleetCloudPersistQueue=Promise\.resolve\(\)/);
  assert.match(html, /fleetCloudPersistQueue\.catch\(function\(\)\{return false\}\)\.then\(async function\(\)/);
  assert.match(html, /fleetCloudQueuedSignatures\[sig\]/);
  assert.match(html, /function saveFleet\(\)[\s\S]*?return persistFleetCloudSnapshot\(\)/);
});

test('a manually saved Fleet service date wins when paperwork is rebuilt', () => {
  const start = html.indexOf('function serviceSheetDueData(j,kind)');
  const end = html.indexOf('function serviceSheetDateInput', start);
  const implementation = html.slice(start, end);
  assert.match(implementation, /servicePlan\.manualDueDate===true&&savedFleetNext/);
  assert.match(implementation, /\?savedFleetNext:\(calculatedNext\|\|savedFleetNext\)/);
});
