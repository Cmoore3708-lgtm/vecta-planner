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
}
