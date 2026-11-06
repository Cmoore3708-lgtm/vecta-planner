import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const queue=readFileSync('public/js/vecta-review-queue.js','utf8');
const photos=readFileSync('public/js/vecta-workshop-photos.js','utf8');
const source=readFileSync('index.html','utf8');
const bridge=source.slice(source.indexOf('window.vectaOpenFindingJob='),source.indexOf('/* Read-only booking lookup'));
const job={id:'00000001-0000-4000-8000-000000000001',registration:'TEST001',status:'in_progress'};
const first={id:'00000002-0000-4000-8000-000000000001',job_id:job.id,registration:job.registration,
 message:'Inner shoulder worn',status:'awaiting_price',mechanic_photo:true,photo_ids:['00000003-0000-4000-8000-000000000001']};
const second={...first,id:'00000002-0000-4000-8000-000000000002',message:'Second finding',photo_ids:['00000003-0000-4000-8000-000000000002']};
const signed=id=>'https://brqsejjykrubxuofavuu.supabase.co/storage/v1/object/sign/job-workshop-photos/'+id+'.jpg?token=sample';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function app(seen=new Map(),mechanic=false){
 const {document,window:dom}=parseHTML('<html><body><main class="main"><header class="top"></header></main><div class="modal" id="jobModal"></div><div class="modal" id="other"></div></body></html>');
 let jobs=[job],mounted=0,openedId='',scrolls=0,interval,alerts=[],requests=[];
 const events={};
 const window={VECTA_MECHANIC_DEPLOYMENT:mechanic,addEventListener(type,fn){events[type]=fn;},dispatchEvent(event){events[event.type]?.();}};
 const modal=document.getElementById('jobModal');
 dom.HTMLElement.prototype.scrollIntoView=function(){scrolls++;};
 window.openJobModal=id=>{
  mounted++;openedId=id;ctx.editingJobId=id;modal.classList.add('open');modal.innerHTML='<section class="jobWorkSection"></section>';
  window.VectaWorkshopPhotos.mount(modal,job,true);
 };
 const ctx=vm.createContext({document,window,app:{jobs},editingJobId:null,
  vectaPrimeJobsFromCloud:async()=>{},navigator:{onLine:true},MutationObserver:dom.MutationObserver,AbortSignal,Event:dom.Event,
  localStorage:{getItem:k=>seen.get(k),setItem:(k,v)=>seen.set(k,v)},setInterval(fn){interval=fn;},setTimeout(){},clearTimeout(){},
  fetch:async(_url,opt)=>{
   const b=JSON.parse(opt.body);requests.push(b.action);
   if(b.action==='approval-queue')return Response.json({findings:alerts});
   assert.equal(b.job_id,job.id);
   if(b.action==='approval-list')return Response.json({approvals:[first,second]});
   if(b.action==='photos-list')return Response.json({photos:[first,second].map(f=>({id:f.photo_ids[0],review_id:f.id,private_finding:true,caption:f.message,url:signed(f.photo_ids[0])}))});
   throw Error('Unexpected action '+b.action);
  }
 });
 vm.runInContext(photos,ctx);vm.runInContext(bridge,ctx);vm.runInContext(queue,ctx);
 return {document,window,modal,ctx,requests,get mounted(){return mounted;},get opened(){return openedId;},get scrolls(){return scrolls;},
  setRows(rows){alerts=rows;},async poll(){await interval?.();await flush();},
  get popup(){return document.querySelector('.mechanicPhotoAlert');},
  get action(){return document.querySelector('.findingAlertOpen');}};
}

test('click opens the matching saved job, focuses the specific finding with only its photos, and remembers acknowledgement',async()=>{
 const seen=new Map(),ui=app(seen);await flush();
 ui.setRows([{...second,mechanic_photo:false},{...first,id:'note-only',photo_ids:[]},first,second]);
 await ui.poll();
 assert.equal(ui.popup.hidden,false);assert.match(ui.action.textContent,/TEST001/);assert.match(ui.action.textContent,/Inner shoulder/);
 await ui.action.onclick();await flush();
 assert.equal(ui.opened,job.id);assert.equal(ui.mounted,1);assert.ok(ui.scrolls);
 const focused=ui.modal.querySelector('.findingDestination');
 assert.equal(focused.hidden,false);assert.match(focused.textContent,/Inner shoulder worn/);
 assert.equal(focused.querySelector('[data-finding-evidence] img').src,signed(first.photo_ids[0]));
 assert.equal(focused.querySelectorAll('[data-finding-evidence] img').length,1);
 assert.doesNotMatch(focused.textContent,/Second finding/);
 assert.match(ui.action.textContent,/Second finding/);
 await ui.action.onclick();await flush();
 assert.equal(ui.mounted,1,'do not reopen an existing job and lose edits');
 assert.match(focused.textContent,/Second finding/);
 assert.equal(ui.popup.hidden,true);
 const reloaded=app(seen);await flush();reloaded.setRows([first,second]);await reloaded.poll();
 assert.equal(reloaded.popup.hidden,true);
 assert.ok(ui.requests.every(action=>['approval-queue','photos-list','approval-list'].includes(action)));
});

test('dismissing an alert preserves the pricing queue; a different open editor stays intact until it is closed',async()=>{
 const ui=app();await flush();ui.setRows([first,second]);await ui.poll();
 ui.popup.querySelector('.findingAlertDismiss').click();
 assert.match(ui.action.textContent,/Second finding/);assert.match(ui.document.querySelector('.findingQueue').textContent,/findings to price \(2\)/);
 const other=ui.document.getElementById('other');other.classList.add('open');other.innerHTML='<input value="unsaved">';
 await ui.action.onclick();assert.equal(ui.mounted,0);assert.match(ui.popup.textContent,/Finish or close/);
 other.classList.remove('open');await flush();await flush();
 assert.equal(ui.mounted,1);assert.equal(ui.popup.hidden,true);
});
test('mechanics never install dashboard alerts; completed findings disappear on the next poll',async()=>{
 const mechanic=app(new Map(),true);await flush();assert.equal(mechanic.popup,null);assert.deepEqual(mechanic.requests,[]);
 const manager=app();await flush();manager.setRows([first]);await manager.poll();manager.setRows([]);await manager.poll();
 assert.equal(manager.popup.hidden,true);
});
