import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=fs.readFileSync('index.html','utf8');
const names=new Set(['serviceSheetDraftKey','serviceSheetDraftIdentity','serviceSheetSnapshot','serviceSheetSaveStatus','persistServiceSheetDraft','restoreServiceSheetDraft','watchServiceSheetDraft','serviceRemoteKey','serviceRecordTime','normalisePaperworkKind','vectaSafeApplyAppUpdate','saveServiceSheet','saveServiceRecordRemote']);
const markup='<html><body><div id="servicePreviewControls"><button class="savePreview">Save</button><div id="serviceSheetSaveStatus"></div></div><div id="printSheet"><div class="servicePrint" data-job-id="visit-1" data-service-date="2026-11-10"><span class="ssMileageEntry" contenteditable="true">19320</span><span class="ssCheck selected" aria-checked="true"></span><div class="ssNotesArea" contenteditable="true">Front pads checked</div><textarea>old</textarea><input type="range" value="0"><input class="ssDueDateDisplay" value="10/11/2027"><div data-optional-tool="service">Loading</div></div></div></body></html>';
for(const [variant,html] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 const functions=[];
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\bsrc\s*=/.test(match[1]))continue;
  const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&names.has(node.id.name))functions.push(match[2].slice(node.start,node.end));for(const child of Object.values(node)){if(Array.isArray(child))child.forEach(visit);else if(child&&typeof child==='object')visit(child);}};visit(parse(match[2],{sourceType:'unambiguous'}).program);
 }
 function setup(storage=new Map()){
  const {window,document}=parseHTML(markup),alerts=[],writes=[],reloads=[];
  const c={window,document,console:{warn(){},error(){}},AbortController,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},activeServiceRegistration:'NK25 XYS',activeServiceKind:'service',activeServiceJobId:'visit-1',BRAND_LOGO_FILE_SRC:'assets/vecta-logo.webp',normReg:r=>String(r).replace(/\s/g,'').toUpperCase(),latestSavedServiceSheet:()=>null,validateServiceSheetDates:()=>true,requireServiceSheetMileage:()=> '19320',paperworkTitle:()=> 'Service Sheet',storeServiceRecordLocal:r=>writes.push(r),remoteClient:null,vectaConfirmPaperworkSaved:async()=>{},syncServiceSheetMileageToJob:async()=>{},syncServiceSheetDueDateToFleet:async()=>{},alert:m=>alerts.push(m),VECTA_APP_VERSION:'old',vectaAppUpdateWaiting:false,vectaPendingSync:()=>[],vectaSyncInFlight:false,plannerInteractionBusy:false,sessionStorage:{getItem:()=>null,setItem(){}},vectaCreateDailyBackup:async()=>{},location:{reload:()=>reloads.push(true)},serviceRecordKind:r=>r.sheet_type};
  vm.createContext(c);vm.runInContext(fs.readFileSync('public/js/vecta-paperwork-recovery.js','utf8'),c);vm.runInContext(functions.join('\n'),c);return {c,window,document,storage,alerts,writes,reloads};
 }
 test(variant+': live checks, notes, dates and control values survive reopening on the same device',async()=>{
  const s=setup();s.c.watchServiceSheetDraft();s.document.querySelector('textarea').value='Oil changed';s.document.querySelector('input[type="range"]').value='75';s.document.querySelector('.ssNotesArea').dispatchEvent(new s.window.Event('input',{bubbles:true}));await s.c.persistServiceSheetDraft();
  assert.equal(s.storage.size,1);assert.equal(s.writes.length,0,'drafts must not become completed service records');
  const reopened=setup(s.storage);assert.equal(await reopened.c.restoreServiceSheetDraft(),true);
  assert.equal(reopened.document.querySelector('.ssMileageEntry').textContent,'19320');assert.equal(reopened.document.querySelector('textarea').textContent,'Oil changed');assert.equal(reopened.document.querySelector('input[type="range"]').getAttribute('value'),'75');assert.ok(reopened.document.querySelector('.ssCheck.selected'));assert.equal(reopened.document.querySelector('.ssDueDateDisplay').value,'10/11/2027');assert.equal(reopened.document.querySelector('[data-optional-tool]'),null);
 });
 test(variant+': recovery is isolated by job and sheet type and never replaces a newer shared save',async()=>{
  const s=setup();await s.c.persistServiceSheetDraft();
  for(const changes of [{activeServiceJobId:'visit-2'},{activeServiceKind:'safety'},{activeServiceRegistration:'OTHER'}]){const next=setup(s.storage);Object.assign(next.c,changes);assert.equal(await next.c.restoreServiceSheetDraft(),false);}
  s.c.latestSavedServiceSheet=()=>({updated_at:'2099-01-01T00:00:00Z'});assert.equal(await s.c.restoreServiceSheetDraft(),false);
 });
 test(variant+': updates wait for an open sheet, including the transition before preview controls appear',async()=>{
  const s=setup();assert.equal(s.c.vectaSafeApplyAppUpdate('next'),false);assert.equal(s.reloads.length,0);
  s.document.getElementById('printSheet').innerHTML='';assert.equal(s.c.vectaSafeApplyAppUpdate('next'),true);await new Promise(resolve=>setImmediate(resolve));assert.equal(s.reloads.length,1);
 });
 test(variant+': a failed Fleet save cannot prevent the completed paperwork reaching its own storage',async()=>{
  const s=setup();s.c.syncServiceSheetDueDateToFleet=async()=>{throw Error('Fleet unavailable')};assert.equal(await s.c.saveServiceSheet(),false);assert.equal(s.writes.length,1);assert.match(s.writes[0].html,/Front pads checked/);assert.match(s.alerts[0],/paperwork was saved/);assert.equal(s.storage.size,1);assert.equal(s.document.querySelector('.savePreview').disabled,false);assert.equal(s.document.querySelector('.servicePrint').hasAttribute('inert'),false);assert.match(s.document.getElementById('serviceSheetSaveStatus').textContent,/retry/);
 });
 test(variant+': exceptions are visible, prevent closing, and preserve the draft for retry',async()=>{
  const s=setup();s.c.storeServiceRecordLocal=()=>{throw Error('Device storage unavailable')};assert.equal(await s.c.saveServiceSheet(),false);assert.match(s.alerts[0],/Device storage unavailable/);assert.equal(await setup(s.storage).c.restoreServiceSheetDraft(),true);
 });
 test(variant+': repeated Save clicks cannot start overlapping writes; success clears the draft',async()=>{
  const s=setup();let finish;s.c.vectaConfirmPaperworkSaved=()=>new Promise(resolve=>finish=resolve);s.c.remoteClient={};s.c.saveServiceRecordRemote=()=>new Promise(resolve=>finish=()=>resolve(s.writes[0]));const first=s.c.saveServiceSheet();assert.equal(s.document.querySelector('.savePreview').textContent,'Saving…');assert.equal(await s.c.saveServiceSheet(),false);finish();assert.equal(await first,true);assert.equal(s.writes.length,2);assert.equal(s.storage.size,0);
 });
 test(variant+': unavailable draft storage is reported without destroying the open entries',async()=>{
  const s=setup();s.c.localStorage.setItem=()=>{throw Error('quota')};assert.equal(await s.c.persistServiceSheetDraft(),false);assert.match(s.document.getElementById('serviceSheetSaveStatus').textContent,/could not be kept/);assert.equal(s.document.querySelector('.ssNotesArea').textContent,'Front pads checked');
 });
 test(variant+': canonical cloud acknowledgement is mandatory and a stuck optional mirror never blocks Save',async()=>{
  const s=setup(),record={registration:'NK25XYS',sheet_type:'service',job_id:'visit-1',html:'completed checks',updated_at:'2026-11-10T10:00:00Z'};let rows=[];
  s.c.remoteClient={from:table=>({upsert:()=>table==='service_records'?new Promise(()=>{}):{select:()=>({abortSignal:async()=>({data:rows})})}})};
  await assert.rejects(s.c.saveServiceRecordRemote(record),/did not confirm/);
  rows=[{id:'service:NK25XYS:visit-1',value:record}];assert.equal((await s.c.saveServiceRecordRemote(record)).html,record.html);
 });
 test(variant+': a stalled canonical save is aborted and returns a retryable failure',async()=>{
  const s=setup();let timeout,cleared=false;s.c.setTimeout=fn=>{timeout=fn;return 1};s.c.clearTimeout=()=>{cleared=true};
  s.c.remoteClient={from:()=>({upsert:()=>({select:()=>({abortSignal:signal=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({error:{message:'AbortError'}})))})})})};
  const saving=s.c.saveServiceRecordRemote({registration:'NK25XYS',sheet_type:'service',job_id:'visit-1',html:'checks'});timeout();await assert.rejects(saving,/timed out/);assert.equal(cleared,true);
 });
}

