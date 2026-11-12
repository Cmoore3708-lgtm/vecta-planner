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
function app(seen=new Map(),mechanic=false,extraPhotos=[]){
 const {document,window:dom}=parseHTML('<html><body><main class="main"><header class="top"></header></main><div class="modal" id="jobModal"></div><div class="modal" id="other"></div></body></html>');
 let jobs=[job],mounted=0,openedId='',scrolls=0,interval,alerts=[],decisions=[],notes=[],approvalRows=[first,second],requests=[];
 const events={};
 const window={VECTA_MECHANIC_DEPLOYMENT:mechanic,addEventListener(type,fn){events[type]=fn;},dispatchEvent(event){events[event.type]?.();}};
 window.vectaWorkshopNoteAlerts=()=>notes;
 const modal=document.getElementById('jobModal');
 dom.HTMLElement.prototype.scrollIntoView=function(){scrolls++;};
 window.openJobModal=id=>{
  mounted++;openedId=id;ctx.editingJobId=id;modal.classList.add('open');modal.innerHTML='<section class="jobWorkSection"></section><section class="jobInternalNotesSection"><textarea id="job_internal_workshop_notes">Private note</textarea></section>';
  window.VectaWorkshopPhotos.mount(modal,job,true);
 };
 const ctx=vm.createContext({document,window,app:{jobs},editingJobId:null,
  vectaPrimeJobsFromCloud:async()=>{},navigator:{onLine:true},MutationObserver:dom.MutationObserver,AbortSignal,Event:dom.Event,
  localStorage:{getItem:k=>seen.get(k),setItem:(k,v)=>seen.set(k,v)},setInterval(fn){interval=fn;},setTimeout(){},clearTimeout(){},
  fetch:async(_url,opt)=>{
   const b=JSON.parse(opt.body);requests.push(b.action);
   if(['approval-queue','approval-decisions'].includes(b.action))return Response.json({findings:alerts,decisions});
   assert.equal(b.job_id,job.id);
   if(b.action==='approval-list')return Response.json({approvals:approvalRows});
   if(b.action==='photos-list')return Response.json({photos:[...approvalRows.filter(f=>f.photo_ids.length).map(f=>({id:f.photo_ids[0],review_id:f.id,private_finding:f.status==='awaiting_price',caption:f.message,url:signed(f.photo_ids[0])})),...extraPhotos]});
   throw Error('Unexpected action '+b.action);
  }
 });
 vm.runInContext(photos,ctx);vm.runInContext(bridge,ctx);vm.runInContext(queue,ctx);
 return {document,window,modal,ctx,requests,get mounted(){return mounted;},get opened(){return openedId;},get scrolls(){return scrolls;},
  setRows(rows){alerts=rows;},setNotes(rows){notes=rows;},setDecisions(rows){decisions=rows;},setApprovalRows(rows){approvalRows=rows;},async poll(){await interval?.();await flush();},
  get popup(){return document.querySelector('.mechanicPhotoAlert');},
  get action(){return document.querySelector('.findingAlertOpen');}};
}

test('opening a Workshop job directly pairs each private thumbnail with its own note and price field',async()=>{
 const orphanId='00000003-0000-4000-8000-000000000003',publicId='00000003-0000-4000-8000-000000000004';
 const ui=app(new Map(),false,[
  {id:orphanId,private_finding:true,review_id:'unfinished',caption:'',url:signed(orphanId)},
  {id:publicId,private_finding:false,caption:'Repair complete',url:signed(publicId)}
 ]);
 ui.window.openJobModal(job.id);await flush();
 const panel=ui.modal.querySelector('.workshopPhotos');assert.equal(panel.tagName,'DETAILS');assert.equal(panel.hasAttribute('open'),false);assert.equal(ui.modal.querySelector('.jobWorkSection').nextElementSibling.className,'jobInternalNotesSection');assert.equal(ui.modal.querySelector('.jobInternalNotesSection').nextElementSibling,panel);assert.equal(panel.querySelector('summary').textContent,'Customer messages & updates');assert.equal(panel.querySelector('summary button'),null);assert.ok(panel.querySelector('[data-photo-camera]'));
 for(const item of [first,second]){
  const entry=ui.modal.querySelector('[data-approval-history] .approvalRecord[data-finding-id="'+item.id+'"]');
  assert.equal(entry.querySelector('img').src,signed(item.photo_ids[0]));
  assert.equal(entry.querySelector('a').href,signed(item.photo_ids[0]));
  assert.equal(entry.querySelector('.findingBody p').textContent,item.message);
  assert.equal(entry.querySelector('.findingReview').dataset.findingId,item.id);
  assert.equal(entry.querySelectorAll('img').length,1);
 }
 const gallery=ui.modal.querySelector('[data-photo-saved]');
 assert.equal(gallery.querySelectorAll('figure').length,2);
 assert.equal(gallery.querySelectorAll('textarea').length,1);
 assert.match(gallery.textContent,/Finish private finding/);
 assert.match(gallery.textContent,/Save caption/);
});

