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

test('a stale blank safety date is rebuilt from durable completed-service evidence', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script id="v212-fleet-safety-service-anchor-rule">([\s\S]*?)<\/script>/);
  assert.ok(match, 'safety service-anchor repair exists');
  const context = {
    window: null, console, setTimeout() {}, todayIso: () => '2026-09-11',
    app: { jobs: [] },
    fleetVehicles: [{id:'POOL|KX18EYC', registration:'KX18 EYC', fleetGroup:'Nissan Pool Cars'}],
    fleetPlans: [{id:'plan-321', vehicleId:'POOL|KX18EYC', type:'Six-month Safety Check', status:'Active', currentDueDate:'', targetMonth:3}],
    fleetCompletions: [{id:'service', vehicleId:'POOL|KX18EYC', type:'Full Service', completedDate:'2026-03-11'}],
    fleetMaintenanceCategory: type => /safety/i.test(String(type)) ? 'safety' : /service/i.test(String(type)) ? 'service' : '',
    fleetIsMaintenanceRemoved: () => false,
    fleetPlanMatching(id, category) { return context.fleetPlans.find(p => p.vehicleId === id && context.fleetMaintenanceCategory(p.type) === category); },
    fleetAddMonthsFromDue(date, months) { const d=new Date(`${date}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+months);return d.toISOString().slice(0,10); },
    saveFleet() {}
  };
  context.window = context;
  vm.runInNewContext(match[1], context);
  context.v212AnchorSafetyToLatestService(context.fleetVehicles[0], false);
  assert.equal(context.fleetPlans[0].currentDueDate, '2026-09-11');
  assert.equal(context.fleetPlans[0].targetMonth, null);
});

test('embedded service history repairs EYC before live jobs finish loading', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script id="v212-fleet-safety-service-anchor-rule">([\s\S]*?)<\/script>/);
  const context = {
    window:null, console, setTimeout(){}, todayIso:()=> '2026-09-11', app:{jobs:[]}, fleetCompletions:[],
    fleetVehicles:[{id:'POOL|KX18EYC',registration:'KX18 EYC',fleetGroup:'Nissan Pool Cars'}],
    fleetPlans:[{id:'plan-321',vehicleId:'POOL|KX18EYC',type:'Six-month Safety Check',status:'Active',currentDueDate:'',targetMonth:3}],
    completedJobCanUpdateFleet:j=>j.status==='completed'||j.archived===true,
    isSixMonthSafetyCheck:j=>/safety/i.test(`${j.job_type} ${j.work_required}`), isOnSiteService:()=>false,
    fleetPlannerJobCategories:j=>({service:/service/i.test(`${j.job_type} ${j.work_required}`)}),
    fleetMaintenanceCategory:t=>/safety/i.test(String(t))?'safety':/service/i.test(String(t))?'service':'',
    fleetIsMaintenanceRemoved:()=>false,
    fleetPlanMatching(id,cat){return context.fleetPlans.find(p=>p.vehicleId===id&&context.fleetMaintenanceCategory(p.type)===cat);},
    fleetDate:p=>p.currentDueDate||'',
    fleetAddMonthsFromDue(date,months){const d=new Date(`${date}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+months);return d.toISOString().slice(0,10);},
    saveFleet(){}
  };
  context.window=context;
  context.NMUK_2026_JOBS=[{id:'nmuk-2026-march-10',registration:'KX18 EYC',job_type:'Full Service',work_required:'POOL CAR SERVICE',status:'completed',archived:true,completed_at:'2026-03-11T17:00:00.000Z'}];
  vm.runInNewContext(match[1],context);
  assert.equal(context.v212RepairSafetyServiceAnchors(),1);
  assert.equal(context.fleetPlans[0].currentDueDate,'2026-09-11');
});

test('phone shell versions force the single-update startup', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.match(html, /VECTA_APP_VERSION='v355-single-update'/);
  assert.match(html, /service-worker\.js\?v=20260912-single-update-v355/);
  assert.match(worker, /APP_VERSION='v355-single-update'/);
  assert.match(worker, /CACHE='vecta-workshop-pro-shell-v40-single-update'/);
});