const recoveryContext=vm.createContext({console,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('public/js/vecta-paperwork-recovery.js','utf8'),recoveryContext);
const createStore=recoveryContext.VectaServiceSheetRecovery.createDraftStore;
const draftRow=(html='checks',updated_at='2026-11-10T11:00:00Z')=>({html,registration:'NK25XYS',job_id:'visit-1',sheet_type:'service',updated_at});
const fullStorage={getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError');},removeItem(){}};
const disk=()=>{const rows=new Map();return {rows,readRow:async key=>rows.get(key),writeRow:async row=>rows.set(row.key,{...row}),removeRow:async key=>rows.delete(key)};};
test('a 1 MB draft survives full localStorage, reload, and cleanup without removing other local data',async()=>{
 const db=disk(),store=createStore({storage:fullStorage,...db}),row=draftRow('<img src="data:image/svg+xml;base64,'+'A'.repeat(1050000)+'"><span class="ssCheck selected">Completed</span>');
 assert.equal(await store.put('visit-1',row),true);assert.equal(db.rows.get('visit-1').html,row.html);
 const reopened=createStore({storage:fullStorage,...db});assert.equal((await reopened.get('visit-1')).html,row.html);await reopened.remove('visit-1');assert.equal(await reopened.get('visit-1'),undefined);
});
test('failed durable and fallback writes remain failures and the next save retries the same contents',async()=>{
 const db=disk();let blocked=true,writes=0;
 const store=createStore({storage:fullStorage,...db,writeRow:async row=>{writes++;if(blocked)throw Error('IDB full');await db.writeRow(row);}});
 await assert.rejects(store.put('visit-1',draftRow()),/Quota/);blocked=false;assert.equal(await store.put('visit-1',draftRow()),true);assert.equal(writes,2);assert.equal((await store.get('visit-1')).html,'checks');
});
test('successive edits and cloud-save cleanup remain ordered while a disk write is pending',async()=>{
 const db=disk();let release,first=true;const store=createStore({storage:fullStorage,...db,writeRow:async row=>{if(first){first=false;await new Promise(resolve=>release=resolve);}await db.writeRow(row);}});
 const older=store.put('visit-1',draftRow('older'));await new Promise(resolve=>setImmediate(resolve));const newer=store.put('visit-1',draftRow('newer')),clear=store.remove('visit-1');release();await Promise.all([older,newer,clear]);assert.equal(db.rows.has('visit-1'),false);
});
test('legacy drafts are readable and corrupt legacy JSON does not prevent a replacement save',async()=>{
 const data=new Map([['visit-1','{corrupt']]),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},db=disk(),store=createStore({storage,...db});
 await store.put('visit-1',draftRow());assert.equal(data.has('visit-1'),false);assert.equal((await store.get('visit-1')).html,'checks');
 data.set('visit-1',JSON.stringify(draftRow('newer legacy','2026-11-10T12:00:00Z')));assert.equal((await store.get('visit-1')).html,'newer legacy');
});
test('IndexedDB request success alone cannot report a draft saved before its transaction commits',async()=>{
 let transaction,request,settled=false;const db={objectStoreNames:{contains:()=>true},close(){},transaction(){transaction={objectStore:()=>({put:()=>{request={};return request;}}),abort(){}};return transaction;}};
 const indexedDB={open(){const opening={result:db};queueMicrotask(()=>opening.onsuccess());return opening;}};
 const store=createStore({storage:fullStorage,indexedDB});const saving=store.put('visit-1',draftRow()).then(()=>{settled=true;});await new Promise(resolve=>setImmediate(resolve));request.onsuccess();await Promise.resolve();assert.equal(settled,false);transaction.oncomplete();await saving;assert.equal(settled,true);
});
