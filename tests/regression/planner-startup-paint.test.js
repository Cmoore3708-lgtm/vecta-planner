import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function init(){safe(async function(){'),html.indexOf('function plannerSearchNormaliseText'));
function harness(online=true){
  const events=[],timers=[];let ready;
  const live=new Promise(resolve=>{ready=resolve});
  const c={navigator:{onLine:online},window:{},VECTA_AUDIT_PREVIEW:false,console,
    safe(fn){c.start=fn()},setTimeout(fn,ms){timers.push({fn,ms});return timers.length},clearTimeout(){},setInterval(){},
    vectaSetStartupLoading(on){events.push(on?'loading':'released')},render(){events.push('render')},updateConnectivityUI(){},
    loadLocal(){events.push('local')},vectaRunDataIngressMigrations(){return {}},bindTop(){},
    vectaWithTimeout:async p=>p,vectaRestoreLatestBackupIfNeeded:async()=>{},vectaCreateDailyBackup:async()=>{},
    loadCloudConfig:async()=>true,ensureSupabase(fn){c.connected=fn(true)},connectSupabase:()=>true,
    vectaPrimeAuthoritativeDashboard:async()=>{await live;events.push('live')},pullFleetCloudState:async()=>{},
    importContractor2026Spreadsheet(){},ensureServiceTemplates(){},ensureRecurringWorkshopTasks(){},startCloudSync(){},
  };
  vm.runInNewContext(source+';init();',c);
  return {c,events,timers,ready};
}
test('online refresh exposes the reconciled jobs only after cloud startup',async()=>{
  const h=harness();await h.c.start;
  assert.equal(h.events.includes('render'),false);
  assert.equal(h.events.includes('released'),false);
  h.ready();await h.c.connected;
  assert.ok(h.events.indexOf('render')>h.events.indexOf('live'));
  assert.equal(h.events.filter(x=>x==='render').length,1);
});
test('offline refresh immediately exposes the saved planner',async()=>{
  const h=harness(false);await h.c.start;
  assert.ok(h.events.includes('released'));
  assert.ok(h.events.includes('render'));
});
test('unresponsive cloud cannot leave the saved planner inaccessible',async()=>{
  const h=harness();await h.c.start;
  h.timers.find(x=>x.ms===12000).fn();
  assert.equal(h.c.vectaCloudReachable,false);
  assert.deepEqual(h.events.slice(-2),['released','render']);
  h.ready();await h.c.connected;
});
