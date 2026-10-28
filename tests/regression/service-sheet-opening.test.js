import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=fs.readFileSync('index.html','utf8');
for(const [name,source] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 test(name+' opens paperwork with current mileage without requiring a full job save',async()=>{
  const code=source.slice(source.indexOf('async function openJobServiceSheet('),source.indexOf('async function printService('));
  const button={disabled:false},job={id:'job-1',mileage:55118};let opened;
  const context={document:{getElementById:()=>button},gatherJob:id=>({...job,id}),printService:async(id,draft)=>{opened={id,draft};},saveJob:()=>{throw Error('Viewing paperwork must not save the job');},console,alert:()=>{throw Error('Unexpected opening failure');}};
  vm.runInNewContext(code,context);await context.openJobServiceSheet('job-1');
  assert.equal(opened.id,'job-1');assert.equal(opened.draft.mileage,55118);assert.equal(button.disabled,false);
  assert.match(source,/serviceButton\.onclick=function\(\)\{return openJobServiceSheet\(j\.id\)\}/);
 });
 test(name+' reports an opening failure and permits retry instead of leaving an inert button',async()=>{
  const code=source.slice(source.indexOf('async function openJobServiceSheet('),source.indexOf('async function printService('));
  const button={disabled:false};let message='',calls=0;
  const context={document:{getElementById:()=>button},gatherJob:()=>({}),printService:async()=>{calls++;throw Error('unavailable');},console:{error(){}},alert:s=>message=s};
  vm.runInNewContext(code,context);await context.openJobServiceSheet('job-1');assert.match(message,/could not be opened/);assert.equal(button.disabled,false);
  button.disabled=true;await context.openJobServiceSheet('job-1');assert.equal(calls,1);
 });
 test(name+' reopens WGZ 7062 historical paperwork without inserting or changing a live job',async()=>{
  const code=source.slice(source.indexOf('async function printService('),source.indexOf('function vehicleTaxInvoiceTitle('));
  const seedCode=source.match(/window\.CONTRACTOR_2026_JOBS=([^;]+);/)[0];
  const seedContext={window:{}};vm.runInNewContext(seedCode,seedContext);
  const job=seedContext.window.CONTRACTOR_2026_JOBS.find(j=>j.id==='contractor-2026-row-228');
  assert.equal(job.booking_date,'2026-05-19');assert.equal(job.registration.replace(/ /g,''),'WGZ7062');
  const before=JSON.stringify(job);let opened;
  const context={app:{jobs:[]},window:{CONTRACTOR_2026_JOBS:[job]},paperworkKindForJob:()=> 'service',normReg:r=>r.replace(/ /g,''),fetchDvsaVehicle:async()=>({}),vectaWithTimeout:p=>p,applyDvsaToJob:()=>{},openLatestServiceSheet:async(reg,j)=>{opened={reg,j};return true;},console};
  vm.runInNewContext(code,context);await context.printService(job.id,{mileage:55118});
  assert.equal(opened.reg,'WGZ7062');assert.equal(opened.j.booking_date,'2026-05-19');assert.equal(opened.j.mileage,55118);
  assert.equal(context.app.jobs.length,0);assert.equal(JSON.stringify(job),before);
  await assert.rejects(context.printService('missing'),/could not be found/);
 });

}
