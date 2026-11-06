import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const main=fs.readFileSync('index.html','utf8');
const functionSource=name=>main.slice(main.indexOf('function '+name+'('),main.indexOf('\nfunction ',main.indexOf('function '+name+'(')+1));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const longWork='Full Service\n'+Array.from({length:50},(_,i)=>`Check item ${i+1}: engine, brakes and suspension.`).join('\n')+'\nFINAL INSTRUCTION: call before replacing the exhaust. <script>never execute</script>';
const jobs=[{id:'later',technician:'Alfie',registration:'AA11 AAA',vehicle:'Nissan Qashqai',drop_time:'10:00',work_required:'Check brakes',estimated_hours:4},{id:'first',technician:'Alfie',registration:'BB22 BBB',vehicle:'Nissan Leaf',drop_time:'08:00',work_required:longWork,estimated_hours:0.5},{id:'chris',technician:'Chris',registration:'CC33 CCC',drop_time:'09:00',work_required:'MOT\nCollect at 3pm',status:'provisional'}];
function setup(mechanic=true,savedView=''){
 const opened=[],{window,document}=parseHTML('<html><body><div id="content"></div></body></html>');
 window.VECTA_MECHANIC_DEPLOYMENT=mechanic;
 const saved=new Map([['vecta_mechanic_day_view',savedView]]);
 const c={window,document,console,mechanicBoardSelection:undefined,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},app:{settings:{},notes:'Workshop notes',jobs},vectaJobIsDeletedForLists:()=>false,isJobInvoiced:()=>false,listPlate:reg=>'<span class="ukPlate">'+escape(reg)+'</span>',esc:escape,
  jobsForDate:()=>jobs,allJobsForDate:()=>jobs,plannerLaneMechanics:()=>['Alfie','Chris','Anyone'],plannerTechnicianName:j=>j.technician,selectedIso:()=> '2026-11-05',byTime:(a,b)=>a.drop_time.localeCompare(b.drop_time),
  unallocatedJobs:()=>[{id:'unallocated',registration:'DD44 DDD',work_required:longWork,drop_time:''}],quoteJobs:()=>[{id:'quote',registration:'EE55 EEE',work_required:longWork,drop_time:'',amount_quoted:12345}],myTasksHtml:()=>'',
  jobTypeLabels:()=>['Full Service'],normaliseJobTypeKey:s=>s.toLowerCase(),jobTypeChip:(_,label)=>'<span class="jobTypeChip">'+escape(label)+'</span>',isWebsiteBookingJob:()=>false,jobTypeInlineStyle:j=>j.status==='provisional'?'background:#cbd0d7!important':'',plannerPlate:j=>'<span class="ukPlate">'+escape(j.registration)+'</span>',partsStatusDot:()=>'',plannerVehicleLabel:j=>j.vehicle||'Vehicle',mobileJobCategoryLabel:()=> 'Staff',mobileMotAppointmentHtml:()=>'<span class="mobileMotAppointment">MOT 10:30</span>',carryOverBadgeHtml:()=>'',
  openJobModal:id=>opened.push(id),plannerWindowConfig:()=>({startMinutes:480,dayLast:960,gridPosition:0}),PLANNER_PX_PER_HOUR:60,plannerMetricsHtml:()=>'',mobilePlannerHtml:()=>'',plannerLiveControlsHtml:()=>'',mechanicHours:()=>0,currentTimeLineHtml:()=>'',plannerTimeRows:()=> '08:00',laneHtml:m=>m,unallocatedPanelHtml:()=> 'UNALLOCATED',quotePanelHtml:()=> 'QUOTES'};
 vm.createContext(c);vm.runInContext(['mechanicJobCardHtml','provisionalBookingsPanelHtml','mechanicPlannerHtml','plannerHtml','bindJobOpenControls','bindMechanicNameFilter'].map(functionSource).join('\n'),c);
 c.render=()=>{document.getElementById('content').innerHTML=c.plannerHtml();c.bindJobOpenControls(document);c.bindMechanicNameFilter(document)};
 c.render();
 return {c,document,window,opened,saved};
}
test('mechanics read every line including standard service wording and the final instruction',()=>{
 const t=setup();
 for(const id of ['first','unallocated','quote']){
  const card=t.document.querySelector('.mechanicQueueCard[data-open-job="'+id+'"]');
  assert.equal(card.querySelector('.mechanicJobDescription').textContent,longWork);
  assert.equal(card.querySelector('script'),null);assert.equal(card.hasAttribute('draggable'),false);
 }
 assert.doesNotMatch(t.document.body.textContent,/12345/);
 assert.equal(t.document.querySelector('.plannerGrid,.timeCol,.resizeHandle,.resizeTopHandle'),null);
 assert.deepEqual(t.opened,[]);
});
test('the complete mechanic card is one keyboard-accessible button and taps open the job once',()=>{
 const t=setup(),card=t.document.querySelector('.mechanicQueueCard');
 assert.equal(card.tagName,'BUTTON');assert.equal(card.querySelector('button'),null);
 for(const element of [card,card.querySelector('.ukPlate'),card.querySelector('.mechanicJobDescription')]){
  element.dispatchEvent(new t.window.Event('click',{bubbles:true}));
 }
 assert.deepEqual(t.opened,['first','first','first']);
});
test('natural-height cards preserve queue order, all mechanic groups, backlog and provisional identity',()=>{
 const t=setup(),groups=t.document.querySelectorAll('.mechanicBoardColumns .mechanicBoardGroup');
 assert.equal(groups.length,3);
 assert.deepEqual([...groups[0].querySelectorAll('.mechanicQueueCard')].map(card=>card.dataset.openJob),['first','later']);
 assert.match(groups[2].textContent,/Anyone.*No jobs here/s);
 assert.match(t.document.querySelector('[data-open-job="chris"]').textContent,/Provisionally booked/);
 assert.match(t.document.querySelector('[data-open-job="chris"]').getAttribute('style'),/#cbd0d7/);
 assert.equal(t.document.querySelectorAll('.mechanicBoardBacklog .mechanicQueueCard').length,3);
 assert.equal(groups[1].querySelector('[data-open-job="chris"]'),null);
 assert.equal(t.document.querySelector('.provisionalBookingsPanel').nextElementSibling.querySelector('h2').textContent,'Unallocated jobs1');
 assert.equal(t.document.querySelector('#notesArea').value,'Workshop notes');
});
test('Main still renders the timed planner and its cards retain the existing open action',()=>{
 const t=setup(false);assert.ok(t.document.querySelector('.plannerGrid .timeCol'));assert.equal(t.document.querySelector('.mechanicBoard'),null);
 assert.equal(t.document.querySelector('[data-mechanic-view]'),null);
 t.document.getElementById('content').innerHTML='<div class="mobileJob" data-open-job="main"><b>Read job</b></div>';
 t.c.bindJobOpenControls(t.document);t.document.querySelector('b').click();assert.deepEqual(t.opened,['main']);
});
test('name buttons switch the day list and preserve the complete description without opening any job',()=>{
 const {c,document,opened,saved}=setup();
 const choose=name=>document.querySelector('[data-mechanic-view="'+name+'"]').click();
 const visible=()=>[...document.querySelectorAll('.mechanicQueueCard')].map(card=>card.dataset.openJob);
 choose('Alfie');
 assert.deepEqual(visible(),['first','later']);
 assert.equal(document.querySelector('.mechanicJobDescription').textContent,longWork);
 assert.equal(document.querySelector('[aria-pressed="true"]').textContent,'Alfie');
 assert.equal(document.querySelector('.mechanicBoardBacklog'),null);
 assert.equal(saved.get('vecta_mechanic_day_view'),'Alfie');
 c.jobsForDate=()=>[{...jobs[0],id:'next-day'},{...jobs[0],technician:'Chris',id:'other-next-day'}];
 c.render();
 assert.deepEqual(visible(),['next-day']);
 choose('Chris');assert.deepEqual(visible(),['other-next-day']);
 c.jobsForDate=()=>[];c.render();
 assert.match(document.querySelector('.mechanicPersonalDay').textContent,/Chris.*No jobs here/s);
 choose('');assert.ok(document.querySelector('.mechanicBoardBacklog'));
 assert.equal(saved.get('vecta_mechanic_day_view'),'');
 assert.deepEqual(opened,[]);
});
test('reopening restores the device choice and a removed mechanic falls back to All jobs',()=>{
 assert.ok(setup(true,'Alfie').document.querySelector('.mechanicPersonalDay'));
 const {document}=setup(true,'Retired mechanic');
 assert.equal(document.querySelector('[aria-pressed="true"]').textContent,'All jobs');
 assert.equal(document.querySelectorAll('.mechanicBoardColumns .mechanicBoardGroup').length,3);
});
test('the generated mechanics entry carries the same complete-description renderer and whole-card binding',()=>{
 const mechanic=mechanicVariant(main);
 for(const name of ['mechanicPlannerHtml','mechanicJobCardHtml','bindJobOpenControls'])assert.ok(mechanic.includes(functionSource(name)));
 assert.match(main,/bindJobOpenControls\(document\);/);
 assert.match(main,/bindMechanicNameFilter\(document\);/);
});
