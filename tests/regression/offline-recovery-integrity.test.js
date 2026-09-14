import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const plainStart = html.indexOf(`function ${name}(`);
  const asyncStart = html.indexOf(`async function ${name}(`);
  const start = asyncStart > -1 && asyncStart <= plainStart ? asyncStart : plainStart;
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

test('offline snapshot contains the complete operational state including Fleet plans', () => {
  const context = {
    app: { jobs:[{id:'j1'}], customers:[{id:'c1'}], vehicles:[{id:'v1'}], tasks:[{id:'t1'}], invoices:[{id:'i1'}], serviceRecords:[{id:'s1'}], websiteRequests:[{id:'w1'}] },
    fleetVehicles: [{id:'fv1'}],
    fleetPlans: [{id:'fp1'}],
    vectaPendingSync: () => [{key:'upsert:jobs:j1'}],
    navigator: {onLine:false},
    vectaCloudReachable:false,
    Date,
    JSON,
  };
  vm.runInNewContext(`${namedFunctionSource('vectaBackupPayload')}; snapshot=vectaBackupPayload('test');`, context);
  assert.equal(context.snapshot.app.jobs.length, 1);
  assert.equal(context.snapshot.app.invoices.length, 1);
  assert.equal(context.snapshot.fleetVehicles.length, 1);
  assert.equal(context.snapshot.fleetPlans.length, 1);
  assert.equal(context.snapshot.pendingSync.length, 1);
});

test('an empty browser restores the newest usable local workshop snapshot', () => {
  const context = {
    app: {jobs:[]}, fleetVehicles:[], fleetPlans:[],
    vectaHasUsableWorkshopData: candidate => !!(candidate?.jobs?.length),
    vectaListBackups: async () => [{created_at:'2026-09-13T10:00:00Z',record_counts:{jobs:1},app:{jobs:[{id:'restored'}]},fleetVehicles:[{id:'vehicle'}],fleetPlans:[{id:'plan'}]}],
    vectaBackupJobCount: snapshot => snapshot.record_counts.jobs,
    merge: (_a,b) => b,
    localStorage:{setItem(){}}, STORE_KEY:'store', console, JSON, Array,
  };
  vm.runInNewContext(`${namedFunctionSource('vectaRestoreLatestBackupIfNeeded')}; promise=vectaRestoreLatestBackupIfNeeded();`, context);
  return context.promise.then(result => {
    assert.equal(result, true);
    assert.equal(context.app.jobs[0].id, 'restored');
    assert.equal(context.fleetVehicles[0].id, 'vehicle');
    assert.equal(context.fleetPlans[0].id, 'plan');
  });
});

test('offline queue blocks job deletion and preserves terminal completion authority', () => {
  assert.match(namedFunctionSource('queueRemoteOperation'), /operation==='delete'&&table==='jobs'[\s\S]*?blocked:true/);
  const flush = namedFunctionSource('flushPendingSync');
  assert.match(flush, /never replay historical queued job deletions/i);
  assert.match(flush, /terminal&&terminal\.state==='deleted'/);
  assert.match(flush, /terminal&&terminal\.state==='completed'[\s\S]*?status:'completed',archived:true/);
});

test('reconnect flushes local edits before downloading authoritative cloud state', () => {
  const source = namedFunctionSource('vectaHandleReconnect');
  assert.ok(source.indexOf('await flushPendingSync()') < source.indexOf('refreshPlannerCoreFromCloudAndRender()'));
  assert.equal((html.match(/addEventListener\('online',vectaHandleReconnect\)/g) || []).length, 1);
});

test('startup always removes its loading gate before waiting for backup or cloud', () => {
  const start = html.indexOf('function init()');
  const end = html.indexOf('function plannerSearchNormaliseText', start);
  const source = html.slice(start, end);
  assert.ok(source.indexOf('vectaSetStartupLoading(false)') < source.indexOf('vectaRestoreLatestBackupIfNeeded()'));
  assert.ok(source.indexOf('render()') < source.indexOf('await loadCloudConfig'));
  assert.match(source, /setTimeout\(function\(\)[\s\S]*?vectaSetStartupLoading\(false\);render\(\)/);
});
