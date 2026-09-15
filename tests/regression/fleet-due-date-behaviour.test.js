import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function extractFunction(name, after = 0) {
  const start = html.indexOf(`function ${name}(`, after);
  assert.ok(start >= 0, `${name} exists`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('an overdue stored date remains overdue until confirmed work advances it', () => {
  const source = extractFunction('fleetDate');
  const context = { console, fleetVehicles: [], fleetMotAuthority: {}, fleetMaintenanceCategory: () => 'service' };
  vm.runInNewContext(`${source};this.fleetDate=fleetDate`, context);
  assert.equal(context.fleetDate({ type: 'Annual Service', currentDueDate: '2024-01-31', intervalMonths: 12 }), '2024-01-31');
});

test('authoritative MOT date overrides a stale stored MOT date', () => {
  const source = extractFunction('fleetDate');
  const context = { console, fleetVehicles: [{ id: 'v1', registration: 'AB12 CDE' }], fleetMotAuthority: { AB12CDE: { expiry: '2027-04-20' } }, fleetMaintenanceCategory: () => 'mot', normReg: value => String(value).replace(/\s/g, '').toUpperCase(), dvsaIsoDate: value => String(value).slice(0, 10) };
  vm.runInNewContext(`${source};this.fleetDate=fleetDate`, context);
  assert.equal(context.fleetDate({ vehicleId: 'v1', type: 'MOT', currentDueDate: '2026-04-20' }), '2027-04-20');
});

test('date arithmetic clamps month ends and leap days', () => {
  const source = extractFunction('fleetAddMonthsFromDue');
  const context = {};
  vm.runInNewContext(`${source};this.add=fleetAddMonthsFromDue`, context);
  assert.equal(context.add('2024-02-29', 12), '2025-02-28');
  assert.equal(context.add('2026-08-31', 6), '2027-02-28');
  assert.equal(context.add('2026-01-31', 1), '2026-02-28');
});

test('the final runtime completion filter preserves manual dates and rejects current-month imports', () => {
  const scriptStart = html.indexOf('<script id="v212-fleet-safety-service-anchor-rule">');
  const functionStart = html.indexOf('window.fleetPlanCompletedForCurrentCycle=function(p)', scriptStart);
  const functionEnd = html.indexOf('\n  };', functionStart);
  assert.ok(functionStart > scriptStart && functionEnd > functionStart);
  const assignment = html.slice(functionStart, functionEnd + 5);
  const base = { window: null, todayIso: () => '2026-09-15', fleetVehicles: [{ id: 'v1', registration: 'TCS T2' }], app: { jobs: [] }, fleetDate: p => p.currentDueDate || '2026-09-01', fleetMaintenanceCategory: () => 'service', fleetLatestCompletedEvidenceDate: () => '', fleetCompletedJobForPlanCycle: () => null, fleetSafetyCompletionMatchesCycle: () => false, fleetAddMonthsFromDue: () => '2027-09-01' };
  base.window = base;
  vm.runInNewContext(assignment, base);
  base.fleetCompletions = [{ vehicleId: 'v1', type: 'Annual Service', completedMonth: '2026-09', datePrecision: 'month' }];
  assert.equal(base.fleetPlanCompletedForCurrentCycle({ id: 'p1', vehicleId: 'v1', type: 'Annual Service', currentDueDate: '2026-09-01' }), false);
  assert.equal(base.fleetPlanCompletedForCurrentCycle({ id: 'p1', vehicleId: 'v1', type: 'Annual Service', currentDueDate: '2026-09-01', manualDueDate: true }), false);
  base.todayIso = () => '2026-10-01';
  base.fleetAddMonthsFromDue = () => '2027-09-30';
  assert.equal(base.fleetPlanCompletedForCurrentCycle({ id: 'p1', vehicleId: 'v1', type: 'Annual Service', currentDueDate: '2026-09-01' }), true);
});

test('startup cloud hydration happens before every startup Fleet-writing import', () => {
  const dashboard = html.indexOf('await vectaPrimeAuthoritativeDashboard();');
  const initEnd = html.indexOf('\n})();', dashboard);
  const connectedStartup = html.slice(dashboard, initEnd);
  const fleetPull = connectedStartup.indexOf('await pullFleetCloudState();');
  assert.ok(fleetPull >= 0);
  for (const call of ['importContractor2026Spreadsheet();', 'fleetImportHistoricalSeed();']) {
    const at = connectedStartup.indexOf(call);
    if (at >= 0) assert.ok(at > fleetPull, `${call} must run after Fleet hydration`);
  }
});
