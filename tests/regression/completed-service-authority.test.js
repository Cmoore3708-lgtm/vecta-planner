import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadRepair(state) {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script id="v332-completed-service-authority">([\s\S]*?)<\/script>/);
  assert.ok(match, 'V332 completed-service authority script exists');
  const context = {
    ...state,
    window: null,
    console,
    setTimeout() {},
    render() {},
    fleetAddMonthsFromDue(date, months) {
      const d = new Date(`${date}T00:00:00Z`);
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + months);
      d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
      return d.toISOString().slice(0, 10);
    },
    fleetMaintenanceCategory(type) {
      return /service/i.test(String(type)) && !/safety/i.test(String(type)) ? 'service' : /safety/i.test(String(type)) ? 'safety' : '';
    },
    fleetPlannerJobCategories(job) {
      return { service: /service|oil\s*(?:&|and)\s*filter/i.test([job.job_type, job.work_required].join(' ')) };
    },
    isSixMonthSafetyCheck(job) { return /six|6 month|safety/i.test([job.job_type, job.work_required].join(' ')); },
    fleetIsMaintenanceRemoved() { return false; },
    vectaJobIsDeletedForLists(job) { return job.status === 'deleted'; },
    serviceRecordKind(record) { return record.sheet_type; },
    saveFleet() { context.saved = (context.saved || 0) + 1; }
  };
  context.window = context;
  vm.runInNewContext(match[1], context);
  return context;
}

test('completed On-Site Service moves an internal vehicle to its next annual cycle', () => {
  const state = loadRepair({
    app: { jobs: [{ id: 'axle-service', registration: 'AXLE 1', job_type: 'On-Site Service', status: 'completed', booking_date: '2026-09-08' }], serviceRecords: [] },
    fleetVehicles: [{ id: 'axle', registration: 'AXLE 1', fleetGroup: 'Nissan Internal' }],
    fleetPlans: [{ id: 'axle-plan', vehicleId: 'axle', type: 'Internal Service', status: 'Active', currentDueDate: '2026-09-01', manualDueDate: true }]
  });
  const audit = state.v332RepairCompletedServices();
  assert.equal(audit.changed, 1);
  assert.equal(state.fleetPlans[0].currentDueDate, '2027-09-08');
  assert.equal(state.fleetPlans[0].manualDueDate, false);
});

test('saved service paperwork repairs a due cycle after the cloud paperwork arrives', () => {
  const state = loadRepair({
    app: {
      jobs: [{ id: 'paper-job', registration: 'KX18 EYC', job_type: 'On-Site Service', status: 'work_complete', booking_date: '2026-09-09' }],
      serviceRecords: [{ id: 'onsite:KX18EYC:paper-job', job_id: 'paper-job', registration: 'KX18 EYC', sheet_type: 'onsite', saved_at: '2026-09-10T12:00:00Z' }]
    },
    fleetVehicles: [{ id: 'eyc', registration: 'KX18 EYC' }],
    fleetPlans: [{ id: 'eyc-plan', vehicleId: 'eyc', type: 'Annual Service', status: 'Active', currentDueDate: '2026-09-01' }]
  });
  state.v332RepairCompletedServices();
  assert.equal(state.fleetPlans[0].currentDueDate, '2027-09-09');
});

test('safety paperwork and deleted jobs cannot falsely clear an annual service', () => {
  const state = loadRepair({
    app: {
      jobs: [{ id: 'deleted', registration: 'TEST 1', job_type: 'Major Service', status: 'deleted', booking_date: '2026-09-09' }],
      serviceRecords: [{ id: 'safety', registration: 'TEST 1', sheet_type: 'safety', saved_at: '2026-09-09' }]
    },
    fleetVehicles: [{ id: 'test', registration: 'TEST 1' }],
    fleetPlans: [{ id: 'test-plan', vehicleId: 'test', type: 'Annual Service', status: 'Active', currentDueDate: '2026-09-01' }]
  });
  const audit = state.v332RepairCompletedServices();
  assert.equal(audit.changed, 0);
  assert.equal(state.fleetPlans[0].currentDueDate, '2026-09-01');
});

test('repair does not invent a maintenance plan where none is active', () => {
  const state = loadRepair({
    app: { jobs: [{ id: 'done', registration: 'NO PLAN', job_type: 'Major Service', status: 'completed', booking_date: '2026-09-09' }], serviceRecords: [] },
    fleetVehicles: [{ id: 'none', registration: 'NO PLAN' }],
    fleetPlans: []
  });
  state.v332RepairCompletedServices();
  assert.equal(state.fleetPlans.length, 0);
});

test('a genuinely later manual service date is preserved', () => {
  const state = loadRepair({
    app: { jobs: [{ id: 'done', registration: 'LATER 1', job_type: 'Major Service', status: 'completed', booking_date: '2026-09-09' }], serviceRecords: [] },
    fleetVehicles: [{ id: 'later', registration: 'LATER 1' }],
    fleetPlans: [{ id: 'later-plan', vehicleId: 'later', type: 'Annual Service', status: 'Active', currentDueDate: '2027-10-01', manualDueDate: true }]
  });
  const audit = state.v332RepairCompletedServices();
  assert.equal(audit.changed, 0);
  assert.equal(state.fleetPlans[0].currentDueDate, '2027-10-01');
  assert.equal(state.fleetPlans[0].manualDueDate, true);
});

test('an old safety check cannot clear EYC current six-month cycle', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const match = html.match(/function fleetSafetyCompletionMatchesCycle\(completed,due,cycle\)\{[\s\S]*?\n\}/);
  assert.ok(match, 'safety-cycle date guard exists');
  const context = {};
  vm.runInNewContext(`${match[0]};this.check=fleetSafetyCompletionMatchesCycle;`, context);

  assert.equal(context.check('2026-04-22', '2026-09-11', '2026-09-11'), false,
    'EYC April check must not clear its September due cycle');
  assert.equal(context.check('2026-09-01', '2026-09-11', '2026-09-11'), true,
    'a check completed within the correct cycle window clears it');
  assert.equal(context.check('2026-09-01', '2027-03-11', '2026-09-11'), false,
    'a completion attached to a different cycle cannot clear the next one');
});

test('EYC six-month due date remains anchored to its service, not its MOT', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const match = html.match(/function fleetMayAlignPlanToMot\(plan\)\{[\s\S]*?\n\}/);
  assert.ok(match, 'MOT-alignment eligibility function exists');
  const context = {};
  vm.runInNewContext(`${match[0]};this.mayAlign=fleetMayAlignPlanToMot;`, context);

  assert.equal(context.mayAlign({ type: 'Six-month Safety Check' }), false);
  assert.equal(context.mayAlign({ type: '6 Month Safety Check' }), false);
  assert.equal(context.mayAlign({ type: 'Annual Service' }), true);
});

test('phone shell versions force the V334 repair to replace V331', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.match(html, /VECTA_APP_VERSION='v334-safety-cycle-cache-refresh'/);
  assert.match(html, /service-worker\.js\?v=20260911-safety-cycle-cache-refresh-v334/);
  assert.match(worker, /APP_VERSION='v334-safety-cycle-cache-refresh'/);
  assert.match(worker, /CACHE='vecta-workshop-pro-shell-v19-safety-cycle-refresh'/);
});
