import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetRefreshScope} from '../../api/fleet-nightly-refresh.js';

function fixture(status = 'Active', planStatus = 'Active') {
  return {vehicles:[{id:'v1',registration:'NJ68 HHS',status}],
    plans:[{id:'p1',vehicleId:'v1',type:'MOT',status:planStatus,currentDueDate:'2026-01-01'}]};
}

for (const full of [false,true]) {
  test(`${full?'monthly':'nightly'} refresh excludes archived, deleted and inactive vehicles`,()=>{
    for (const status of ['Archived','Inactive','Deleted']) {
      assert.equal(fleetRefreshScope(fixture(status),full).candidates.length,0,status);
    }
    const state=fixture();
    state.deletedRegistrations=['nj68hhs'];
    assert.equal(fleetRefreshScope(state,full).candidates.length,0,'deletion wins over stale Active record');
  });
  test(`${full?'monthly':'nightly'} refresh excludes paused and removed maintenance`,()=>{
    for (const status of ['Paused','Paused by vehicle archive','Cancelled','Deleted']) {
      assert.equal(fleetRefreshScope(fixture('Active',status),full).candidates.length,0,status);
    }
    const state=fixture();
    state.removedMaintenance={'v1|mot':{vehicleId:'v1',category:'mot'}};
    assert.equal(fleetRefreshScope(state,full).candidates.length,0);
    state.plans.push({id:'tax',vehicleId:'v1',type:'Road tax',status:'Active'});
    const scope=fleetRefreshScope(state,full);
    assert.equal(scope.candidates.length,1,'remaining active Tax plan still checked');
    assert.deepEqual(scope.plans.map(p=>p.id),['tax'],'removed MOT cannot be checked via Tax candidate');
  });
}

test('active records retain missing-date, 60-day and monthly policies without deleting history',()=>{
  const state=fixture();
  const before=structuredClone(state);
  assert.equal(fleetRefreshScope(state).candidates.length,1);
  assert.deepEqual(state,before);
  state.plans[0].currentDueDate='2099-01-01';
  assert.equal(fleetRefreshScope(state).candidates.length,0);
  assert.equal(fleetRefreshScope(state,true).candidates.length,1);
  delete state.plans[0].currentDueDate;
  delete state.plans[0].status;
  delete state.vehicles[0].status;
  assert.equal(fleetRefreshScope(state).candidates.length,1,'legacy active records without status');
});
