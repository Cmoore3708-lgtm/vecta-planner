import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
// Exercise the closure-owned functions used by saveJob/updateJobQuick and Fleet,
// not the later window overrides, which cannot replace those lexical bindings.
function core(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, name);
  const lineEnd = html.indexOf('\n', start);
  const end = html.slice(start, lineEnd).endsWith('}') ? lineEnd : html.indexOf('\n}', start) + 2;
  return html.slice(start, end);
}
function setup({ group = 'Nissan Internal', status = 'completed', due = '2026-11-01', date = '2026-10-30' } = {}) {
  const vehicle = { id: 'INTERNAL|NMDR2', registration: 'NMDR 2', fleetGroup: group };
  const plan = { id: 'plan-211', vehicleId: vehicle.id, type: 'Internal Service', status: 'Active', currentDueDate: due, manualDueDate: true };
  const job = { id: 'nmdr-service', registration: 'NMDR2', job_type: 'On-Site Service', work_required: 'On-Site Service', status, archived: status === 'completed', completed_at: status === 'completed' ? `${date}T14:05:05Z` : null, booking_date: '2026-11-03' };
  const ctx = { window: {}, app: { jobs: [job], serviceRecords: [] }, fleetVehicles: [vehicle], fleetPlans: [plan], fleetCompletions: [],
    todayIso: () => '2026-11-04', fleetDate: p => p.currentDueDate || '',
    fleetIsMaintenanceRemoved: () => false, jobTypeValues: j => [j.job_type], isVehicleTaxJob: () => false,
    currentServiceTypeForJob: () => 'Full Service', alternateServiceType: () => 'Full Service', serviceTypeFromValue: text => /service/i.test(text) ? 'Service' : '',
    serviceSheetDate: d => d, saveFleet: () => { ctx.saved = (ctx.saved || 0) + 1; },
    fleetVehicleForRegistration: reg => ctx.normReg(reg) === ctx.normReg(vehicle.registration) ? vehicle : null,
    fleetPlanMatching: id => ctx.fleetPlans.find(p => p.vehicleId === id),
    fleetAddMonthsFromDue: (date, months) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-fleet-rules.js', import.meta.url), 'utf8'), ctx);
  for (const name of ['normReg', 'isSixMonthSafetyCheck', 'isOnSiteService', 'completedJobCanUpdateFleet', 'completedJobDateForFleet', 'fleetMaintenanceCategory', 'fleetPlannerJobCategories', 'fleetPlannerJobTypeKeyMatches', 'fleetPlannerJobsForVehicle', 'fleetBookedPlannerJob', 'fleetLatestCompletedEvidenceDate', 'fleetServiceCompletionMatchesCycle', 'fleetCompletedJobForPlanCycle', 'fleetPlanCompletedForCurrentCycle', 'syncFleetServiceScheduleFromJob', 'syncFleetMaintenanceFromJob', 'syncFleetMotScheduleFromJob', 'isActualCompletedMotJob', 'reconcileFleetMaintenanceFromCompletedJobs', 'reconcileLatestCompletedServiceAuthority']) vm.runInContext(core(name), ctx);
  return { ctx, job, plan, vehicle };
}

test('live completion route advances NMDR 2 and records the service once', () => {
  const { ctx, job, plan } = setup();
  assert.equal(ctx.syncFleetMaintenanceFromJob(job), true);
  assert.equal(plan.currentDueDate, '2027-10-30');
  assert.equal(plan.manualDueDate, false);
  assert.equal(ctx.fleetPlans.length, 1, 'Internal vehicles do not acquire a safety plan');
  assert.equal(ctx.fleetCompletions[0].completedDate, '2026-10-30', 'completion date wins over rescheduled diary date');
  assert.equal(ctx.fleetCompletions[0].planId, plan.id);
  assert.equal(ctx.fleetCompletions[0].nextSafetyDue, '');
  assert.doesNotMatch(ctx.fleetCompletions[0].notes, /safety check due/i);
  ctx.syncFleetMaintenanceFromJob(job);
  assert.equal(ctx.fleetCompletions.length, 1);
});

test('live Fleet filter clears a recent Internal service despite an old manual due date', () => {
  const { ctx, plan } = setup();
  assert.equal(ctx.fleetPlanCompletedForCurrentCycle(plan), true);
});

test('old service history cannot clear a new manual annual cycle', () => {
  const { ctx, plan } = setup({ date: '2026-01-09' });
  assert.equal(ctx.fleetPlanCompletedForCurrentCycle(plan), false);
});

test('a future confirmed or provisional booking keeps the manual cycle outstanding', () => {
  for (const status of ['booked', 'provisional']) {
    const { ctx, plan, job } = setup();
    ctx.app.jobs.push({ ...job, id: 'next-service', status, archived: false, completed_at: null, booking_date: '2026-11-10' });
    assert.equal(ctx.fleetPlanCompletedForCurrentCycle(plan), false);
  }
});

test('provisional and uncompleted services do not change Fleet dates', () => {
  for (const status of ['provisional', 'booked', 'work_complete']) {
    const { ctx, job, plan } = setup({ status });
    assert.equal(ctx.syncFleetMaintenanceFromJob(job), false);
    assert.equal(plan.currentDueDate, '2026-11-01');
    assert.equal(ctx.fleetCompletions.length, 0);
  }
});

test('non-internal On-Site Service and six-month checks do not advance annual service', () => {
  const other = setup({ group: 'Nissan Pool Cars' });
  assert.equal(other.ctx.syncFleetMaintenanceFromJob(other.job), false);
  assert.equal(other.plan.currentDueDate, '2026-11-01');
  const safety = setup();
  safety.job.job_type = safety.job.work_required = '6 Month Safety Check';
  assert.equal(safety.ctx.syncFleetMaintenanceFromJob(safety.job), false);
  assert.equal(safety.plan.currentDueDate, '2026-11-01');
});

test('a genuinely later manual due date is preserved', () => {
  const { ctx, job, plan } = setup({ due: '2027-12-01' });
  ctx.syncFleetMaintenanceFromJob(job);
  assert.equal(plan.currentDueDate, '2027-12-01');
  assert.equal(plan.manualDueDate, true);
});

test('explicit completed-job reconciliation includes Internal On-Site Services', () => {
  for (const name of ['reconcileFleetMaintenanceFromCompletedJobs', 'reconcileLatestCompletedServiceAuthority']) {
    const { ctx, plan } = setup();
    assert.equal(ctx[name](), 1);
    assert.equal(plan.currentDueDate, '2027-10-30');
  }
});
