import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const html=readFileSync('index.html','utf8');
const notificationSource=readFileSync('public/js/vecta-device-notifications.js','utf8')+html.slice(html.indexOf('function vectaBase64UrlBytes('),html.indexOf('function navItems('));
const portalSource=readFileSync('public/js/vecta-portal-workshop.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function notifications({permission='granted',existing=true,legacyFlag=false}={}){
 const {window,document}=parseHTML('<html><body><button id="enableBookingAlerts"></button><textarea>Unsaved work</textarea></body></html>');
 const requests=[],alerts=[],storage=new Map(legacyFlag?[['vecta:booking-alerts-enabled','1']]:[]),live={fail:false,clock:100000,creates:0,prompts:0};
 const subscription={endpoint:'https://push.example.invalid/device',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'public-test',auth:'test'}};}};
 let saved=existing?subscription:null;
 const Notification={permission,requestPermission:async()=>{live.prompts++;Notification.permission='granted';return 'granted';}};
 window.Notification=Notification;window.PushManager=function(){};
 const c={window,document,Notification,Event:window.Event,Uint8Array,atob,AbortSignal,
  Date:{now:()=>live.clock},console:{warn(){},error(){}},alert:text=>alerts.push(text),
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  navigator:{onLine:true,serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>saved,subscribe:async()=>{live.creates++;return saved=subscription;}}})}},
  vectaWithTimeout:async value=>value,vectaUpdateAppBadge:async()=>{},render(){throw Error('Must preserve the open editor');},
  fetch:async(url,options)=>{requests.push({url,options});return {ok:!live.fail,json:async()=>live.fail?{error:'Connection unavailable'}:url==='/api/push-config'?{publicKey:'AQID'}:{ok:true}};}
 };
 vm.runInNewContext(notificationSource,c);
 return {c,window,document,requests,alerts,live,storage};
}

test('previously permitted devices reconnect on reopen without a permission prompt or test push',async()=>{
 for(const legacyFlag of [false,true]){
  const h=notifications({legacyFlag});
  assert.equal(h.c.vectaBookingAlertsState().status,'reconnecting','a saved flag alone is not current server confirmation');
  assert.equal(await h.c.vectaMaintainBookingAlerts(),true);
  assert.equal(h.c.vectaBookingAlertsState().status,'enabled');assert.equal(h.live.prompts,0);assert.equal(h.live.creates,0);
  assert.deepEqual(h.requests.map(r=>r.url),['/api/push-config','/api/push-subscribe']);
  assert.equal(h.requests[1].options.credentials,'same-origin');assert.equal(h.alerts.length,0);
  assert.equal(h.document.querySelector('textarea').value,'Unsaved work');
  await h.c.vectaMaintainBookingAlerts();assert.equal(h.requests.length,2,'normal inbox polling must not hammer subscription storage');
  await h.c.vectaMaintainBookingAlerts(true);assert.equal(h.requests.length,4,'online recovery refreshes the saved subscription');
 }
});
test('a missing subscription is restored once and concurrent requests share the work',async()=>{
 const h=notifications({existing:false});await Promise.all([h.c.vectaMaintainBookingAlerts(),h.c.vectaMaintainBookingAlerts(true)]);
 assert.equal(h.live.creates,1);assert.equal(h.live.prompts,0);assert.equal(h.requests.length,2);
});
test('failed registration and offline startup recover without incorrectly claiming enabled',async()=>{
 const h=notifications({legacyFlag:true});h.c.navigator.onLine=false;
 assert.equal(await h.c.vectaMaintainBookingAlerts(),false);assert.equal(h.requests.length,0);
 h.c.navigator.onLine=true;h.live.fail=true;assert.equal(await h.c.vectaMaintainBookingAlerts(true),false);
 assert.equal(h.c.vectaBookingAlertsState().status,'reconnecting');assert.equal(h.document.getElementById('enableBookingAlerts').disabled,false);
 h.live.fail=false;await h.c.vectaMaintainBookingAlerts();assert.equal(h.requests.length,1,'failures back off');
 h.live.clock+=31000;assert.equal(await h.c.vectaMaintainBookingAlerts(),true);assert.equal(h.c.vectaBookingAlertsState().status,'enabled');
 assert.equal(h.live.prompts,0);assert.equal(h.alerts.length,0);
});
test('automatic setup respects blocked and not-yet-granted permission even with the old enabled flag',async()=>{
 for(const permission of ['default','denied']){
  const h=notifications({permission,legacyFlag:true});assert.equal(await h.c.vectaMaintainBookingAlerts(),false);
  assert.equal(h.requests.length,0);assert.equal(h.live.prompts,0);assert.equal(h.document.getElementById('enableBookingAlerts').disabled,false);
  assert.equal(h.c.vectaBookingAlertsState().status,permission==='default'?'permission':'blocked');
 }
});
test('only the explicit setup click requests permission and sends a test; repeat setup never re-prompts',async()=>{
 const h=notifications({permission:'default',existing:false});
 assert.equal(await h.c.vectaEnableBookingAlerts(),true);assert.equal(h.live.prompts,1);assert.equal(h.live.creates,1);
 assert.equal(h.requests.filter(r=>r.url==='/api/push-test').length,1);
 assert.equal(await h.c.vectaEnableBookingAlerts(),true);assert.equal(h.live.prompts,1);
 assert.equal(h.document.querySelector('textarea').value,'Unsaved work');
 h.c.Notification.permission='denied';assert.equal(await h.c.vectaMaintainBookingAlerts(),false);
 assert.equal(h.c.vectaBookingAlertsState().status,'blocked');
});

