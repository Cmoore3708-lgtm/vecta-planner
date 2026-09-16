import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="v359-false-service-completion-repair">([\s\S]*?)<\/script>/);
assert.ok(match, 'V359 false-completion repair exists');
const initialVehicles = JSON.parse(html.match(/window\.INITIAL_FLEET_VEHICLES = (\[[^\n]+\]);/)[1]);
const initialPlans = JSON.parse(html.match(/window\.INITIAL_MAINTENANCE_PLANS = (\[[\s\S]*?\n\]);/)[1]);
const historicalSchedule = JSON.parse(html.match(/var HISTORICAL_COMPLETION_SEED=(\[[^\n]+\]);/)[1]);

function load(overrides = {}) {
  const context = {
    window: null,
    console,
    todayIso: () => '2026-09-16',
    app: { jobs: [], serviceRecords: [] },
    fleetVehicles: [],
    fleetPlans: [],
    fleetCompletions: [],
    HISTORICAL_COMPLETION_SEED: [],
    fleetMaintenanceCategory: type => /service/i.test(String(type)) ? 'service' : '',
    fleetAddMonthsFromDue(date, months) {
      const d = new Date(`${date}T00:00:00Z`);
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + months);
      d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
      return d.toISOString().slice(0, 10);
    },
    isSixMonthSafetyCheck: () => false,
    vectaJobIsDeletedForLists: job => job.status === 'deleted',
    saveFleet() { context.saved = (context.saved || 0) + 1; },
    ...overrides
  };
  context.window = context;
  vm.runInNewContext(match[1], context);
  return context;
}

test('LS64 VKM is restored to its overdue schedule when no service was completed', () => {
  const state = load({
    fleetVehicles: [{ id: 'ls', registration: 'LS64 VKM' }],
    fleetPlans: [{ id: 'p-ls', vehicleId: 'ls', type: 'Major Service', status: 'Active', currentDueDate: '2027-08-30' }],
    fleetCompletions: [
      { id: 'schedule', vehicleId: 'ls', type: 'Annual Service', completedDate: '2026-08-30', source: 'historical/imported/photograph' },
      { id: 'false', vehicleId: 'ls', planId: 'p-ls', type: 'Annual Service', completedDate: '2022-08-30', source: 'pre-july-2026-auto-complete' }
    ],
    HISTORICAL_COMPLETION_SEED: [{ key: 'LS64 VKM', type: 'Annual Service', date: '2026-08-30', datePrecision: 'day' }]
  });
  const audit = state.v359RepairFalseServiceCompletions();
  assert.equal(audit.changed, 1);
  assert.equal(state.fleetPlans[0].currentDueDate, '2026-08-30');
  assert.deepEqual(Array.from(audit.restored, row => row.registration), ['LS64 VKM']);
  assert.equal(state.fleetCompletions.some(c => c.source === 'pre-july-2026-auto-complete'), false);
});

test('an isolated Test browser repairs the embedded 2022 plan without a fabricated completion record', () => {
  const state = load({
    fleetVehicles: [{ id: 'ls', registration: 'LS64 VKM' }],
    fleetPlans: [{ id: 'p-ls', vehicleId: 'ls', type: 'Major Service', status: 'Active', currentDueDate: '2022-08-30' }],
    fleetCompletions: [],
    HISTORICAL_COMPLETION_SEED: [{ key: 'LS64 VKM', type: 'Annual Service', date: '2026-08-30', datePrecision: 'day' }]
  });
  const audit = state.v359RepairFalseServiceCompletions();
  assert.equal(audit.changed, 1);
  assert.equal(state.fleetPlans[0].currentDueDate, '2026-08-30');
});

