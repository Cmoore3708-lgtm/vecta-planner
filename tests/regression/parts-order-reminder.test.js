import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {pendingQuoteParts,recordQuotePartsOrder} from '../../lib/quote-parts-orders.js';
const job='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source=readFileSync('public/js/vecta-parts-reminder.js','utf8'),key='vecta:quote-parts:pending:v1';
const cards='<div class="job" data-job-id="'+job+'"><div class="plannerWorkRequired">Work to keep</div><span class="portalMessageBadge">1</span></div><div class="mobileJob" data-open-job="'+job+'"></div><button class="sideJob" data-open-job="'+job+'"></button>';
function setup({storage=new Map(),server=new Map([[a,null]]),online=true,mechanic=false}={}){
 const dom=parseHTML('<html><body><main class="main">'+cards+'</main></body></html>'),document=dom.document,window=new dom.window.EventTarget();
 Object.assign(window,{Event:dom.window.Event,VECTA_MECHANIC_DEPLOYMENT:mechanic});document.readyState='complete';document.hidden=false;
 const navigator={onLine:online},timers=[],calls=[],state={fail:false,hold:null};
 const fetch=async(url,{body})=>{const request=JSON.parse(body);calls.push(request);if(state.fail)throw Error('Save failed');
  if(request.action==='parts-order-queue'){const rows=[...server].filter(([,id])=>!id).map(([approval_id])=>({approval_id,job_id:job}));if(state.hold)await state.hold;return {ok:true,json:async()=>({reminders:rows})};}
  const mine=[];for(const id of request.approval_ids){if(request.undo){if(server.get(id)===request.order_id)server.set(id,null);}else if(!server.get(id)||server.get(id)===request.order_id){server.set(id,request.order_id);mine.push(id);}}
  return {ok:true,json:async()=>({confirmed_ids:request.approval_ids,undo_ids:mine})};
 };
 vm.runInNewContext(source,{document,window,navigator,MutationObserver:dom.window.MutationObserver,location:{search:''},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto,fetch,AbortSignal,setInterval:fn=>timers.push(fn)});
 return {document,window,navigator,state,storage,server,calls,badges:()=>[...document.querySelectorAll('.partsOrderBadge')],poll:async()=>{await timers[0]?.();await tick();},click:async el=>{el.dispatchEvent(new dom.window.Event('click',{bubbles:true,cancelable:true}));await tick();}};
}
test('the separate reminder survives forwarding/read changes and clears across devices only after confirmed ordering',async()=>{
 const server=new Map([[a,null]]),pc=setup({server}),phone=setup({server});await tick();
 assert.equal(pc.badges().length,3);assert.equal(pc.document.querySelector('button.sideJob .partsOrderBadge').tagName,'SPAN');
 pc.window.dispatchEvent(new pc.window.Event('vecta-portal-changed'));await tick();assert.equal(pc.badges().length,3);
 let opened=0;pc.document.querySelector('.job').addEventListener('click',()=>opened++);await pc.click(pc.badges()[0]);
 assert.equal(opened,0);assert.equal(pc.badges().length,0);assert.ok(pc.document.querySelector('.portalMessageBadge'),'ordering does not dismiss customer messages');
 await phone.poll();assert.equal(phone.badges().length,0);
 server.set(b,null);await pc.poll();assert.equal(pc.badges().length,3,'newly authorised quote brings the warning back');
 const undo=[...pc.document.querySelectorAll('.partsOrderNotice button')].find(el=>el.textContent==='Undo');await pc.click(undo);await phone.poll();
 assert.equal(server.get(a),null);assert.equal(server.get(b),null);assert.equal(phone.badges().length,3);
 assert.doesNotMatch(pc.storage.get(key),/registration|price|description/);
});
test('offline reopen and failed saves preserve warnings; a stale in-flight poll cannot resurrect a cleared one',async()=>{
 const h=setup();await tick();const offline=setup({storage:h.storage,online:false});await tick();assert.equal(offline.badges().length,3);assert.equal(offline.calls.length,0);await offline.click(offline.badges()[0]);assert.equal(offline.badges().length,3);
 h.state.fail=true;await h.click(h.badges()[0]);assert.equal(h.badges().length,3);h.state.fail=false;
 let release;h.state.hold=new Promise(resolve=>release=resolve);const polling=h.poll();await tick();await h.click(h.badges()[0]);assert.equal(h.badges().length,0);release();await polling;assert.equal(h.badges().length,0);
 const writes=h.calls.filter(c=>c.action==='parts-order-save');assert.equal(writes[0].order_id,writes[1].order_id,'uncertain saves retry the same operation');
});
test('rerenders paint one badge per card, while mechanics never load ordering data',async()=>{
 const h=setup();await tick();h.document.querySelector('main').innerHTML=cards;await tick();await h.poll();assert.equal(h.badges().length,3);
 const mechanic=setup({mechanic:true});await tick();assert.equal(mechanic.badges().length,0);assert.equal(mechanic.calls.length,0);
});
test('queue is approval-specific, excludes reassigned customers, and validates cursors and write payloads',async()=>{
 let url;const row={id:a,job_id:job,registration:'TEST001',customer_email:'driver@example.invalid',jobs:{id:job,registration:'TEST 001',customer_email:'driver@example.invalid'}};
 const result=await pendingQuoteParts(async path=>{url=new URL(path,'https://example.invalid');return [row,{...row,id:b,customer_email:'other@example.invalid'}];});
 assert.deepEqual(result.reminders,[{approval_id:a,job_id:job}]);assert.equal(url.searchParams.get('progress_parts_ordered_at'),'is.null');assert.equal(url.searchParams.get('status'),'eq.approved');
 await assert.rejects(pendingQuoteParts(()=>assert.fail('must not query'),'bad'),/Invalid/);
 await assert.rejects(recordQuotePartsOrder(()=>assert.fail('must not write'),{job_id:job,approval_ids:[a,a],order_id:b,undo:false}),/Choose/);
 await assert.rejects(recordQuotePartsOrder(async()=>({code:409,error:'Changed elsewhere'}),{job_id:job,approval_ids:[a],order_id:b,undo:false}),/Changed elsewhere/);
});
