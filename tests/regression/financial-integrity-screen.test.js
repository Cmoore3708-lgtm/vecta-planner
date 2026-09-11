import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../supabase/migrations/20260911124500_protect_completed_job_dates.sql', import.meta.url), 'utf8');

test('Financial exposes the permanent integrity screen', () => {
  assert.match(html, /id="financialIntegrityTab">Financial Integrity/);
  assert.match(html, /function financialIntegrityAudit\(\)/);
  assert.match(html, /function financialIntegrityHtml\(\)/);
  assert.match(html, /financialSection==='integrity'/);
});

test('integrity audit covers the core revenue failure modes', () => {
  for (const rule of [
    'Completion dates',
    'Completed job values',
    'Invoice essentials',
    'Invoice number uniqueness',
    'One invoice per job',
    'Invoice arithmetic',
    'MOT and Vehicle Tax VAT',
    'Fleet month-end coverage',
    'Duplicate completed jobs',
    'Financial allocation'
  ]) assert.ok(html.includes(rule), `missing integrity rule: ${rule}`);
  assert.match(html, /All financial checks passed/);
  assert.match(html, /system is not claiming the figures are complete/);
});

test('database safeguard rejects undated completed jobs', () => {
  assert.match(migration, /create trigger vecta_protect_completed_job_date/i);
  assert.match(migration, /raise exception 'A completed job must have a booking or completion date'/i);
  assert.match(migration, /before insert or update of status, booking_date, completed_at/i);
});