test('service-worker update has one guarded reload owner', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.equal((html.match(/addEventListener\('controllerchange'/g) || []).length, 1);
  assert.equal((html.match(/serviceWorker\.register\(/g) || []).length, 1);
  assert.doesNotMatch(worker, /vecta_update/);
});

test('MOT control observer cannot lock the document', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /new MutationObserver\(function\(\)\{v264LockMotControls\(document\);\}\)/);
  assert.doesNotMatch(html, /v264LockObserver/);
});

test('phone startup does not repeatedly scan every vehicle against job history', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\[0,2500,8000,15000\]\.forEach\(function\(ms\)\{setTimeout\(repair,ms\);\}\)/);
  assert.doesNotMatch(worker, /vecta-sw-fleet-startup-reconcile/);
});

test('legacy Fleet repairs cannot repeatedly rebuild the dashboard during startup', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /reconcileFleetMaintenanceFromCompletedJobs\(\);render\(\)/);
  assert.doesNotMatch(html, /setTimeout\(function\(\)\{try\{var n=repair\(\);if\(n&&typeof render/);
  assert.doesNotMatch(html, /setTimeout\(function\(\)\{var n=repairCompletedServicePlansFromVisibleHistory/);
});

test('legacy repairs cannot wrap cloud loading or Fleet navigation', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /applyFleetCloudSnapshot\.__v309Wrapped/);
  assert.doesNotMatch(html, /applyFleetCloudSnapshot\.__v278MainSec/);
  assert.doesNotMatch(html, /applyFleetCloudSnapshot\.__v310Wrapped/);
  assert.doesNotMatch(html, /pullRemote\.__v332CompletedService/);
  assert.doesNotMatch(html, /pullFleetCloudState\.__v207Wrapped/);
  assert.doesNotMatch(html, /fleetBind\.__v207Wrapped/);
  assert.doesNotMatch(html, /pullFleetCloudState\.__v212SafetyWrapped/);
  assert.doesNotMatch(html, /fleetBind\.__v212SafetyWrapped/);
  assert.doesNotMatch(html, /pullFleetCloudState\.__v213TaxWrapped/);
  assert.doesNotMatch(html, /fleetBind\.__v213TaxWrapped/);
  assert.doesNotMatch(html, /setTimeout\(repairCompletedHistory,/);
  assert.doesNotMatch(html, /setTimeout\(repairTaxDue,/);
  assert.doesNotMatch(html, /setTimeout\(v277Run,/);
  assert.doesNotMatch(html, /pullFleetCloudState\.__serviceAuthorityWrapped/);
  assert.doesNotMatch(html, /pullFleetCloudState\.__allEvidenceServiceWrapped/);
  assert.doesNotMatch(html, /setTimeout\(applyVehicleAllocationSpreadsheetCorrections,/);
  assert.doesNotMatch(html, /setTimeout\(async function\(\)\{ensureThreeMechanics/);
  assert.doesNotMatch(html, /render\.__v264MotLocked/);
});

test('reconnect performs one guarded foreground dashboard refresh', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/addEventListener\('online'/g) || []).length, 1);
  assert.match(html, /addEventListener\('online',[\s\S]{0,300}refreshPlannerCoreFromCloudAndRender\(\)/);
  assert.doesNotMatch(html, /await vectaPrimeJobsFromCloud\(\);await vectaLoadTerminalJobStatesFromCloud\(\);vectaApplyTerminalJobStates\(\);await flushPendingSync\(\);await vectaPrimeJobsFromCloud\(\)/);
});

test('Online status waits for the authoritative dashboard download', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /vectaCloudReachable=null;updateConnectivityUI\('syncing'\);[\s\S]{0,500}await vectaPrimeAuthoritativeDashboard\(\)/);
  assert.doesNotMatch(html, /vectaCloudReachable=true;updateConnectivityUI\('syncing'\);[\s\S]{0,500}await vectaPrimeAuthoritativeDashboard\(\)/);
});
