import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const helper=fs.readFileSync('public/js/vecta-device-notifications.js','utf8');
const bridge=html.slice(html.indexOf('var vectaBookingReceipts='),html.indexOf('function vectaBase64UrlBytes('));
const sync=html.slice(html.indexOf('function startCloudSync(){'),html.indexOf('async function vectaHandleReconnect(){'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function setup(mechanic=false){
 const fixture={requests:[{id:'request-1',status:'awaiting_review'}],queries:0,saves:0,subscriptions:0,count:3,fail:false,latest:null,badges:[],readCalls:[]};
 const button={textContent:'Website Bookings'};
 const channel={on(){return this},subscribe(){fixture.subscriptions++;return this}};
 fixture.client={from(table){
  assert.equal(table,'website_booking_requests');fixture.queries++;
  const query={select(columns,options){assert.equal(columns,'id');assert.equal(options.head,true);return this},or(){return this},is(){return this},then(resolve,reject){return Promise.resolve(fixture.fail?{error:Error('count unavailable')}:{count:fixture.count}).then(resolve,reject)}};
  return query;
 },channel(){return channel},removeChannel(){}};
 fixture.request=async body=>{fixture.readCalls.push(body);fixture.count=0;return {requests:[{id:'request-1',reviewed_at:'2026-11-13T10:30:00Z'}]}};
 const context={fixture,window:{VECTA_MECHANIC_DEPLOYMENT:mechanic,addEventListener(){}},navigator:{onLine:true,setAppBadge:async n=>fixture.badges.push(n),clearAppBadge:async()=>fixture.badges.push(0)},document:{visibilityState:'visible',querySelector:()=>button,addEventListener(){}},console:{log(){},warn(){}},setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){}};
 vm.createContext(context);
 // The helper executes globally, before the app's private closure, as deployed.
 vm.runInContext(helper,context);
 const create=context.window.createVectaBookingReceipts;
 context.window.createVectaBookingReceipts=api=>{
  const receipts=create(api),refresh=receipts.refresh;
  receipts.refresh=()=>{fixture.latest=refresh();return fixture.latest};
  return receipts;
 };
 vm.runInContext('(function(){\n'+
  'var remoteClient=fixture.client,app={websiteRequests:fixture.requests};\n'+
  'var cloudSyncChannel=null,cloudSyncTimer=null,cloudLastRefreshAt=0;\n'+
  'function saveLocal(){fixture.saves++} function uid(){return "scope-test"}\n'+
  'function vectaProgressRequest(body){return fixture.request(body)}\n'+
  'function vectaWithTimeout(query){return Promise.resolve(query)}\n'+
  'function scheduleCloudRefresh(){} function refreshCloudAndRender(){} function refreshPlannerCoreFromCloudAndRender(){}\n'+
  bridge+'\n'+sync+'\n'+
  'fixture.api={start:startCloudSync,refresh:vectaRefreshWebsiteBookingCount,count:vectaPendingWebsiteBookingCount,replaceClient:value=>{remoteClient=value},invalidate:()=>vectaBookingReceipts.invalidate()};\n'+
  '})();',context);
 return {fixture,context,button};
}

test('production private scope starts live sync and refreshes booking counts without false offline failure',async()=>{
 const h=setup();
 assert.equal(h.context.remoteClient,undefined);assert.equal(h.context.app,undefined);
 assert.equal(h.context.window.remoteClient,undefined);assert.equal(h.context.vectaWithTimeout,undefined);
 assert.doesNotThrow(()=>h.fixture.api.start());
 await h.fixture.latest;
 assert.equal(h.fixture.subscriptions,1);
 assert.equal(h.fixture.queries,1);
 assert.equal(h.button.textContent,'Website Bookings (3)');
 assert.deepEqual(h.fixture.badges,[3]);
});

test('booking receipts cross the same private bridge and update only reviewed status',async()=>{
 const h=setup();await h.fixture.api.refresh();
 assert.equal(await h.context.window.vectaMarkWebsiteBookingRead({request_id:'request-1'}),true);
 assert.equal(h.fixture.readCalls[0].action,'booking-read');
 assert.equal(h.fixture.requests[0].status,'awaiting_review');
 assert.equal(h.fixture.requests[0].reviewed_at,'2026-11-13T10:30:00Z');
 assert.equal(h.fixture.saves,1);assert.equal(h.button.textContent,'Website Bookings');
});

test('optional booking count failure cannot throw out of live sync startup',async()=>{
 const h=setup();h.fixture.fail=true;
 assert.doesNotThrow(()=>h.fixture.api.start());await h.fixture.latest;
 assert.equal(h.fixture.subscriptions,1);assert.equal(h.fixture.api.count(),1);
 h.fixture.fail=false;await h.fixture.api.refresh();
 assert.equal(h.fixture.api.count(),3);
});

test('reconnection uses the current private client and mechanics do not read owner booking counts',async()=>{
 const h=setup();h.fixture.api.replaceClient(null);
 assert.equal(await h.fixture.api.refresh(),false);assert.equal(h.fixture.queries,0);
 h.fixture.api.replaceClient(h.fixture.client);await h.fixture.api.refresh();assert.equal(h.fixture.queries,1);
 const mechanic=setup(true);mechanic.fixture.api.start();await tick();
 assert.equal(mechanic.fixture.queries,0);assert.equal(mechanic.fixture.subscriptions,1);
 assert.equal(await mechanic.context.window.vectaMarkWebsiteBookingRead({request_id:'request-1'}),false);
 assert.equal(mechanic.fixture.saves,0);
});
