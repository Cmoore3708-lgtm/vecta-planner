import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function openWebsiteRequestJobCard('),html.indexOf('async function deleteWebsiteRequestCompletely('));
function setup({online=true,updated=true,saved=true}={}){
  const {document,window}=parseHTML('<div id="jobModal"><div class="jobModalHead"><h2></h2></div><input id="job_booking_date"><div class="modalFoot"><button id="saveJob"></button><button id="saveJobMobile"></button><button id="createQuote"></button><button id="markReady"></button></div></div>');
  const calls=[],request={id:'request-1'},app={jobs:[],websiteRequests:[request]};let dayUpdates=0;
  document.getElementById('job_booking_date').addEventListener('change',()=>dayUpdates++);
  const context={document,window,Event:window.Event,navigator:{onLine:online},app,alert:message=>calls.push(['alert',message]),openJobModal:(id,draft)=>calls.push(['open',id,draft]),gatherJob:()=>({technician:'Chris'}),isUnallocatedJob:j=>j.technician==='Unallocated',saveLocal:()=>calls.push(['local']),
    remoteClient:{from:table=>({update:patch=>({eq:(key,id)=>({select:async()=>{calls.push(['update',table,id,patch]);return {error:null,data:updated?[{id}]:[]};}})})})},
    saveJob:async(id,confirmed)=>{calls.push(['save',id]);if(!saved)return false;return confirmed({id});}};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,calls,request,app,document,dayUpdates:()=>dayUpdates};
}
test('review opens the existing editor and date planner without saving or accepting',()=>{
  const s=setup();s.context.openWebsiteRequestJobCard(s.request,{id:'job-1',booking_date:'2026-10-23'});
  assert.equal(s.calls[0][1],null);assert.equal(s.calls[0][2].booking_date,'2026-10-23');assert.equal(s.dayUpdates(),1);
  assert.equal(s.app.jobs.length,0);assert.equal(s.app.websiteRequests.length,1);
  assert.equal(s.document.getElementById('saveJob').textContent,'Accept Booking');assert.match(s.document.getElementById('saveJob').className,/green/);
  assert.equal(s.document.getElementById('createQuote'),null);assert.deepEqual(s.calls.map(c=>c[0]),['open']);
});
test('acceptance saves edits before closing the inbox request',async()=>{
  const s=setup();await s.context.acceptWebsiteRequestJob('request-1','job-1',s.document.getElementById('saveJob'));
  assert.deepEqual(s.calls.map(c=>c[0]),['save','update','local']);assert.equal(s.calls[1][3].job_id,'job-1');assert.equal(s.app.websiteRequests.length,0);
});
test('failed saves leave the request pending',async()=>{
  const s=setup({saved:false});await s.context.acceptWebsiteRequestJob('request-1','job-1',s.document.getElementById('saveJob'));
  assert.equal(s.app.websiteRequests.length,1);assert.equal(s.calls.some(c=>c[0]==='update'),false);
});
test('zero-row inbox updates never claim acceptance',async()=>{
  const s=setup({updated:false});assert.equal(await s.context.acceptWebsiteRequestJob('request-1','job-1',s.document.getElementById('saveJob')),false);assert.equal(s.app.websiteRequests.length,1);
});
test('offline and repeated clicks cannot accept',async()=>{
  const s=setup({online:false}),button=s.document.getElementById('saveJob');await s.context.acceptWebsiteRequestJob('request-1','job-1',button);
  assert.equal(s.calls.some(c=>c[0]==='save'),false);button.disabled=true;assert.equal(await s.context.acceptWebsiteRequestJob('request-1','job-1',button),false);
});
test('retry reuses a saved job',()=>{
  const s=setup();s.app.jobs.push({id:'job-1'});s.context.openWebsiteRequestJobCard(s.request,{id:'job-1'});assert.equal(s.calls[0][1],'job-1');
});
test('the real job-card calendar immediately shows work on the requested date and follows date changes',()=>{
  const {document,window}=parseHTML('<div class="jobSectionGrid"><input id="job_booking_date" value="2026-10-23"></div>');
  const context={document,window,Event:window.Event,app:{settings:{mechanics:['Alfie','Chris','Anyone']},jobs:[{booking_date:'2026-10-23',technician:'Alfie',registration:'AB12 CDE',drop_time:'09:00',estimated_hours:1,work_required:'Service'}]},selectedIso:()=> '2026-10-18',todayIso:()=> '2026-10-18',esc:String,niceDate:String,isVehicleTaxJob:()=>false,vectaJobIsDeletedForLists:()=>false,isUnallocatedJob:()=>false,mechanicHours:()=>1,plannerTechnicianLane:String,byTime:()=>0,jobTitle:()=>''};
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function installNewJobAvailabilityCalendar('),html.indexOf('function previousVehicleWork(')),context);
  context.installNewJobAvailabilityCalendar(true);
  const planner=document.querySelector('.bookingInlinePlanner');assert.match(planner.textContent,/2026-10-23/);assert.match(planner.textContent,/AB12 CDE/);
  const date=document.getElementById('job_booking_date');date.value='2026-10-26';date.dispatchEvent(new window.Event('change'));
  assert.match(document.querySelector('.bookingInlinePlanner').textContent,/2026-10-26/);assert.doesNotMatch(document.querySelector('.bookingInlinePlanner').textContent,/AB12 CDE/);
});
