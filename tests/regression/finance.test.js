import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './helpers.js';

const { invoiceTotals } = loadFunctions(['invoiceTotals'], {
  app: { settings: { vatRate: 20 } }
});

test('VAT-inclusive invoice retains the customer total', () => {
  const result = invoiceTotals([{ amount: 430, vat_mode: 'inc_vat' }]);
  assert.equal(result.total, 430);
  assert.ok(Math.abs(result.subtotal - 358.3333333333) < 0.001);
  assert.ok(Math.abs(result.vat - 71.6666666667) < 0.001);
});

test('VAT-exclusive invoice adds VAT once', () => {
  const result = invoiceTotals([{ amount: 100, vat_mode: 'ex_vat' }]);
  assert.equal(result.subtotal, 100);
  assert.equal(result.vat, 20);
  assert.equal(result.total, 120);
});

test('no-VAT vehicle tax remains VAT free', () => {
  const result = invoiceTotals([{ amount: 360, vat_mode: 'no_vat' }]);
  assert.equal(result.subtotal, 360);
  assert.equal(result.vat, 0);
  assert.equal(result.total, 360);
});

test('mixed invoice lines produce one correct total', () => {
  const result = invoiceTotals([
    { amount: 120, vat_mode: 'inc_vat' },
    { amount: 50, vat_mode: 'ex_vat' },
    { amount: 10, vat_mode: 'no_vat' }
  ]);
  assert.equal(result.subtotal, 160);
  assert.equal(result.vat, 30);
  assert.equal(result.total, 190);
});
