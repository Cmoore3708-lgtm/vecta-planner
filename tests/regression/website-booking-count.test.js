import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createClient} from '@supabase/supabase-js';

const html=fs.readFileSync('index.html','utf8');
const countSource=html.slice(html.indexOf('var vectaWebsiteBookingCloudCount='),html.indexOf('function vectaBase64UrlBytes('));
const syncSource=html.slice(html.indexOf('function scheduleCloudRefresh(payload)'),html.indexOf('function init(){safe(async function(){'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const {document}=parseHTML('<html><body><nav id="nav"><button class="active" data-view="websiteRequests">Website Bookings</button></nav><input value="unsaved work"></body></html>');
 document.visibilityState='visible';
 const button=document.querySelector('button'),calls=[],badges=[],timers=[],intervals=[],events={},live={count:1,error:false,fetch:null};
 let subscription;
 const client=createClient('https://count-test.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
  calls.push({url:new URL(url),method:options.method,headers:new Headers(options.headers)});
  if(live.fetch)return live.fetch();
  if(live.error)throw new Error('Offline');
  return new Response(null,{status:200,headers:{'content-range':'*/'+live.count}});
 }}});
 const channel={on(){return this},subscribe(fn){subscription=fn;return this}};
 const c={app:{websiteRequests:[],jobs:[]},navigator:{onLine:true,setAppBadge:async n=>badges.push(n),clearAppBadge:async()=>badges.push(0)},
  window:{addEventListener(type,fn){events[type]=fn}},document,console:{log(){},warn(){}},
  remoteClient:{from:client.from.bind(client),channel:()=>channel,removeChannel(){}},
  vectaWithTimeout:async query=>query,uid:()=> 'count-test',saveLocal(){},
  setTimeout(fn,ms){timers.push({fn,ms});return timers.length},clearTimeout(){},setInterval(fn,ms){intervals.push({fn,ms});return intervals.length},clearInterval(){},
  cloudSyncChannel:null,cloudSyncTimer:null,cloudLastRefreshAt:Date.now(),cloudRefreshDebounce:null,plannerInteractionBusy:false,cloudRefreshBusy:false,
  refreshPlannerCoreFromCloudAndRender:async()=>false,refreshCloudAndRender(){throw Error('Unexpected full cloud reload')},
  flushPendingSync:async()=>{},updateConnectivityUI(){},vectaRunDataIngressMigrations(){},vectaApplyTerminalJobStates(){},
  mergeRemoteRows(local,remote){const map=new Map(local.map(r=>[r.id,r]));for(const row of remote)map.set(row.id,row);return [...map.values()]},
  view:'planner',render(){throw Error('Counter must not rebuild the dashboard')},
 };
 vm.runInNewContext(fs.readFileSync('public/js/vecta-device-notifications.js','utf8')+'\n'+countSource+'\n'+syncSource,c);
 return {c,document,button,calls,badges,timers,intervals,events,live,subscription:status=>subscription(status)};
}

