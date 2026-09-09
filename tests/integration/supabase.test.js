import test from 'node:test';
import assert from 'node:assert/strict';

const url = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
const productionRef = 'jywufozycuwuoshlulwl';

function testConfig() {
  assert.ok(url && key, 'Test Supabase URL and publishable key are required');
  assert.ok(!url.includes(productionRef), 'Safety stop: integration tests cannot use production');
}

async function rows(table, query = '') {
  testConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  assert.equal(response.status, 200, `${table} returned ${response.status}`);
  return response.json();
}

test('database identifies itself as synthetic test data', async () => {
  const result = await rows('workshop_settings', 'id=eq.test_environment&select=value');
  assert.equal(result.length, 1);
  assert.equal(result[0].value.synthetic_only, true);
  assert.equal(result[0].value.production_data, false);
});

test('synthetic £430 invoice is internally consistent', async () => {
  const result = await rows('invoices', 'invoice_number=eq.TEST-0001&select=amount,subtotal,vat,total');
  assert.equal(result.length, 1);
  assert.equal(Number(result[0].amount), 430);
  assert.ok(Math.abs(Number(result[0].subtotal) + Number(result[0].vat) - Number(result[0].total)) < 0.01);
});

test('deleted synthetic jobs cannot enter active totals', async () => {
  const active = await rows('jobs', 'status=neq.deleted&archived=eq.false&select=id');
  const deleted = await rows('jobs', 'status=eq.deleted&select=id,amount_quoted');
  assert.equal(active.length, 1);
  assert.equal(deleted.length, 1);
  assert.equal(Number(deleted[0].amount_quoted), 999);
});

test('website-booking fixture is isolated and awaiting review', async () => {
  const result = await rows('website_booking_requests', 'select=registration,status,job_id');
  assert.equal(result.length, 1);
  assert.equal(result[0].registration, 'WEBTEST');
  assert.equal(result[0].status, 'awaiting_review');
  assert.equal(result[0].job_id, null);
});
