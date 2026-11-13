import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function init(){safe(async function(){'),html.indexOf('function plannerSearchNormaliseText'));
const reconnect=html.slice(html.indexOf('async function vectaHandleReconnect(){'),html.indexOf('function init(){safe(async function(){'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(online=true, recovery=async()=>{}, timeout=async p=>p){
  const events=[],timers=[],intervals=[],listeners={};let ready;
  const live=new Promise(resolve=>{ready=resolve});
  const on=(type,fn)=>{(listeners[type]??=[]).push(fn)};
  const c={navigator:{onLine:online},window:{addEventListener:on},VECTA_AUDIT_PREVIEW:false,console,
    document:{visibilityState:'visible',activeElement:null,querySelector:()=>null,addEventListener:on},cloudRefreshBusy:false,
    safe(fn){c.start=fn()},setTimeout(fn,ms){timers.push({fn,ms});return timers.length},clearTimeout(){},setInterval(fn,ms){intervals.push({fn,ms});},
    vectaSetStartupLoading(on){events.push(on?'loading':'released')},render(){events.push('render')},updateConnectivityUI(){},
    loadLocal(){events.push('local')},vectaRunDataIngressMigrations(){return {}},bindTop(){},
    saveLocal(){},vectaHydratePaperwork:async()=>false,vectaWithTimeout:timeout,vectaRestoreLatestBackupIfNeeded:recovery,vectaCreateDailyBackup:async()=>{},
    loadCloudConfig:async()=>{events.push('config');return true},ensureSupabase(fn){events.push('sdk');fn(true)},connectSupabase:()=>true,
    vectaPrimeAuthoritativeDashboard:async()=>{await live;events.push('live');c.vectaCloudReachable=true},pullFleetCloudState:async()=>{},
    importContractor2026Spreadsheet(){},ensureServiceTemplates(){},ensureRecurringWorkshopTasks(){},startCloudSync(){events.push('sync-start')},
    vectaRefreshWebsiteBookingCount(){},flushPendingSync:async()=>events.push('flush'),refreshPlannerCoreFromCloudAndRender:async()=>{events.push('refresh');c.vectaCloudReachable=true;return true},
  };
  vm.runInNewContext(reconnect+source+';init();',c);
  return {c,events,timers,intervals,listeners,ready,async emit(type){return Promise.all((listeners[type]||[]).map(fn=>fn()))}};
}
test('online refresh exposes the reconciled jobs only after cloud startup',async()=>{
  const h=harness();await tick();
  assert.equal(h.events.includes('render'),false);
  assert.equal(h.events.includes('released'),false);
  h.ready();await h.c.start;
  assert.ok(h.events.indexOf('render')>h.events.indexOf('live'));
  assert.equal(h.events.filter(x=>x==='render').length,1);
});
test('offline refresh immediately exposes the saved planner',async()=>{
  const h=harness(false);await h.c.start;
  assert.ok(h.events.includes('released'));
  assert.ok(h.events.includes('render'));
});
test('unresponsive cloud cannot leave the saved planner inaccessible',async()=>{
  const h=harness();await tick();
  h.timers.find(x=>x.ms===12000).fn();
  assert.equal(h.c.vectaCloudReachable,false);
  assert.deepEqual(h.events.slice(-2),['released','render']);
  h.ready();await h.c.start;
  assert.equal(h.c.vectaCloudReachable,true);
});
test('backup recovery finishing after offline first paint redraws the recovered planner',async()=>{
 let release;const recovery=new Promise(resolve=>{release=resolve});
 const h=harness(false,()=>recovery,async()=>{throw Error('Local recovery timed out')});
 await h.c.start;const before=h.events.filter(x=>x==='render').length;
 release(true);await tick();
 assert.equal(h.events.filter(x=>x==='render').length,before+1);
});
test('failed first configuration recovers on focus without reloading local data or needing an online event',async()=>{
 const h=harness();h.c.loadCloudConfig=async()=>{h.events.push('config-failed');return false};await h.c.start;
 assert.equal(h.c.vectaCloudReachable,false);assert.equal(h.events.includes('sync-start'),false);
 h.c.loadCloudConfig=async()=>true;h.ready();await h.emit('focus');
 assert.equal(h.c.vectaCloudReachable,true);assert.equal(h.events.filter(x=>x==='local').length,1);
 assert.equal(h.events.filter(x=>x==='sync-start').length,1);
});
test('cold offline start reconnects when the network returns',async()=>{
 const h=harness(false);await h.c.start;h.c.navigator.onLine=true;h.ready();await h.emit('online');
 assert.equal(h.c.vectaCloudReachable,true);assert.equal(h.events.filter(x=>x==='sync-start').length,1);
 assert.equal(h.listeners.online.length,1);
});
test('failed first data request retries while the device remains online',async()=>{
 const h=harness();h.c.vectaPrimeAuthoritativeDashboard=async()=>{throw Error('transient data timeout')};await h.c.start;
 assert.equal(h.c.vectaCloudReachable,false);
 h.c.vectaPrimeAuthoritativeDashboard=async()=>{h.c.vectaCloudReachable=true};
 await h.intervals.at(-1).fn();assert.equal(h.c.vectaCloudReachable,true);
 assert.equal(h.events.filter(x=>x==='sync-start').length,1);
});
test('foreground events share an in-flight startup and do not duplicate subscriptions',async()=>{
 const h=harness();await tick();await Promise.all([h.emit('focus'),h.emit('pageshow'),h.emit('online')]);
 assert.equal(h.events.filter(x=>x==='sdk').length,1);
 h.ready();await h.c.start;await h.emit('focus');await h.intervals.at(-1).fn();
 assert.equal(h.events.filter(x=>x==='sdk').length,1);assert.equal(h.events.filter(x=>x==='sync-start').length,1);
});
test('automatic recovery waits while hidden, offline or editing and never touches the saved queue',async()=>{
 const h=harness(false);await h.c.start;h.c.navigator.onLine=true;h.ready();
 h.c.document.visibilityState='hidden';await h.emit('focus');
 h.c.document.visibilityState='visible';h.c.document.querySelector=()=>({});await h.intervals.at(-1).fn();
 h.c.document.querySelector=()=>null;h.c.document.activeElement={matches:()=>true};await h.emit('pageshow');
 assert.equal(h.events.includes('sdk'),false);assert.equal(h.events.includes('flush'),false);
 h.c.document.activeElement=null;await h.emit('focus');assert.equal(h.c.vectaCloudReachable,true);
});
test('watchdog cannot turn a confirmed cloud read offline while fleet finishes',async()=>{
 const h=harness();let release;h.c.pullFleetCloudState=()=>new Promise(resolve=>release=resolve);h.ready();await tick();
 assert.equal(h.c.vectaCloudReachable,true);h.timers.find(x=>x.ms===12000).fn();assert.equal(h.c.vectaCloudReachable,true);
 release();await h.c.start;assert.equal(h.c.vectaCloudReachable,true);
});
test('authentication finishes before the shared-data timeout budget begins',async()=>{
 const h=harness();let release;h.c.window.VectaWorkshopAccess={token:()=>new Promise(resolve=>release=resolve)};h.ready();await tick();
 assert.equal(h.events.includes('live'),false);release();await h.c.start;assert.equal(h.c.vectaCloudReachable,true);
});
test('failed reconnect cannot report online merely because the pending queue is empty',async()=>{
 const h=harness();h.ready();await h.c.start;h.c.vectaCloudReachable=false;
 h.c.flushPendingSync=async()=>{h.events.push('flush');h.c.vectaCloudReachable=true};
 h.c.refreshPlannerCoreFromCloudAndRender=async()=>{h.events.push('refresh');return false};
 await h.emit('online');assert.equal(h.c.vectaCloudReachable,false);
 assert.ok(h.events.lastIndexOf('flush')<h.events.lastIndexOf('refresh'));
});
