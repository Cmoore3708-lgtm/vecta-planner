import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('the 30-day audit renders every active plan, including cycles hidden by stale completion evidence',()=>{
  assert.match(html,/\(v\.allPlans\|\|v\.plans\|\|\[\]\)\.forEach/);
  assert.match(html,/fleetHasActiveMaintenanceRecord\(v\.id,typeKey\)/);
});

test('the red booked tick has a dedicated column',()=>{
  assert.match(html,/<span>Booking type<\/span><span>✓<\/span><span>Booked<\/span><span>Email sent<\/span>/);
  assert.match(html,/fleetBookingTypeGroupCell\(group\.items\)\+fleetBookedTickGroupCell\(group\.items\)/);
  assert.doesNotMatch(html,/fleetBookingTypeEntry[^\n]+fleetBookedTick\(item\.bookedJob\)/);
});

test('Booked shows every future diary date for the fleet vehicle, not only type-matched work',()=>{
  assert.match(html,/function fleetPlannerJobsForVehicle\(reg\)/);
  assert.match(html,/function fleetBookedGroupCell\(items,vehicle\)/);
  assert.match(html,/fleetPlannerJobsForVehicle\(vehicle&&vehicle\.registration\|\|''\)/);
});
