import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {portalQueue} from '../../lib/customer-portal.js';

const source=readFileSync('public/js/vecta-portal-workshop.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const message=(id='m1',job_id='j1')=>({id,job_id,actor:'customer',kind:'message',message:'Please call before replacing the parts.',registration:'TEST001',created_at:'2026-11-11T12:00:00Z'});
const cards='<div class="job" data-job-id="j1"><div class="plannerWorkRequired">Keep the full job description readable</div></div><div class="mobileJob" data-open-job="j1"></div><div class="sideJob" data-job-id="j1" data-open-unallocated="j1"></div><button class="sideJob" data-open-job="j1"></button><div class="job" data-job-id="other"></div>';
function setup({mechanic=false,storage=new Map(),online=true}={}){
 const {window,document}=parseHTML('<html><body><main class="main"><header class="top"></header><section id="cards">'+cards+'</section></main><div id="jobModal"><section class="jobWorkSection"></section></div></body></html>');
 document.hidden=false;document.readyState='complete';
 const state={queue:[message()],messages:[message()],open:'open',fail:false,storageFail:false,scrolled:0,alerts:[],opened:[]},calls=[],timers=[];
 window.VECTA_MECHANIC_DEPLOYMENT=mechanic;window.vectaRefreshPortalJobs=async()=>true;
 window.vectaOpenFindingJob=async id=>{state.opened.push(id);if(state.open==='open'&&!document.querySelector('.portalWorkshop'))window.VectaPortalWorkshop.mount(document.getElementById('jobModal'),{id},true);return state.open;};
 window.alert=message=>state.alerts.push(message);window.HTMLElement.prototype.scrollIntoView=function(){state.scrolled++;};
 const navigator={onLine:online};
 vm.runInNewContext(source,{window,document,location:{search:''},navigator,MutationObserver:window.MutationObserver,Intl,Date,Event:window.Event,URLSearchParams,AbortSignal,crypto:{randomUUID:()=> 'draft'},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{if(state.storageFail)throw Error('Storage blocked');storage.set(k,v);}},
  setInterval:(fn,ms)=>timers.push({fn,ms}),fetch:async(_url,{body})=>{const b=JSON.parse(body);calls.push(b);if(state.fail)throw Error('Offline');return {ok:true,json:async()=>b.action==='portal-queue'?{events:state.queue}:b.action==='portal-job'?{events:state.messages,older_cursor:null}:{} };}
 });
 return {window,document,navigator,state,storage,calls,async poll(){await timers.find(t=>t.ms===10000).fn();await tick();},async refresh(){timers.find(t=>t.ms===15000).fn();await tick();},badges:()=>[...document.querySelectorAll('.portalMessageBadge')],mark:()=>document.querySelector('.portalMarkRead'),click:async el=>{el.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));await tick();}};
}