test('click opens the matching saved job, focuses the specific finding with only its photos, and remembers acknowledgement',async()=>{
 const seen=new Map(),ui=app(seen);await flush();
 ui.setRows([{...second,mechanic_photo:false},{...first,id:'note-only',photo_ids:[]},first,second]);
 await ui.poll();
 assert.equal(ui.popup.hidden,false);assert.match(ui.action.textContent,/TEST001/);assert.match(ui.action.textContent,/Inner shoulder/);
 await ui.action.onclick();await flush();
 assert.equal(ui.opened,job.id);assert.equal(ui.mounted,1);assert.ok(ui.scrolls);assert.equal(ui.modal.querySelector('.workshopPhotos').hasAttribute('open'),true);
 const focused=ui.modal.querySelector('.findingDestination');
 assert.equal(focused.hidden,false);assert.match(focused.textContent,/Inner shoulder worn/);
 assert.equal(focused.querySelector('[data-finding-evidence] img').src,signed(first.photo_ids[0]));
 assert.equal(focused.querySelectorAll('[data-finding-evidence] img').length,1);
 assert.doesNotMatch(focused.textContent,/Second finding/);
 assert.ok(!ui.modal.querySelector('[data-photo-saved]').innerHTML.includes(first.photo_ids[0]),'no duplicate private photo below the focused finding');
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
test('mechanics receive customer decision alerts without pricing; completed findings disappear on the next poll',async()=>{
 const mechanic=app(new Map(),true);await flush();assert.equal(mechanic.popup.hidden,true);assert.deepEqual(mechanic.requests,['approval-decisions']);
 mechanic.setDecisions([{...first,status:'approved',estimated_pence:12345,decided_at:'2026-11-09T14:00:00Z'}]);await mechanic.poll();
 assert.match(mechanic.action.textContent,/Customer approved/);assert.doesNotMatch(mechanic.action.textContent,/123|£|VAT/);
 mechanic.setApprovalRows([{...first,status:'approved',estimated_pence:12345}]);await mechanic.action.onclick();await flush();
 assert.doesNotMatch(mechanic.modal.textContent,/123|£|VAT/);assert.match(mechanic.modal.textContent,/Customer approved/);
 const manager=app();await flush();manager.setRows([first]);await manager.poll();manager.setRows([]);await manager.poll();
 assert.equal(manager.popup.hidden,true);
});

test('approval and decline responses pop up without an open job, persist until acknowledged and do not repeat after reopening',async()=>{
 const seen=new Map(),ui=app(seen);await flush();assert.equal(ui.popup.hidden,true);
 const approved={...first,status:'approved',estimated_pence:10000,decided_at:'2026-11-09T14:00:00Z'},declined={...second,status:'declined',estimated_pence:8500,decided_at:'2026-11-09T14:01:00Z',photo_ids:[]};
 ui.setRows([first]);ui.setDecisions([approved,declined]);await ui.poll();
 assert.match(ui.action.textContent,/Customer approved · TEST001/);assert.match(ui.action.textContent,/£100.00/);
 assert.equal(ui.popup.dataset.decision,'approved');assert.equal(ui.mounted,0);
 await ui.poll();assert.match(ui.action.textContent,/Customer approved/,'refresh cannot dismiss an unread response');
 ui.popup.querySelector('.findingAlertDismiss').click();assert.match(ui.action.textContent,/Customer declined/);assert.equal(ui.popup.dataset.decision,'declined');
 ui.setApprovalRows([approved,declined]);await ui.action.onclick();await flush();
 assert.equal(ui.opened,job.id);assert.match(ui.modal.querySelector('.findingDestination').textContent,/Customer declined/);
 assert.match(ui.action.textContent,/New mechanic photo/,'photo alerts resume after customer responses');
 const reopened=app(seen);await flush();reopened.setDecisions([approved,declined]);await reopened.poll();assert.equal(reopened.popup.hidden,true);
 assert.ok(ui.requests.every(action=>['approval-queue','photos-list','approval-list'].includes(action)),'displaying a response cannot write the job or contact a customer');
});

test('response notification waits for unsaved work and acknowledgements are shared between tabs',async()=>{
 const seen=new Map(),ui=app(seen);await flush();
 const decision={...first,status:'approved',estimated_pence:10000,decided_at:'2026-11-09T14:00:00Z'};
 ui.setDecisions([decision]);ui.setApprovalRows([decision]);await ui.poll();
 const other=ui.document.getElementById('other');other.innerHTML='<input value="unsaved work">';other.classList.add('open');
 await ui.action.onclick();assert.equal(ui.mounted,0);assert.equal(other.querySelector('input').value,'unsaved work');
 assert.equal(ui.popup.hidden,false);
 other.classList.remove('open');await flush();await flush();assert.equal(ui.mounted,1);assert.equal(ui.popup.hidden,true);
 const another=app(seen);await flush();another.setDecisions([decision]);await another.poll();assert.equal(another.popup.hidden,true);
});

test('sent findings keep their public photo, large caption editor and decision together without duplicating the image; refresh preserves an unsaved caption',async()=>{
 const ui=app();ui.setApprovalRows([{...first,status:'approved',estimated_pence:10000}]);
 ui.window.openJobModal(job.id);await flush();
 let entry=ui.modal.querySelector('.approvalRecord');
 assert.equal(entry.querySelectorAll('img').length,1);assert.match(entry.querySelector('.findingBody').textContent,/Customer approved.*Inner shoulder worn.*£100.00/s);
 assert.equal(ui.modal.querySelector('[data-photo-saved]').querySelectorAll('img').length,0);
 const caption=entry.querySelector('.photoCaptionEditor textarea');caption.value='Clearer caption for the customer';caption.oninput();
 await ui.modal.querySelector('[data-photo-refresh]').onclick();await flush();
 entry=ui.modal.querySelector('.approvalRecord');assert.equal(entry.querySelector('.photoCaptionEditor textarea').value,'Clearer caption for the customer');
 assert.equal(entry.querySelector('.findingBody .findingReview'),null,'sent approval wording stays fixed');
});

test('private note updates alert Main, open the note without overwriting office edits, and only alert again for a new revision',async()=>{
 const storage=new Map(),ui=app(storage);await flush();
 const note={id:'private-note-1',job_id:job.id,registration:job.registration,internal_note:true,mechanic_finding:true,photo_ids:[],message:'Pads worn. Office to review before contacting the customer.'};
 ui.window.openJobModal(job.id);await flush();
 const field=ui.modal.querySelector('#job_internal_workshop_notes');field.value='Unsaved office details';
 ui.setNotes([note]);await ui.poll();assert.equal(ui.popup.hidden,false);assert.match(ui.action.textContent,/Workshop notes updated.*TEST001/);assert.equal(ui.document.querySelector('.findingQueue').hidden,true,'internal notes do not become customer estimates');
 await ui.action.onclick();await flush();
 assert.equal(ui.mounted,1);assert.equal(field.value,'Unsaved office details');assert.match(ui.modal.querySelector('[data-mechanic-note-review]').textContent,/Pads worn/);assert.equal(ui.popup.hidden,true);
 await ui.poll();assert.equal(ui.popup.hidden,true);
 const reopened=app(storage);await flush();reopened.setNotes([note]);await reopened.poll();assert.equal(reopened.popup.hidden,true);
 reopened.setNotes([{...note,id:'private-note-2',message:'Workshop notes cleared.'}]);await reopened.poll();assert.equal(reopened.popup.hidden,false);assert.match(reopened.action.textContent,/Workshop notes cleared/);
 assert.ok(ui.requests.every(action=>['approval-queue','photos-list','approval-list'].includes(action)),'reviewing notes cannot send to the customer');
 const mechanic=app(new Map(),true);await flush();mechanic.setNotes([note]);await mechanic.poll();assert.equal(mechanic.popup.hidden,true);
});
