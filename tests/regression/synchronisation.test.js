import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, source } from './helpers.js';

const identity = value => value;
const { mergeRemoteRows } = loadFunctions(['mergeRemoteRows'], {
  fromRemote: identity,
  normaliseCompletedJobState: identity,
  jobCompletionEvidence: row => row?.status === 'completed' || row?.archived === true,
  vectaChooseCompletionStamp: (a, b) => a || b
});

test('newer cloud job details replace stale phone details', () => {
  const local = [{ id: 'job-1', amount_quoted: 100, updated_at: '2026-09-08T10:00:00Z' }];
  const remote = [{ id: 'job-1', amount_quoted: 430, updated_at: '2026-09-08T11:00:00Z' }];
  assert.equal(mergeRemoteRows(local, remote)[0].amount_quoted, 430);
});

test('newer unsynchronised local details are not silently overwritten', () => {
  const local = [{ id: 'job-1', amount_quoted: 430, updated_at: '2026-09-08T12:00:00Z' }];
  const remote = [{ id: 'job-1', amount_quoted: 100, updated_at: '2026-09-08T11:00:00Z' }];
  assert.equal(mergeRemoteRows(local, remote)[0].amount_quoted, 430);
});

test('completion cannot be downgraded by a stale copy', () => {
  const local = [{ id: 'job-1', status: 'completed', archived: true, updated_at: '2026-09-08T10:00:00Z' }];
  const remote = [{ id: 'job-1', status: 'booked', archived: false, updated_at: '2026-09-08T11:00:00Z' }];
  const result = mergeRemoteRows(local, remote)[0];
  assert.equal(result.status, 'completed');
  assert.equal(result.archived, true);
});

test('realtime job events use a row merge rather than the full-table shrink guard', () => {
  const html = source();
  assert.match(html, /if\(table==='jobs'\)\{app\.jobs=mergeRemoteRows\(app\.jobs\|\|\[\],\[row\]\)/);
  assert.doesNotMatch(html, /if\(table==='jobs'\)\{vectaReconcileJobsFromCloud\(\[row\]\)/);
});
