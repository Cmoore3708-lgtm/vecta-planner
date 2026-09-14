import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('superseded empty version script shells are absent', () => {
  assert.doesNotMatch(html, /<script id="v243-unified-search"/);
  assert.doesNotMatch(html, /<script id="v241-new-job-inline-calendar"/);
  assert.doesNotMatch(html, /<script id="v332-completed-service-late-install"/);
});

test('disabled Fleet-open MOT callbacks do not wrap fleetBind', () => {
  assert.doesNotMatch(html, /function runWhenFleetOpens\s*\(/);
  assert.doesNotMatch(html, /function v254RunOnFleetOpen\s*\(/);
  assert.doesNotMatch(html, /fleetBind\.__v234Wrapped/);
  assert.doesNotMatch(html, /fleetBind\.__v254Wrapped/);
  assert.doesNotMatch(html, /fleetBind\.__v311MotBridge/);
  assert.doesNotMatch(html, /applyFleetCloudSnapshot\.__v311MotBridge/);
});

test('active MOT and completed-service rules remain available', () => {
  assert.match(html, /window\.v234LatestMotExpiry\s*=\s*latestMotExpiry/);
  assert.match(html, /window\.v255RunAllMotMaintenanceRecords\s*=\s*v255RunAll/);
  assert.match(html, /window\.v332RepairCompletedServices\s*=\s*repair/);
  assert.match(html, /function syncFleetMotScheduleFromJob\(j,saveNow\)\{[\s\S]*?Government MOT data is the sole authority[\s\S]*?return null;/);
  assert.doesNotMatch(html, /syncFleetMaintenanceFromJob\.__v254Wrapped/);
  assert.doesNotMatch(html, /syncFleetMaintenanceFromJob\.__v264MotLocked/);
  assert.doesNotMatch(html, /syncFleetMotScheduleFromJob\.__v264Disabled/);
  assert.match(html, /window\.v311MotCycleCompleted\s*=\s*currentMotCycleCompleted/);
});

test('ordinary job saves cannot launch the bulk Fleet integrity repair', () => {
  assert.match(html, /async function saveJob\(id\)[\s\S]*?v310DuplicateFor\(j,id\)/);
  assert.doesNotMatch(html, /v310OldSaveJob|v310OldGather/);
  assert.doesNotMatch(html, /setTimeout\(function\(\)\{v310RepairAll\(false\);?\},0\)/);
  assert.match(html, /window\.v310RepairFleetIntegrity\s*=\s*v310RepairAll/);
});

test('invoice printing uses its canonical sender rule without a late wrapper', () => {
  assert.match(html, /function printInvoice\(inv\)[\s\S]*?invoiceSenderHtml\(inv\|\|\{\},true\)/);
  assert.doesNotMatch(html, /printInvoiceV329Base/);
});

test('v255 is the sole executable authoritative MOT workflow', () => {
  assert.doesNotMatch(html, /function v254Reconcile\s*\(/);
  assert.doesNotMatch(html, /function v254FetchFresh\s*\(/);
  assert.doesNotMatch(html, /window\.__v254ManualMotRunning/);
  assert.match(html, /window\.v255RunAllMotMaintenanceRecords\s*=\s*v255RunAll/);
  assert.match(html, /window\.v254ReconcileAllFleetMots\s*=\s*v255RunAll/);
  assert.match(html, /id="fleet-service-only-completion-guard"/);
});