test('correct cards show distinct incoming counts; re-rendering never duplicates the badge or nests a button',async()=>{
 const h=setup();h.state.queue=[message(),message(),message('m2'),{...message('reply'),actor:'workshop'}];await h.poll();
 assert.equal(h.document.querySelector('.plannerWorkRequired').classList.contains('portalMessageText'),true);
 assert.equal(h.badges().length,4);for(const badge of h.badges())assert.match(badge.getAttribute('aria-label'),/^2 unread customer messages/);
 assert.equal(h.document.querySelector('[data-job-id="other"] .portalMessageBadge'),null);
 assert.equal(h.document.querySelector('button.sideJob .portalMessageBadge').tagName,'SPAN');
 for(let i=0;i<3;i++){h.document.getElementById('cards').innerHTML=cards;await tick();assert.equal(h.badges().length,4);}
 await h.poll();assert.equal(h.badges().length,4);
});
test('dismissing a popup or opening the job keeps the badge until explicitly marked read; new messages restore it',async()=>{
 const h=setup();await tick();
 const dismiss=[...h.document.querySelectorAll('.portalWorkshopPopup>button')].find(b=>b.textContent==='Dismiss');await dismiss.onclick();await tick();
 assert.equal(h.badges().length,4);assert.equal(h.document.querySelector('.portalWorkshopPopup').hidden,true);
 let cardClicks=0;h.badges()[0].parentElement.addEventListener('click',()=>cardClicks++);
 await h.click(h.badges()[0]);assert.equal(cardClicks,0);assert.deepEqual(h.state.opened,['j1']);assert.equal(h.state.scrolled,1);assert.equal(h.badges().length,4);
 const draft=h.document.querySelector('textarea');draft.value='Keep my unsent reply';
 h.mark().onclick();await tick();assert.equal(h.badges().length,0);assert.equal(h.document.querySelector('.plannerWorkRequired').classList.contains('portalMessageText'),false);assert.equal(h.mark().hidden,true);assert.equal(draft.value,'Keep my unsent reply');
 await h.poll();assert.equal(h.badges().length,0);
 h.state.queue.push(message('m2'));await h.poll();assert.equal(h.badges().length,4);assert.match(h.badges()[0].title,/^1 unread/);
 // A message absent from the displayed conversation cannot be marked read.
 h.mark().onclick();await tick();assert.equal(h.badges().length,4);
 h.state.messages.push(message('m2'));await h.refresh();h.mark().onclick();await tick();assert.equal(h.badges().length,0);
 const reopened=setup({storage:h.storage});await tick();assert.equal(reopened.badges().length,0);
});
test('busy editors, failed opens, failed requests and failed storage do not clear unread alerts',async()=>{
 const h=setup();await tick();
 for(const state of ['busy','missing']){h.state.open=state;await h.click(h.badges()[0]);assert.equal(h.badges().length,4);}
 assert.match(h.state.alerts[0],/Save or close/);assert.match(h.state.alerts[1],/could not be opened/);
 h.state.fail=true;await h.poll();assert.equal(h.badges().length,4);
 h.state.fail=false;h.state.open='open';await h.click(h.badges()[0]);h.state.storageFail=true;h.mark().onclick();
 assert.equal(h.badges().length,4);assert.match(h.document.querySelector('.portalWorkshop').textContent,/Unable to save the read status/);
});
test('cached unread indicators survive offline reload and clear only after a successful live queue replacement',async()=>{
 const h=setup();await tick();const offline=setup({storage:h.storage,online:false});await tick();
 assert.equal(offline.badges().length,4);assert.equal(offline.calls.length,0);
 assert.doesNotMatch(h.storage.get('vecta:portal:inbox:manager'),/Please call|TEST001/,'cache contains only alert IDs, never message content or customer identity');
 offline.navigator.onLine=true;offline.state.queue=[];await offline.poll();assert.equal(offline.badges().length,0);
});
test('read status is separate for mechanics and updates other tabs on the same device',async()=>{
 const storage=new Map([['vecta:portal:read:manager','["m1"]']]);const h=setup({mechanic:true,storage});
 h.state.queue=[{...message(),forwarded:true},message('not-forwarded')];await h.poll();
 assert.equal(h.badges().length,4);assert.match(h.badges()[0].title,/^1 unread office update/);
 storage.set('vecta:portal:read:mechanic','["m1"]');const event=new h.window.Event('storage');event.key='vecta:portal:read:mechanic';h.window.dispatchEvent(event);await tick();assert.equal(h.badges().length,0);
});
test('queue pagination retains older messages and validates page cursors before accessing the database',async()=>{
 const rows=Array.from({length:251},(_,i)=>({...message('m'+i),seq:251-i,customer_email:'driver@example.invalid'}));const calls=[];
 const db=async path=>{const u=new URL(path,'https://example.invalid');calls.push(u);if(u.pathname==='/customer_portal_events'){const before=Number(u.searchParams.get('seq')?.slice(3)||Infinity);return rows.filter(r=>r.seq<before).slice(0,Number(u.searchParams.get('limit')));}return [{id:'j1',registration:'TEST001',customer_email:'driver@example.invalid'}];};
 const first=await portalQueue(db);assert.equal(first.events.length,250);assert.equal(first.older_cursor,'2');
 const last=await portalQueue(db,'manager',undefined,first.older_cursor);assert.equal(last.events.length,1);assert.equal(last.events[0].id,'m250');assert.equal(last.older_cursor,null);
 assert.equal(calls[0].searchParams.get('manager_alert'),'eq.true');
 await assert.rejects(portalQueue(()=>{throw Error('Must not query');},'manager',undefined,'invalid'),/Invalid notification page/);
});