test('cold startup shows the server count before deferred inbox hydration using a HEAD request',async()=>{
 const h=harness(),click=()=>{};h.button.onclick=click;h.live.count=3;
 h.c.startCloudSync();await h.c.vectaWebsiteBookingCountPending;
 assert.equal(h.button.textContent,'Website Bookings (3)');assert.equal(h.button.onclick,click);assert.equal(h.button.className,'active');
 assert.equal(h.document.querySelector('input').value,'unsaved work');assert.equal(h.c.app.websiteRequests.length,0);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'HEAD');assert.equal(h.calls[0].url.pathname,'/rest/v1/website_booking_requests');
 assert.equal(h.calls[0].url.searchParams.get('select'),'id');assert.equal(h.calls[0].url.searchParams.get('or'),'(status.is.null,status.eq.awaiting_review)');
 assert.equal(h.calls[0].url.searchParams.get('reviewed_at'),'is.null');assert.equal(h.calls[0].headers.get('prefer'),'count=exact');assert.deepEqual(h.badges,[3]);
});
test('returning to the app refreshes missed bookings even when planner refresh cannot run',async()=>{
 const h=harness();h.c.startCloudSync();await h.c.vectaWebsiteBookingCountPending;
 h.document.visibilityState='hidden';h.document.dispatchEvent(new h.document.defaultView.Event('visibilitychange'));
 h.live.count=2;h.document.visibilityState='visible';h.document.dispatchEvent(new h.document.defaultView.Event('visibilitychange'));
 h.timers.find(t=>t.ms===180).fn();await h.c.vectaWebsiteBookingCountPending;
 assert.equal(h.button.textContent,'Website Bookings (2)');assert.equal(h.calls.length,2);
});
test('visible safety polling repairs missed events without a fifteen-minute full reload',async()=>{
 const h=harness();h.c.startCloudSync();await h.c.vectaWebsiteBookingCountPending;
 h.live.count=4;h.intervals.find(t=>t.ms===60000).fn();await h.c.vectaWebsiteBookingCountPending;
 assert.equal(h.button.textContent,'Website Bookings (4)');assert.equal(h.calls.length,2);
 h.document.visibilityState='hidden';h.intervals[0].fn();assert.equal(h.calls.length,2);
});
test('realtime booking changes update just the count even while another screen is being edited',async()=>{
 const h=harness();await h.c.vectaRefreshWebsiteBookingCount();h.live.count=2;h.c.view='settings';
 h.c.scheduleCloudRefresh({table:'website_booking_requests',eventType:'INSERT',new:{id:'new',status:'awaiting_review'}});
 await h.c.vectaWebsiteBookingCountPending;
 assert.equal(h.button.textContent,'Website Bookings (2)');assert.equal(h.c.app.websiteRequests[0].id,'new');
 h.live.count=0;h.c.scheduleCloudRefresh({table:'website_booking_requests',eventType:'UPDATE',new:{id:'new',status:'booked'}});
 await h.c.vectaWebsiteBookingCountPending;
 assert.equal(h.button.textContent,'Website Bookings');assert.equal(h.badges.at(-1),0);
});
test('socket resubscription and network reconnection refresh the count',async()=>{
 const h=harness();h.c.startCloudSync();await h.c.vectaWebsiteBookingCountPending;
 h.live.count=2;h.subscription('SUBSCRIBED');await h.c.vectaWebsiteBookingCountPending;assert.equal(h.button.textContent,'Website Bookings (2)');
 h.live.count=3;await h.c.vectaHandleReconnect();await h.c.vectaWebsiteBookingCountPending;assert.equal(h.button.textContent,'Website Bookings (3)');
});
test('a change during a read cannot restore an outdated count and overlapping reads are serialised',async()=>{
 const h=harness();let release;h.live.fetch=()=>new Promise(resolve=>{release=resolve});
 const first=h.c.vectaRefreshWebsiteBookingCount();await tick();const second=h.c.vectaRefreshWebsiteBookingCount();
 assert.equal(first,second);assert.equal(h.calls.length,1);
 h.live.fetch=null;h.live.count=0;release(new Response(null,{status:200,headers:{'content-range':'*/1'}}));await first;
 assert.equal(h.calls.length,2);assert.equal(h.button.textContent,'Website Bookings');assert.deepEqual(h.badges,[0]);
});
test('failed counts retain the last confirmed value; offline and mechanics do not poll',async()=>{
 const h=harness();h.live.count=5;await h.c.vectaRefreshWebsiteBookingCount();
 h.live.error=true;assert.equal(await h.c.vectaRefreshWebsiteBookingCount(),false);assert.equal(h.button.textContent,'Website Bookings (5)');
 const before=h.calls.length;h.c.navigator.onLine=false;await h.c.vectaRefreshWebsiteBookingCount();assert.equal(h.calls.length,before);
 h.c.navigator.onLine=true;h.c.window.VECTA_MECHANIC_DEPLOYMENT=true;await h.c.vectaRefreshWebsiteBookingCount();assert.equal(h.calls.length,before);
});
test('cached pending requests remain available before an online count is known',()=>{
 const h=harness();h.c.app.websiteRequests=[{status:'awaiting_review',reviewed_at:'2026-11-12T12:00:00Z'},{status:'awaiting_review'},{status:null},{status:'booked'},{status:'contacted'},{status:'archived'},{status:'deleted'}];
 assert.equal(h.c.vectaPendingWebsiteBookingCount(),2);
});
test('local acceptance and request changes discard the pre-change remote count',()=>{
 for(const [start,end] of [['async function updateWebsiteRequest(','function websiteRequestNote('],['async function acceptWebsiteRequestJob(','async function deleteWebsiteRequestCompletely('],['async function deleteWebsiteRequestCompletely(','async function refreshWebsiteRequestsFromCloud('],['async function refreshWebsiteRequestsFromCloud(','function bindWebsiteRequests(']]){
  const source=html.slice(html.indexOf(start),html.indexOf(end));
  assert.match(source,/vectaWebsiteBookingCloudCount=null;vectaRefreshWebsiteBookingCount\(\)/);
 }
});

test('opening a website booking updates only its receipt and clears the confirmed count',async()=>{
 const h=harness();h.c.app.websiteRequests=[{id:'request-1',status:'awaiting_review'}];await h.c.vectaRefreshWebsiteBookingCount();
 const calls=[];h.c.vectaProgressRequest=async body=>{calls.push(body);h.live.count=0;return {requests:[{id:'request-1',reviewed_at:'2026-11-12T12:00:00Z'}]};};
 assert.equal(await h.c.window.vectaMarkWebsiteBookingRead({request_id:'request-1'}),true);
 assert.equal(calls[0].action,'booking-read');assert.equal(calls[0].request_id,'request-1');assert.equal(h.c.app.websiteRequests[0].status,'awaiting_review');
 assert.equal(h.button.textContent,'Website Bookings');assert.equal(h.badges.at(-1),0);
});
test('a failed booking receipt retains its alert and does not change booking status',async()=>{
 const h=harness();h.c.app.websiteRequests=[{id:'request-1',status:'awaiting_review'}];await h.c.vectaRefreshWebsiteBookingCount();
 h.c.vectaProgressRequest=async()=>{throw Error('Offline');};
 assert.equal(await h.c.window.vectaMarkWebsiteBookingRead({request_id:'request-1'}),false);
 assert.equal(h.button.textContent,'Website Bookings (1)');assert.equal(h.c.app.websiteRequests[0].reviewed_at,undefined);
});
