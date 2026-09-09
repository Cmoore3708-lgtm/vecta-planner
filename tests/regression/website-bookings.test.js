import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './helpers.js';

const html = source();

test('website booking acceptance is idempotent', () => {
  assert.match(html, /existingRequest&&existingRequest\.job_id/);
  assert.match(html, /if\(existingJob\)\{/);
  assert.match(html, /websiteRequestCreateBusy\[id\]/);
});

test('deleted website bookings are excluded from live totals', () => {
  assert.match(html, /String\(r\.status\|\|''\)\.toLowerCase\(\)==='deleted'/);
  assert.match(html, /vectaJobIsDeletedForLists\(j\)/);
});

test('job deletion cannot be replayed from the offline queue', () => {
  assert.match(html, /blocked queued jobs DELETE/);
  assert.match(html, /quarantined stale queued job delete/);
});
