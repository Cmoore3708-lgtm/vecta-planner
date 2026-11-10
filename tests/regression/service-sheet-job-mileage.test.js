import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=readFileSync('index.html','utf8');
const names=new Set(['serviceSheetDraftKey','serviceSheetDraftIdentity','serviceSheetSnapshot','serviceSheetSaveStatus','persistServiceSheetDraft','normaliseCurrentJobMileage','confirmedJobMileage','currentJobMileageUnknown','noteWithCurrentJobMileage','requireCurrentJobMileage','requireServiceSheetMileage','syncServiceSheetMileageToJob','saveServiceSheet','saveServiceSheetAndClose']);
for(const [variant,html] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 const functions=[];
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) (traverseModule.default||traverseModule)(parse(match[1],{sourceType:'script'}),{FunctionDeclaration(path){if(names.has(path.node.id.name))functions.push((generateModule.default||generateModule)(path.node).code);}});
 function setup({offline=false,jobFailure=false,sheetFailure=false}={}){
  const {window,document}=parseHTML('<html><body><div id="printSheet"><div class="servicePrint" data-job-id="job-1"><span class="ssMileageEntry">54,321</span></div></div></body></html>');
  const original={id:'job-1',registration:'AB12 CDE',status:'booked',booking_date:'2026-11-10',technician:'Alfie',mileage:40000,customer_note:'Customer instructions\n[[PARTS_STATUS:Parts here]]\n[[VECTA_CURRENT_MILEAGE_UNKNOWN]]',amount_quoted:120,updated_at:'2026-11-10T08:00:00Z'};
  const other={...original,id:'job-2',mileage:12345};const events=[],alerts=[],writes=[],stored=[];
  const draftStorage=new Map();const c={document,window,localStorage:{getItem:k=>draftStorage.get(k)||null,setItem:(k,v)=>draftStorage.set(k,v),removeItem:k=>draftStorage.delete(k)},console:{warn(){},error(){}},app:{jobs:[{...original},other]},activeServiceRegistration:'AB12CDE',activeServiceKind:'service',activeServiceJobId:'job-1',remoteClient:offline?null:{},validateServiceSheetDates:()=>true,normReg:v=>String(v).replace(/\s/g,'').toUpperCase(),normalisePaperworkKind:v=>v,syncServiceSheetDueDateToFleet:async()=>true,latestSavedServiceSheet:()=>null,serviceRemoteKey:()=> 'service:AB12CDE:job-1',paperworkTitle:()=> 'Service Sheet',BRAND_LOGO_FILE_SRC:'/assets/vecta-logo.webp',storeServiceRecordLocal:r=>stored.push(r),saveServiceRecordRemote:async r=>{events.push('paperwork');if(sheetFailure)throw Error('Paperwork unavailable');return r;},vectaConfirmPaperworkSaved:async()=>events.push('local paperwork'),upsertRemote:async(table,row,options)=>{events.push(offline?'queue job':'job');if(jobFailure)throw Error('Job unavailable');writes.push({table,row:{...row},options});return offline?{queued:true}:[{id:row.id}];},saveLocal:()=>events.push('local job'),financeIsRecognisedJob:()=>false,todayIso:()=> '2026-11-10',currentJobMileageRequired:()=>true,alert:m=>alerts.push(m),closeServicePreview:()=>events.push('close'),openJobModal:id=>{events.push('reopen '+id);const input=document.createElement('input');input.id='job_current_mileage';input.value=c.confirmedJobMileage(c.app.jobs.find(j=>j.id===id));document.body.appendChild(input);}};
  vm.createContext(c);vm.runInContext(readFileSync('public/js/vecta-paperwork-recovery.js','utf8'),c);vm.runInContext(functions.join('\n'),c);return {c,document,original,other,events,alerts,writes,stored};
 }
 test(variant+': saving service mileage fills the reopened card and completion does not prompt',async()=>{
  const s=setup();assert.equal(await s.c.saveServiceSheetAndClose(),true);
  const job=s.c.app.jobs[0];assert.equal(job.mileage,54321);assert.equal(s.c.confirmedJobMileage(job),'54321');assert.equal(s.c.currentJobMileageUnknown(job),false);
  assert.equal(s.document.getElementById('job_current_mileage').value,'54321');assert.equal(await s.c.requireCurrentJobMileage(job),true);assert.equal(s.document.getElementById('jobMileagePrompt'),null);
  assert.equal(s.writes[0].row.mileage,54321);assert.equal(s.writes[0].options.expectedRemoteUpdatedAt,s.original.updated_at);assert.match(s.writes[0].row.customer_note,/Customer instructions[\s\S]*PARTS_STATUS:Parts here/);
  for(const key of ['status','booking_date','technician','amount_quoted'])assert.equal(job[key],s.original[key]);assert.equal(job.completed_at,undefined);assert.equal(s.other.mileage,12345);
  assert.deepEqual(s.events,['paperwork','job','local job','close','reopen job-1']);assert.equal(s.alerts.length,0);
 });
 test(variant+': offline save queues the mileage and keeps the sheet open until shared',async()=>{
  const s=setup({offline:true});assert.equal(await s.c.saveServiceSheetAndClose(),false);assert.deepEqual(s.events,['local paperwork','queue job','local job']);assert.match(s.alerts[0],/device only/);assert.equal(s.c.confirmedJobMileage(s.writes[0].row),'54321');
 });
 test(variant+': sheet or job save failure stays open and leaves previous job mileage intact',async()=>{
  for(const failure of [{jobFailure:true},{sheetFailure:true}]){const s=setup(failure);assert.equal(await s.c.saveServiceSheetAndClose(),false);assert.equal(s.events.includes('close'),false);assert.equal(s.c.app.jobs[0].mileage,40000);assert.equal(s.c.currentJobMileageUnknown(s.c.app.jobs[0]),true);assert.equal(s.alerts.length,1);if(failure.sheetFailure)assert.equal(s.events.includes('job'),false);}
 });
 test(variant+': conflicts keep the paperwork open and never claim that mileage was saved',async()=>{
  const s=setup();s.c.upsertRemote=async()=>[{vecta_conflict_skipped:true}];assert.equal(await s.c.saveServiceSheetAndClose(),false);assert.equal(s.c.app.jobs[0].mileage,40000);assert.match(s.alerts[0],/another device/);assert.equal(s.events.includes('close'),false);
 });
 test(variant+': unlinked, historical, mismatched and invalid readings never change another visit',async()=>{
  const s=setup();for(const record of [{job_id:'',registration:'AB12CDE',mileage:'54321'},{job_id:'old-job',registration:'AB12CDE',mileage:'54321'},{job_id:'job-1',registration:'WRONG',mileage:'54321'},{job_id:'job-1',registration:'AB12CDE',mileage:'-1'}])await s.c.syncServiceSheetMileageToJob(record);
  assert.equal(s.writes.length,0);assert.equal(s.c.app.jobs[0].mileage,40000);assert.equal(s.other.mileage,12345);
 });
 test(variant+': invalid service-sheet mileage is rejected before saving either record',async()=>{
  for(const value of ['','0','-1','1.5','2000001','abc']){const s=setup();s.document.querySelector('.ssMileageEntry').textContent=value;assert.equal(await s.c.saveServiceSheet(),false);assert.equal(s.stored.length,0);assert.equal(s.writes.length,0);assert.equal(s.c.app.jobs[0].mileage,40000);}
 });
 test(variant+': correcting an existing reading replaces its marker and preserves recognised-job dates',async()=>{
  const s=setup();s.c.app.jobs[0].customer_note='[[VECTA_CURRENT_MILEAGE:45000]]';s.c.financeIsRecognisedJob=()=>true;s.c.app.jobs[0].completed_at='2026-11-09T10:00:00Z';s.c.app.jobs[0].booking_date='2026-11-09';assert.equal(await s.c.saveServiceSheet(),true);
  const job=s.c.app.jobs[0];assert.equal(s.c.confirmedJobMileage(job),'54321');assert.equal((job.customer_note.match(/VECTA_CURRENT_MILEAGE:/g)||[]).length,1);assert.equal(job.completed_at,'2026-11-09T10:00:00Z');assert.equal(job.booking_date,'2026-11-09');
 });
}