test('offline startup repairs service cycles before rendering the fallback Fleet', () => {
  assert.match(html, /if\(!navigator\.onLine\|\|!configured\)\{[\s\S]*?importContractor2026Spreadsheet\(\);ensureServiceTemplates\(\);ensureRecurringWorkshopTasks\(\);[\s\S]*?v359RepairFalseServiceCompletions\(\);[\s\S]*?render\(\)/);
});

test('startup repairs stale service cycles before the first visible render', () => {
  const source = html.match(/function init\(\)\{safe\(async function\(\)\{([\s\S]*?)\n\},null\)\}/)[1];
  const repair = source.indexOf('v359RepairFalseServiceCompletions();');
  const firstRender = source.indexOf('\n  render();');
  const cloudConfig = source.indexOf('loadCloudConfig');
  assert.ok(repair > -1, 'startup must run the current-cycle repair');
  assert.ok(repair < firstRender, 'service dates must be repaired before the first render');
  assert.ok(repair < cloudConfig, 'repair must not depend on cloud configuration');
});

test('the complete isolated Test Fleet exposes no service plan older than its current schedule', () => {
  const state = load({
    fleetVehicles: structuredClone(initialVehicles),
    fleetPlans: structuredClone(initialPlans),
    fleetCompletions: [],
    HISTORICAL_COMPLETION_SEED: structuredClone(historicalSchedule)
  });
  state.v359RepairFalseServiceCompletions();
  const scheduled = new Map(historicalSchedule
    .filter(row => /service/i.test(String(row.type || '')) && row.date)
    .map(row => [String(row.key).toUpperCase().replace(/[^A-Z0-9]/g, ''), row.date]));
  const registrations = new Map(initialVehicles.map(vehicle => [vehicle.id, String(vehicle.registration).toUpperCase().replace(/[^A-Z0-9]/g, '')]));
  const stale = state.fleetPlans.filter(plan => {
    if (!/service/i.test(String(plan.type || '')) || plan.status === 'Paused' || plan.manualDueDate) return false;
    const due = scheduled.get(registrations.get(plan.vehicleId));
    return due && plan.currentDueDate && plan.currentDueDate < due;
  });
  assert.deepEqual(stale.map(plan => ({ id: plan.id, due: plan.currentDueDate })), []);
});

test('a genuine completed service advances the schedule instead of reappearing overdue', () => {
  const state = load({
    app: { jobs: [{ id: 'done', registration: 'NG69 LLJ', job_type: 'Interim Service', status: 'completed', booking_date: '2026-07-20' }], serviceRecords: [] },
    fleetVehicles: [{ id: 'ng', registration: 'NG69 LLJ' }],
    fleetPlans: [{ id: 'p-ng', vehicleId: 'ng', type: 'Major Service', status: 'Active', currentDueDate: '2027-02-12' }],
    fleetCompletions: [{ id: 'false', vehicleId: 'ng', type: 'Annual Service', completedDate: '2025-02-12', source: 'pre-july-2026-auto-complete' }],
    HISTORICAL_COMPLETION_SEED: [{ key: 'NG69 LLJ', type: 'Annual Service', date: '2026-08-24', datePrecision: 'day' }]
  });
  const audit = state.v359RepairFalseServiceCompletions();
  assert.equal(audit.changed, 1);
  assert.equal(state.fleetPlans[0].currentDueDate, '2027-07-20');
  assert.deepEqual(Array.from(audit.completed, row => row.registration), ['NG69 LLJ']);
});

test('unrelated old service evidence cannot clear the current due cycle', () => {
  const state = load({
    app: { jobs: [{ id: 'old', registration: 'NK70 XLD', job_type: 'Full Service', status: 'completed', booking_date: '2026-01-15' }], serviceRecords: [] },
    fleetVehicles: [{ id: 'xld', registration: 'NK70 XLD' }],
    fleetPlans: [{ id: 'p-xld', vehicleId: 'xld', type: 'Major Service', status: 'Active', currentDueDate: '2026-09-28' }],
    fleetCompletions: [{ id: 'false', vehicleId: 'xld', type: 'Annual Service', completedDate: '2024-09-28', source: 'pre-july-2026-auto-complete' }],
    HISTORICAL_COMPLETION_SEED: [{ key: 'NK70 XLD', type: 'Annual Service', date: '2026-08-29', datePrecision: 'day' }]
  });
  state.v359RepairFalseServiceCompletions();
  assert.equal(state.fleetPlans[0].currentDueDate, '2026-08-29');
});

test('manual service dates are never rewritten', () => {
  const state = load({
    fleetVehicles: [{ id: 'manual', registration: 'MANUAL 1' }],
    fleetPlans: [{ id: 'p-manual', vehicleId: 'manual', type: 'Major Service', status: 'Active', currentDueDate: '2027-01-01', manualDueDate: true }],
    fleetCompletions: [{ id: 'false', vehicleId: 'manual', type: 'Annual Service', completedDate: '2024-01-01', source: 'pre-july-2026-auto-complete' }],
    HISTORICAL_COMPLETION_SEED: [{ key: 'MANUAL 1', type: 'Annual Service', date: '2026-08-01', datePrecision: 'day' }]
  });
  const audit = state.v359RepairFalseServiceCompletions();
  assert.equal(audit.changed, 0);
  assert.equal(state.fleetPlans[0].currentDueDate, '2027-01-01');
});

test('legacy migration can no longer invent completion records', () => {
  const functionMatch = html.match(/function fleetMigratePreJuly2026Overdues\(\)\{[\s\S]*?\n\}/);
  assert.ok(functionMatch);
  const context = {};
  vm.runInNewContext(`${functionMatch[0]};this.run=fleetMigratePreJuly2026Overdues;`, context);
  assert.equal(context.run(), false);
  assert.doesNotMatch(functionMatch[0], /fleetCompletions\.push/);
});
