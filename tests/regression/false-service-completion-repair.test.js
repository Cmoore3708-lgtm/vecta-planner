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
const baselineStart = html.indexOf('function fleetMigratePreJuly2026Overdues(){');
const baselineEnd = html.indexOf('\n/* V41.28:', baselineStart);
const baselineSource = html.slice(baselineStart, baselineEnd);

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

test('the complete isolated Test Fleet renders no legacy 2022 due dates', () => {
  const state = load({
    fleetVehicles: structuredClone(initialVehicles),
    fleetPlans: structuredClone(initialPlans),
    fleetCompletions: [],
    HISTORICAL_COMPLETION_SEED: structuredClone(historicalSchedule),
    fleetMotAuthority: {},
    normReg: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    dvsaIsoDate: value => String(value || '').slice(0, 10)
  });
  state.v359RepairFalseServiceCompletions();
  const fleetDateSource = html.slice(html.indexOf('function fleetDate('), html.indexOf('\nfunction fleetTone(', html.indexOf('function fleetDate(')));
  vm.runInNewContext(`${fleetDateSource};this.fleetDate=fleetDate`, state);
  const displayed2022 = state.fleetPlans
    .filter(plan => String(plan.status || 'Active') === 'Active')
    .map(plan => ({ id: plan.id, due: state.fleetDate(plan) }))
    .filter(row => row.due.startsWith('2022-'));
  assert.deepEqual(displayed2022, []);
  const lsVehicle = state.fleetVehicles.find(vehicle => vehicle.registration === 'LS64 VKM');
  const lsService = state.fleetPlans.find(plan => plan.vehicleId === lsVehicle.id && /service/i.test(plan.type) && plan.status === 'Active');
  assert.equal(state.fleetDate(lsService), '2026-08-30');
});

test('the complete Test Fleet has no active stored or displayed due date before the July 2026 baseline', () => {
  const state = load({
    fleetVehicles: structuredClone(initialVehicles),
    fleetPlans: structuredClone(initialPlans),
    fleetCompletions: [],
    HISTORICAL_COMPLETION_SEED: structuredClone(historicalSchedule),
    localStorage: { setItem() {} },
    fleetMotAuthority: {},
    normReg: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    dvsaIsoDate: value => String(value || '').slice(0, 10)
  });
  vm.runInNewContext(`${baselineSource};this.runBaseline=fleetMigratePreJuly2026Overdues;`, state);
  const baselineAudit = state.runBaseline();
  state.v359RepairFalseServiceCompletions();
  const fleetDateSource = html.slice(html.indexOf('function fleetDate('), html.indexOf('\nfunction fleetTone(', html.indexOf('function fleetDate(')));
  vm.runInNewContext(`${fleetDateSource};this.fleetDate=fleetDate`, state);
  const active = state.fleetPlans.filter(plan => String(plan.status || 'Active') === 'Active');
  assert.ok(baselineAudit.advanced > 0);
  assert.deepEqual(active.filter(plan => /^\d{4}-\d{2}-\d{2}$/.test(plan.currentDueDate) && plan.currentDueDate < '2026-07-01').map(plan => plan.id), []);
  assert.deepEqual(active.filter(plan => state.fleetDate(plan) && state.fleetDate(plan) < '2026-07-01').map(plan => plan.id), []);
  const lsVehicle = state.fleetVehicles.find(vehicle => vehicle.registration === 'LS64 VKM');
  const lsService = active.find(plan => plan.vehicleId === lsVehicle.id && /service/i.test(plan.type));
  assert.equal(state.fleetDate(lsService), '2026-08-30');
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

test('pre-July system baseline completes each historical cycle on its due date', () => {
  assert.ok(baselineStart > -1 && baselineEnd > baselineStart);
  const context = {
    fleetPlans: [
      { id: 'annual', vehicleId: 'v1', type: 'Annual Service', status: 'Active', intervalMonths: 12, currentDueDate: '2025-02-28' },
      { id: 'safety', vehicleId: 'v2', type: 'Six-month Safety Check', status: 'Active', intervalMonths: 6, currentDueDate: '2025-10-31' },
      { id: 'ls', vehicleId: 'v3', type: 'Annual Service', status: 'Active', intervalMonths: 12, currentDueDate: '2026-08-30' }
    ],
    fleetCompletions: [],
    localStorage: { setItem() {} }
  };
  vm.runInNewContext(`${baselineSource};this.run=fleetMigratePreJuly2026Overdues;`, context);
  const audit = context.run();
  assert.equal(audit.changed, true);
  assert.equal(audit.advanced, 2);
  assert.equal(context.fleetPlans[0].currentDueDate, '2027-02-28');
  assert.equal(context.fleetPlans[1].currentDueDate, '2026-10-31');
  assert.equal(context.fleetPlans[2].currentDueDate, '2026-08-30');
  assert.deepEqual(Array.from(context.fleetCompletions, row => row.completedDate), ['2025-02-28', '2026-02-28', '2025-10-31', '2026-04-30']);
  assert.ok(context.fleetCompletions.every(row => row.source === 'pre-july-2026-system-baseline'));
  const count = context.fleetCompletions.length;
  const second = context.run();
  assert.equal(second.changed, false);
  assert.equal(context.fleetCompletions.length, count);
});

test('the baseline migration is applied at every data-ingress boundary', () => {
  const coordinator = html.slice(html.indexOf('function vectaRunDataIngressMigrations('), html.indexOf('\nfunction calculatedPartsStatus(', html.indexOf('function vectaRunDataIngressMigrations(')));
  assert.match(coordinator, /fleetMigratePreJuly2026Overdues\(\)/);
  assert.match(coordinator, /preJulyChanged/);
  assert.ok(coordinator.indexOf('fleetMigratePreJuly2026Overdues()') > coordinator.indexOf("\n  }\n  try{var preJulyAudit="));
});
