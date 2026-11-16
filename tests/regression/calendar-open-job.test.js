import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const popupSource=readFileSync('public/js/calendar-job-popup.js','utf8');
const helper=popupSource.slice(popupSource.indexOf('  function calendarPlannerHtml('),popupSource.indexOf(' function mergeQueuedJobs('));
const helpers={};vm.runInNewContext(helper,helpers);
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function installNewJobAvailabilityCalendar(');
const source=html.slice(start,html.indexOf('\n\nfunction previousVehicleWork(',start));
async function setup({dashboard=false,currentId='editing-1'}={}){
  const fieldId=dashboard?'currentDate':'job_booking_date';
  const {document,window}=parseHTML('<html><body><div class="'+(dashboard?'':'jobModalCard')+'"><input id="'+fieldId+'" value="2026-11-18"><textarea id="work">Original work</textarea><input id="part" value="Filter"><input id="ordered" type="checkbox"></div></body></html>');
  const jobs=[{id:'job-1',registration:'TEST01',booking_date:'2026-11-18',technician:'Alfie',status:'booked',work_required:'Full Service',estimated_hours:1}];
  const opened=[],popups=[],prompts=[];
  window.VectaCalendarJobPopup={plannerHtml:helpers.calendarPlannerHtml,open:(id)=>{popups.push(id);opened.push(id);}};
  const ctx={document,window,Event:window.Event,app:{jobs,settings:{mechanics:['Alfie','Chris','Anyone']}},editingJobId:currentId,selectedIso:()=> '2026-11-18',todayIso:()=> '2026-11-16',esc:v=>String(v||'').replaceAll('"','&quot;'),niceDate:v=>v,isVehicleTaxJob:()=>false,vectaJobIsDeletedForLists:j=>!!j.deleted,isUnallocatedJob:()=>false,plannerTechnicianLane:v=>v,mechanicHours:()=>1,byTime:()=>0,jobTitle:()=> 'Work',openJobModal:id=>opened.push(id),confirm:message=>{prompts.push(message);return ctx.allowDiscard;},allowDiscard:false};
  vm.runInNewContext("\'use strict\';\n"+source,ctx);ctx.installNewJobAvailabilityCalendar(true,fieldId);
  await Promise.resolve();
  if(dashboard)document.getElementById(fieldId).onclick({preventDefault(){}});
  const card=()=>document.querySelector('[data-v243-open-job]');
  const click=target=>(target||card()).dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
  return {ctx,document,window,jobs,opened,popups,prompts,card,click,fieldId};
}

for(const dashboard of [false,true])test(`calendar opens the exact job from nested card text (${dashboard?'dashboard':'booking'})`,async()=>{
  const t=await setup({dashboard});t.click(t.card().querySelector('span'));
  assert.deepEqual(t.opened,['job-1']);assert.deepEqual(t.popups,dashboard?[]:['job-1']);assert.equal(t.prompts.length,0);
  assert.equal(t.document.getElementById(t.fieldId).value,'2026-11-18');
  assert.equal(t.document.querySelector('.modal.open'),null);
});

test('calendar cards are native buttons for keyboard and touch activation without submitting forms',async()=>{
  const t=await setup();assert.equal(t.card().tagName,'BUTTON');assert.equal(t.card().getAttribute('type'),'button');
  assert.match(t.card().textContent,/TEST01.*Full Service/);t.click();assert.deepEqual(t.opened,['job-1']);
});

test('opening a popup preserves unsaved work, parts, checkboxes and the selected date without saving',async()=>{
  const t=await setup();const original=t.document.querySelector('.jobModalCard');
  t.document.getElementById('work').value='New work';t.document.getElementById('part').value='Brake pads';t.document.getElementById('ordered').checked=true;
  t.click();assert.deepEqual(t.popups,['job-1']);assert.equal(t.prompts.length,0);
  assert.equal(t.document.querySelector('.jobModalCard'),original);
  assert.equal(t.document.getElementById('work').value,'New work');assert.equal(t.document.getElementById('part').value,'Brake pads');
  assert.equal(t.document.getElementById('ordered').checked,true);
  assert.equal(t.document.getElementById(t.fieldId).value,'2026-11-18');assert.equal(t.jobs[0].work_required,'Full Service');
});

test('clicking the current job never reloads its form or opens another copy',async()=>{
  const current=await setup({currentId:'job-1'});current.document.getElementById('work').value='Unsaved';current.click();assert.deepEqual(current.opened,[]);assert.equal(current.prompts.length,0);
});

test('stale deleted or completed calendar cards cannot open and rerendered cards still work',async()=>{
  for(const change of [{deleted:true},{status:'completed'},{booking_date:'2026-11-19'}]){
    const t=await setup();Object.assign(t.jobs[0],change);t.click();assert.deepEqual(t.opened,[]);
  }
  const t=await setup();const field=t.document.getElementById(t.fieldId);field.dispatchEvent(new t.window.Event('change',{bubbles:true}));t.click();assert.deepEqual(t.opened,['job-1']);
});


test('a prefilled new booking stays open when another job opens in a popup',async()=>{
  const t=await setup({currentId:null});t.click();assert.deepEqual(t.popups,['job-1']);assert.equal(t.prompts.length,0);
  assert.equal(t.ctx.editingJobId,null);assert.equal(t.document.getElementById('work').value,'Original work');
});