function portal(mechanic=false){
 const {window,document}=parseHTML('<html><body><main class="main"><header class="top"></header></main><div id="jobModal"><section class="jobWorkSection"></section></div></body></html>');
 document.hidden=false;document.readyState='complete';
 const timers=[],maintenance=[],live={events:[],state:{status:'enabled',canEnable:false,message:''},enabled:0};
 window.VECTA_MECHANIC_DEPLOYMENT=mechanic;
 window.vectaPortalAlertsState=()=>live.state;
 window.vectaMaintainPortalAlerts=force=>{maintenance.push(force);return Promise.resolve(true);};
 window.vectaEnablePortalAlerts=async()=>{live.enabled++;live.state={status:'enabled',canEnable:false,message:''};window.dispatchEvent(new window.Event('vecta-notification-state'));};
 const c={window,document,navigator:{onLine:true},location:{search:''},crypto:{randomUUID:()=> 'synthetic-message'},Intl,Date,URLSearchParams,AbortSignal,Event:window.Event,
  localStorage:{getItem:()=>null},setInterval:(fn,ms)=>timers.push({fn,ms}),
  fetch:async(_url,{body})=>({ok:true,json:async()=>JSON.parse(body).action==='portal-job'?{events:live.events,alerts:[],older_cursor:null}:JSON.parse(body).action==='portal-queue'?{events:[]}:{whatsapp:null}})
 };
 vm.runInNewContext(portalSource,c);window.VectaPortalWorkshop.mount(document.getElementById('jobModal'),{id:'test-job'},true);
 return {window,document,live,timers,maintenance};
}
test('empty workshop and mechanic conversations stay one line through repeated polling and message changes',async()=>{
 for(const mechanic of [false,true]){
  const h=portal(mechanic);await tick();const panel=h.document.querySelector('.portalWorkshop');
  const draft=panel.querySelector('textarea');if(draft)draft.value='Do not lose this draft';
  const poll=h.timers.find(t=>t.ms===15000).fn;
  for(let i=0;i<24;i++){poll();await tick();}
  assert.equal(panel.querySelectorAll('.portalWorkshopEmpty').length,1);
  assert.equal((panel.textContent.match(mechanic?/No office messages or approvals yet\./g:/No messages yet\./g)||[]).length,1);
  h.live.events=[{id:'message-1',actor:'workshop',kind:'message',created_at:'2026-11-10T12:00:00Z',message:'A real update'}];
  poll();await tick();assert.equal(panel.querySelectorAll('.portalWorkshopEmpty').length,0);assert.equal(panel.querySelectorAll('.portalWorkshopEvent').length,1);
  poll();await tick();assert.equal(panel.querySelectorAll('.portalWorkshopEvent').length,1);
  h.live.events=[];poll();await tick();assert.equal(panel.querySelectorAll('.portalWorkshopEmpty').length,1);
  if(draft)assert.equal(draft.value,'Do not lose this draft');
 }
});
test('notification setup disappears after connection and startup/online/returning trigger quiet maintenance',async()=>{
 const h=portal();await tick();const controls=h.document.querySelector('.portalDeviceNotifications');
 assert.equal(controls.hidden,true);assert.equal(h.live.enabled,0);assert.ok(h.maintenance.length>0);
 h.live.state={status:'permission',canEnable:true,message:'Allow once'};h.window.dispatchEvent(new h.window.Event('vecta-notification-state'));
 assert.equal(controls.hidden,false);assert.equal(controls.querySelector('button').hidden,false);
 await controls.querySelector('button').onclick();assert.equal(controls.hidden,true);assert.equal(h.live.enabled,1);
 const count=h.maintenance.length;h.window.dispatchEvent(new h.window.Event('online'));await tick();assert.ok(h.maintenance.slice(count).includes(true));
 h.document.dispatchEvent(new h.window.Event('visibilitychange'));await tick();assert.ok(h.maintenance.length>count+1);
 h.live.state={status:'blocked',canEnable:false,message:'Allow in device settings'};h.window.dispatchEvent(new h.window.Event('vecta-notification-state'));
 assert.equal(controls.hidden,false);assert.equal(controls.querySelector('button').hidden,true);assert.match(controls.textContent,/device settings/);
});
