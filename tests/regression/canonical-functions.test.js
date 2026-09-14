import test from 'node:test';
import assert from 'node:assert/strict';
import { source as applicationSource } from './helpers.js';

const source = applicationSource();
const canonicalFunctions = [
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
  'customerSearchRows',
  'openCustomerDetails',
  'vehicleRows'
];

test('cleaned application rules each have one canonical definition', () => {
  for (const name of canonicalFunctions) {
    const matches = source.match(new RegExp(`function\\s+${name}\\s*\\(`, 'g')) || [];
    assert.equal(matches.length, 1, `${name} must have exactly one definition`);
  }
});
