import test from 'node:test';
import assert from 'node:assert/strict';
import { source as applicationSource } from './helpers.js';

const source = applicationSource();

for (const name of [
  'vectaMissingColumns',
  'vectaRememberMissingColumn',
  'vectaStripKnownMissingColumns',
  'jobVehicleDueItem',
  'jobVehicleDuePanelHtml',
  'updateJobRegistrationDueAlert',
  'updateJobVehicleDuePanel',
  'knownRegistrationDetails',
  'openVehicleFromReg',
  'knownVehicles',
  'knownCustomers',
  'customerSearchRows'
]) {
  test(`${name} has one canonical definition`, () => {
    const matches = source.match(new RegExp(`function\\s+${name}\\s*\\(`, 'g')) || [];
    assert.equal(matches.length, 1);
  });
}
