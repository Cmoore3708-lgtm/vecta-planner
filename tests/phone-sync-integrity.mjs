import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import generatorModule from '@babel/generator';
import traverseModule from '@babel/traverse';

const generate = generatorModule.default || generatorModule;
const traverse = traverseModule.default || traverseModule;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

function functionSource(name) {
  for (const script of scripts) {
    const ast = parse(script, { sourceType: 'script', errorRecovery: false });
    let found = null;
    traverse(ast, { FunctionDeclaration(path) { if (!found && path.node.id?.name === name) found = path.node; } });
    if (found) return generate(found, { compact: false }).code;
  }
  throw new Error(`Function ${name} was not found`);
}

{
  let saves = 0;
  const staleJobs = [
    { id: 'p3', registration: 'P3FOR', booking_date: null, technician: 'Alfie', status: 'booked' },
    { id: 'deleted-nmuk', registration: 'NMUK', booking_date: null, technician: 'Other', status: 'booked' },
    { id: 'test1', registration: 'TEST1', booking_date: '2026-09-11', technician: 'Alfie', status: 'booked', updated_at: '2026-09-10T09:03:00Z' }
  ];
  const cloudJobs = [
    { id: 'p3', registration: 'P3FOR', booking_date: '2026-09-09', technician: 'Other', status: 'ready_to_invoice' },
    { id: 'ef19', registration: 'EF19LXC', booking_date: '2026-09-11', technician: 'Alfie', status: 'booked' },
    { id: 'test1', registration: 'TEST1', booking_date: '2026-09-11', technician: 'Other', status: 'booked', updated_at: '2026-09-10T09:01:53Z' }
  ];
  const pending = [{ key: 'upsert:jobs:test1', operation: 'upsert', table: 'jobs', queued_at: '2026-09-10T09:00:30Z', payload: { id: 'test1', technician: 'Alfie', updated_at: '2026-09-10T09:00:30Z' } }];
  let remainingQueue = pending;
  const context = vm.createContext({
    console, Date, JSON, Math, Number, String, Array, Object,
    app: { jobs: staleJobs },
    localStorage: { setItem() {} },
    fromRemote: row => ({ ...row }),
    normaliseCompletedJobState: row => row,
    vectaPendingSync: () => remainingQueue,
    vectaNormaliseQueuedItem: row => row,
    vectaTerminalJobState: () => null,
    vectaSetTerminalJobStateLocal: () => {},
    mergeRemoteRows: (_local, remote) => remote,
    jobCompletionEvidence: () => false,
    saveLocal: () => { saves += 1; },
    normReg: value => String(value || '').replace(/\s/g, '').toUpperCase(),
    vectaArchiveSyncItems: () => {},
    vectaSavePendingSync: value => { remainingQueue = value; }
  });
  vm.runInContext(functionSource('vectaQueuedJobOperations'), context);
  vm.runInContext(functionSource('vectaPendingUpsertIsNewerThanCloud'), context);
  vm.runInContext(functionSource('vectaReconcileJobsFromCloud'), context);
  const result = context.vectaReconcileJobsFromCloud(cloudJobs);

  assert.deepEqual(Array.from(result, row => row.id).sort(), ['ef19', 'p3', 'test1']);
  assert.equal(result.find(row => row.id === 'p3').status, 'ready_to_invoice');
  assert.equal(result.find(row => row.id === 'ef19').booking_date, '2026-09-11');
  assert.equal(result.some(row => row.id === 'deleted-nmuk'), false);
  assert.equal(result.find(row => row.id === 'test1').technician, 'Other');
  assert.equal(remainingQueue.length, 0);
  assert.equal(saves, 1);
}

assert.doesNotMatch(html, /blocked incomplete jobs refresh/);
assert.match(html, /deletionStamp<Date\.parse\('2026-08-26T00:00:00Z'\)/);
assert.match(html, /await vectaWriteTerminalJobState\(j,'deleted'/);
assert.match(html, /v328-cross-device-edit-sync/);

console.log('Phone/cloud sync integrity regression tests passed.');
