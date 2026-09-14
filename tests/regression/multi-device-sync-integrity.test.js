import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const plain = html.indexOf(`function ${name}(`);
  const async = html.indexOf(`async function ${name}(`);
  const start = async > -1 && (plain < 0 || async <= plain) ? async : plain;
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function reconciliationContext(localJobs, queued = {}) {
  const archived = [];
  return {
    app:{jobs:localJobs},
    fromRemote: row => ({...row}),
    vectaJobIsDeletedForLists: () => false,
    vectaQueuedJobOperations: () => queued,
    vectaPendingUpsertIsNewerThanCloud: (item, remote) => Date.parse(item.payload.updated_at) > Date.parse(remote.updated_at),
    vectaLikelyNewOfflineJob: item => item?.newOffline === true,
    mergeRemoteRows: (local, remote) => [{...remote[0],...local[0]}],
    normaliseCompletedJobState: row => row,
    vectaTerminalJobState: () => null,
    vectaSetTerminalJobStateLocal(){},
    vectaPendingSync: () => Object.values(queued),
    vectaNormaliseQueuedItem: item => item,
    vectaArchiveSyncItems(items){archived.push(...items)},
    vectaSavePendingSync(){},
    saveLocal(){},
    normReg: value => value,
    localStorage:{setItem(){}},
    console, Date, String, Object, Array,
    archived,
  };
}

test('a newer cloud planner amendment replaces an older phone copy', () => {
  const local = [{id:'job-1',technician:'Other',booking_date:'2026-09-13',drop_time:'09:00',updated_at:'2026-09-13T08:00:00Z'}];
  const remote = [{id:'job-1',technician:'Alfie',booking_date:'2026-09-14',drop_time:'10:15',updated_at:'2026-09-13T09:00:00Z'}];
  const context = reconciliationContext(local);
  vm.runInNewContext(`${namedFunctionSource('vectaReconcileJobsFromCloud')}; result=vectaReconcileJobsFromCloud(remote);`, {...context, remote});
  assert.equal(context.app.jobs[0].technician, 'Alfie');
  assert.equal(context.app.jobs[0].booking_date, '2026-09-14');
  assert.equal(context.app.jobs[0].drop_time, '10:15');
});

test('a genuinely newer queued offline edit survives an older cloud snapshot', () => {
  const local = [{id:'job-1',technician:'Alfie',booking_date:'2026-09-14',drop_time:'10:15',updated_at:'2026-09-13T10:00:00Z'}];
  const remote = [{id:'job-1',technician:'Other',booking_date:'2026-09-13',drop_time:'09:00',updated_at:'2026-09-13T09:00:00Z'}];
  const item = {key:'upsert:jobs:job-1',operation:'upsert',table:'jobs',payload:{...local[0]}};
  const context = reconciliationContext(local, {'job-1':item});
  vm.runInNewContext(`${namedFunctionSource('vectaReconcileJobsFromCloud')}; result=vectaReconcileJobsFromCloud(remote);`, {...context, remote});
  assert.equal(context.app.jobs[0].technician, 'Alfie');
  assert.equal(context.app.jobs[0].drop_time, '10:15');
});

test('a complete authoritative cloud pull removes stale unqueued device-only jobs', () => {
  const context = reconciliationContext([{id:'stale-device-job',updated_at:'2026-09-12T09:00:00Z'}]);
  vm.runInNewContext(`${namedFunctionSource('vectaReconcileJobsFromCloud')}; result=vectaReconcileJobsFromCloud([]);`, context);
  assert.equal(context.app.jobs.length, 0);
});

test('realtime refreshes are coalesced and never process settings as planner data', () => {
  const source = namedFunctionSource('scheduleCloudRefresh');
  assert.match(source, /table==='workshop_settings'/);
  assert.match(source, /clearTimeout\(cloudRefreshDebounce\)/);
  assert.match(source, /cloudRefreshDebounce=setTimeout\(function\(\)/);
  assert.doesNotMatch(html, /table:'workshop_settings'\},scheduleCloudRefresh/);
});
