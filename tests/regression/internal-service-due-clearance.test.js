import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const match = html.match(/window\.fleetPlanCompletedForCurrentCycle=function\(p\)\{[\s\S]*?\n  \};/);
assert.ok(match, 'final runtime completion rule exists');

function evaluate(done, due = '2026-10-01') {
  const job = done && { registration: 'BSKAIZEN', job_type: 'On-Site Service', status: 'completed', completed_at: `${done}T14:28:00Z` };
  const context = {
    window: {}, fleetVehicles: [{ id: 'bs', registration: 'BSKAIZEN' }],
    fleetDate: p => p.currentDueDate,
    fleetMaintenanceCategory: () => 'service',
    fleetCompletedJobForPlanCycle: () => job,
    completedJobDateForFleet: j => j.completed_at.slice(0, 10),
    fleetAddMonthsFromDue: (date, months) => `${Number(date.slice(0, 4)) + months / 12}${date.slice(4)}`,
  };
  vm.runInNewContext(match[0], context);
  return context.window.fleetPlanCompletedForCurrentCycle({ vehicleId: 'bs', type: 'Internal Service', manualDueDate: true, currentDueDate: due });
}

test('today’s completed On-Site Service clears its manually entered October due cycle', () => {
  assert.equal(evaluate('2026-09-24'), true);
});

test('an older service or absent completion leaves the next due cycle visible', () => {
  assert.equal(evaluate('2025-09-24'), false);
  assert.equal(evaluate(null), false);
});

test('completing an internal On-Site Service advances its Fleet plan by 12 months', () => {
  const source = html.match(/function syncFleetServiceScheduleFromJob\(j\)\{[\s\S]*?\n\}/);
  assert.ok(source);
  const vehicle = { id: 'bs', registration: 'BSKAIZEN', fleetGroup: 'Nissan Internal' };
  const plan = { id: 'bs-plan', vehicleId: 'bs', type: 'Internal Service', status: 'Active', currentDueDate: '2026-10-01', manualDueDate: true };
  const context = {
    fleetPlans: [plan], fleetCompletions: [],
    completedJobCanUpdateFleet: () => true, isSixMonthSafetyCheck: () => false,
    isOnSiteService: () => true, fleetVehicleForRegistration: () => vehicle,
    fleetIsMaintenanceRemoved: () => false, completedJobDateForFleet: () => '2026-09-24',
    currentServiceTypeForJob: () => 'Service', fleetDate: p => p.currentDueDate,
    fleetMaintenanceCategory: () => 'service',
    fleetAddMonthsFromDue: () => '2027-09-24',
    serviceSheetDate: x => x, saveFleet: () => {},
  };
  vm.runInNewContext(source[0], context);
  const record = context.syncFleetServiceScheduleFromJob({ id: 'bs-job', registration: 'BSKAIZEN', job_type: 'On-Site Service', status: 'completed' });
  assert.ok(record);
  assert.equal(plan.currentDueDate, '2027-09-24');
  assert.equal(plan.manualDueDate, false);
  assert.equal(record.completedDate, '2026-09-24');
});
