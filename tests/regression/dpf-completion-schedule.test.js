import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
function core(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, name);
  const lineEnd = html.indexOf('\n', start);
  const end = html.slice(start, lineEnd).endsWith('}') ? lineEnd : html.indexOf('\n}', start) + 2;
  return html.slice(start, end);
}
function setup() {
  const vehicle = { id: 'INTERNAL|UPUK3', registration: 'UPUK 3', fleetGroup: 'Nissan Internal' };
  const dpf = { id: 'plan-dpf-upuk3', vehicleId: vehicle.id, type: 'DPF regeneration', status: 'Active', currentDueDate: '2026-11-16', intervalMonths: 4 };
  const service = { id: 'plan-274', vehicleId: vehicle.id, type: 'Internal Service', status: 'Active', currentDueDate: '2027-07-16', intervalMonths: 12 };
  const job = { id: 'upuk3-dpf', registration: 'UPUK3', job_type: 'Other', work_required: 'DPF regeneration', status: 'completed', completed_at: '2026-11-11T09:20:58Z', booking_date: '2026-11-16' };
  const ctx = { window: {}, app: { jobs: [job], serviceRecords: [] }, fleetVehicles: [vehicle], fleetPlans: [service, dpf], fleetCompletions: [],
    todayIso: () => '2026-11-11', fleetDate: p => p.currentDueDate || '',
    fleetIsMaintenanceRemoved: () => false, jobTypeValues: j => [j.job_type].concat(j.job_types || []), isVehicleTaxJob: () => false,
    currentServiceTypeForJob: () => 'Internal Service', alternateServiceType: () => 'Full Service', serviceTypeFromValue: t => /service/i.test(t) ? 'Service' : '',
    serviceSheetDate: d => d, saveFleet: () => { ctx.saves = (ctx.saves || 0) + 1; },
    fleetVehicleForRegistration: reg => ctx.normReg(reg) === ctx.normReg(vehicle.registration) ? vehicle : null,
    fleetPlanMatching: (id, word) => ctx.fleetPlans.find(p => p.vehicleId === id && p.type.toLowerCase().includes(word)),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-fleet-rules.js', import.meta.url), 'utf8'), ctx);
  for (const name of ['normReg', 'isSixMonthSafetyCheck', 'isOnSiteService', 'completedJobCanUpdateFleet', 'completedJobDateForFleet', 'fleetMaintenanceCategory', 'fleetPlannerJobCategories', 'fleetAddMonthsFromDue', 'syncFleetDpfScheduleFromJob', 'syncFleetServiceScheduleFromJob', 'syncFleetMaintenanceFromJob', 'syncFleetMotScheduleFromJob', 'fleetPlannerJobTypeKeyMatches', 'fleetPlannerJobsForVehicle', 'fleetBookedPlannerJob']) vm.runInContext(core(name), ctx);
  return { ctx, job, dpf, service, vehicle };
}

test('Vehicle Record DPF booking completes the November cycle without changing annual service', () => {
  const { ctx, job, dpf, service } = setup();
  const button = { dataset: { unifiedNewJob: dpf.id } };
  Object.assign(ctx, { modal: { querySelectorAll: () => [button] }, reg: job.registration, vehicle: 'Qashqai', fv: null, customer: {}, fleetCustomer: '',
    fleetMaintenanceKind: p => ctx.window.VectaFleetRules.maintenanceKind(p), closeModals() {}, openJobModal: (_id, preset) => { ctx.preset = preset; } });
  const bookingLine = html.split('\n').find(line => line.includes("modal.querySelectorAll('[data-unified-new-job]')"));
  vm.runInContext(bookingLine, ctx);
  button.onclick();
  assert.equal(ctx.preset.job_type, 'Other');
  assert.equal(ctx.preset.work_required, 'DPF regeneration');
  assert.equal(ctx.preset.booking_date, '2026-11-16');
  Object.assign(job, ctx.preset);
  assert.equal(ctx.syncFleetMaintenanceFromJob(job), true);
  assert.equal(dpf.currentDueDate, '2027-03-16');
  assert.equal(service.currentDueDate, '2027-07-16');
  assert.equal(ctx.fleetCompletions.length, 1);
  assert.equal(ctx.fleetCompletions[0].completedDate, '2026-11-11');
  assert.equal(ctx.fleetCompletions[0].cycleDue, '2026-11-16');
  assert.equal(ctx.syncFleetMaintenanceFromJob(job), false);
  assert.equal(dpf.currentDueDate, '2027-03-16', 'saving twice does not skip another cycle');
  assert.equal(ctx.fleetCompletions.length, 1);
});

test('legacy generic Service label on a DPF-only job cannot reset annual service', () => {
  const { ctx, job, dpf, service } = setup();
  job.job_type = 'Service';
  assert.equal(ctx.syncFleetServiceScheduleFromJob(job), null);
  ctx.syncFleetMaintenanceFromJob(job);
  assert.equal(dpf.currentDueDate, '2027-03-16');
  assert.equal(service.currentDueDate, '2027-07-16');
  assert.equal(ctx.fleetCompletions[0].type, 'DPF regeneration');
});

test('a combined full service and DPF job updates both schedules', () => {
  const { ctx, job, dpf, service } = setup();
  job.job_type = 'Full Service'; job.work_required = 'Full Service and DPF regeneration';
  ctx.syncFleetMaintenanceFromJob(job);
  assert.equal(dpf.currentDueDate, '2027-03-16');
  assert.equal(service.currentDueDate, '2027-11-11');
  assert.equal(ctx.fleetCompletions.length, 2);
});

test('uncompleted, cancelled, deleted and old-cycle jobs cannot clear the DPF reminder', () => {
  for (const status of ['booked', 'work_complete', 'provisional', 'cancelled', 'deleted', 'quote']) {
    const { ctx, job, dpf } = setup();
    job.status = status; job.completed_at = null;
    assert.equal(ctx.syncFleetDpfScheduleFromJob(job), null, status);
    assert.equal(dpf.currentDueDate, '2026-11-16', status);
  }
  const { ctx, job, dpf } = setup();
  job.completed_at = '2026-07-16T12:00:00Z';
  assert.equal(ctx.syncFleetDpfScheduleFromJob(job), null);
  assert.equal(dpf.currentDueDate, '2026-11-16');
});

test('deleted maintenance and vehicles without a DPF plan do not acquire schedules', () => {
  const { ctx, job, dpf } = setup();
  ctx.fleetIsMaintenanceRemoved = () => true;
  assert.equal(ctx.syncFleetDpfScheduleFromJob(job), null);
  ctx.fleetIsMaintenanceRemoved = () => false;
  ctx.fleetPlans = ctx.fleetPlans.filter(p => p !== dpf);
  assert.equal(ctx.syncFleetDpfScheduleFromJob(job), null);
  assert.equal(ctx.fleetPlans.length, 1);
});

test('DPF bookings match their own reminder and late completion retains the anniversary', () => {
  const { ctx, job, dpf } = setup();
  job.status = 'booked'; job.completed_at = null;
  assert.equal(ctx.fleetBookedPlannerJob('UPUK 3', 'dpf').id, job.id);
  assert.equal(ctx.fleetBookedPlannerJob('UPUK 3', 'service'), null);
  job.status = 'completed'; job.completed_at = '2026-11-20T12:00:00Z'; ctx.todayIso = () => '2026-11-20';
  ctx.syncFleetMaintenanceFromJob(job);
  assert.equal(dpf.currentDueDate, '2027-03-16');
  assert.equal(ctx.fleetBookedPlannerJob('UPUK 3', 'dpf'), null);
});

test('previously recorded UPUK 2 style DPF completion is not advanced again', () => {
  const { ctx, job, dpf } = setup();
  dpf.currentDueDate = '2027-03-16';
  ctx.fleetCompletions.push({ id: 'job-dpf-' + job.id, source: 'job:' + job.id, planId: dpf.id, nextDue: dpf.currentDueDate });
  assert.equal(ctx.syncFleetMaintenanceFromJob(job), false);
  assert.equal(dpf.currentDueDate, '2027-03-16');
});
