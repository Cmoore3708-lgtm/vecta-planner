import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
import '../../public/js/vecta-booking-rules.js';

const main=fs.readFileSync('index.html','utf8');
const functionSource=name=>main.slice(main.indexOf('function '+name+'('),main.indexOf('\nfunction ',main.indexOf('function '+name+'(')+1));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const longWork='Full Service\n'+Array.from({length:50},(_,i)=>`Check item ${i+1}: engine, brakes and suspension.`).join('\n')+'\nFINAL INSTRUCTION: call before replacing the exhaust. <script>never execute</script>';
const websiteServiceNotes=[
   'Current mileage unknown. Check mileage on arrival and carry out the selected VECTA service package. Discuss additional items separately.',
   'NEVOS vehicle: NO','Full Service',
   'Mini valet · £30 including VAT: snow-foam pressure wash, hoover inside, Dashboard & Media screens cleaned.',
   'Booking guide total: £185.00 including VAT.\nGuide price based on engine size.',
   'Optional service item — Spark plugs\nCustomer requests replacement.\nWe will confirm the price before fitting. Obtain price approval before replacement.'
 ].join('\n\n');
const jobs=[{id:'later',technician:'Alfie',registration:'AA11 AAA',vehicle:'Nissan Qashqai',drop_time:'10:00',work_required:'Check brakes',estimated_hours:4},{id:'first',technician:'Alfie',registration:'BB22 BBB',vehicle:'Nissan Leaf',drop_time:'08:00',work_required:longWork,estimated_hours:0.5},{id:'chris',technician:'Chris',registration:'CC33 CCC',drop_time:'09:00',work_required:'MOT\nCollect at 3pm',status:'provisional'}];
function setup(mechanic=true,savedView=''){
 const opened=[],{window,document}=parseHTML('<html><body><div id="content"></div></body></html>');
 window.VECTA_MECHANIC_DEPLOYMENT=mechanic;
 window.VectaBookingRules=globalThis.VectaBookingRules;
 const saved=new Map([['vecta_mechanic_day_view',savedView]]);
 const c={window,document,console,mechanicBoardSelection:undefined,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},app:{settings:{},notes:'Workshop notes',jobs},vectaJobIsDeletedForLists:()=>false,isJobInvoiced:()=>false,listPlate:reg=>'<span class="ukPlate">'+escape(reg)+'</span>',esc:escape,
  jobsForDate:()=>jobs,allJobsForDate:()=>jobs,plannerLaneMechanics:()=>['Alfie','Chris','Anyone'],plannerTechnicianName:j=>j.technician,selectedIso:()=> '2026-11-05',byTime:(a,b)=>a.drop_time.localeCompare(b.drop_time),
  unallocatedJobs:()=>[{id:'unallocated',registration:'DD44 DDD',work_required:longWork,drop_time:''}],quoteJobs:()=>[{id:'quote',registration:'EE55 EEE',work_required:longWork,drop_time:'',amount_quoted:12345}],myTasksHtml:()=>'',
  jobTypeLabels:()=>['Full Service'],normaliseJobTypeKey:s=>s.toLowerCase(),jobTypeChip:(_,label)=>'<span class="jobTypeChip">'+escape(label)+'</span>',isWebsiteBookingJob:()=>false,jobTypeInlineStyle:j=>j.status==='provisional'?'background:#cbd0d7!important':'',plannerPlate:j=>'<span class="ukPlate">'+escape(j.registration)+'</span>',partsStatusDot:()=>'',plannerVehicleLabel:j=>j.vehicle||'Vehicle',mobileJobCategoryLabel:()=> 'Staff',mobileMotAppointmentHtml:()=>'<span class="mobileMotAppointment">MOT 10:30</span>',carryOverBadgeHtml:()=>'',
  openJobModal:id=>opened.push(id),plannerWindowConfig:()=>({startMinutes:480,dayLast:960,gridPosition:0}),PLANNER_PX_PER_HOUR:60,plannerMetricsHtml:()=>'',mobilePlannerHtml:()=>'',plannerLiveControlsHtml:()=>'',mechanicHours:()=>0,currentTimeLineHtml:()=>'',plannerTimeRows:()=> '08:00',laneHtml:m=>m,unallocatedPanelHtml:()=> 'UNALLOCATED',quotePanelHtml:()=> 'QUOTES'};
 vm.createContext(c);vm.runInContext(['mechanicWorkLines','mechanicWorkView','mechanicListJob','mechanicJobCardHtml','provisionalBookingsPanelHtml','mechanicPlannerHtml','plannerHtml','bindJobOpenControls','bindMechanicNameFilter'].map(functionSource).join('\n'),c);
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
test('website service and valet show once, with the original office notes retained in read-only views',()=>{
 const {c,document}=setup();
 c.isWebsiteBookingJob=j=>j.source==='website booking';
 c.jobTypeLabels=j=>j.job_type.split(' || ');c.jobTypeStorageValue=labels=>labels.join(' || ');
 const original=websiteServiceNotes;
 const job={id:'web',source:'website booking',registration:'CM14KEL',job_type:'Full Service',work_required:original,amount_quoted:185};
 for(const types of ['Full Service','Full Service || Mini valet']){
   const copy={...job,job_type:types};
   document.getElementById('content').innerHTML=c.mechanicJobCardHtml(copy);
   assert.deepEqual([...document.querySelectorAll('.jobTypeChip')].map(n=>n.textContent),['Full Service','Mini valet']);
   assert.equal(document.querySelector('.mechanicJobDescription').textContent,'Spark plugs: Yes please, change them.');
   assert.doesNotMatch(document.getElementById('content').innerHTML,/£|185|including VAT|mileage unknown|NEVOS|confirm the price/i);
   const view=c.mechanicWorkView(copy);
   assert.equal(view.editor,'Full Service\n\nMini Valet\nSpark plugs: Yes please, change them.');assert.equal(view.details,'');
   assert.equal(view.save,undefined,'mechanic views cannot rewrite customer wording');
   assert.equal(c.mechanicListJob(copy).amount_quoted,null);assert.equal(copy.work_required,original);
 }
});
test('a saved conditional spark-plug choice appears in the read-only description without the old section',()=>{
 const {c}=setup();c.isWebsiteBookingJob=()=>true;
 const work=websiteServiceNotes.replace('Customer requests replacement.','Check the manufacturer’s guidance; replace if due. If service history is unclear, contact the customer first.');
 const job={work_required:work};
 const view=c.mechanicWorkView(job);
 assert.match(view.editor,/Spark plugs: Check first — replace if due\. If service history is unclear, contact the customer first\./);
 assert.doesNotMatch(view.editor+' '+view.details,/Optional service item|confirm the price|£/);
 assert.equal(job.work_required,work);
});
test('Main and mechanics render selected extras in the job description textarea',()=>{
 const section=main.split('\n').find(line=>line.startsWith("'<section class=\"jobFormSection jobWorkSection\">")).slice(0,-1);
 for(const isMechanic of [true,false]){
  const {c}=setup(isMechanic);c.isWebsiteBookingJob=()=>true;
  c.j={job_type:'Full Service',work_required:websiteServiceNotes};c.jobPartsRangeWorkHtml=()=>'';
  c.mechanicWork=isMechanic?c.mechanicWorkView(c.j):null;
  const {document}=parseHTML(vm.runInContext(section,c));
  const value=document.querySelector('#job_work_required').value;
  assert.equal(document.querySelector('#job_work_required').hasAttribute('readonly'),isMechanic);
  if(isMechanic)assert.match(document.querySelector('.jobWorkSection').textContent,/Read only.*Workshop notes/s);
  assert.match(value,/^Mini Valet$/m);assert.match(value,/^Spark plugs: Yes please, change them\.$/m);
  assert.doesNotMatch(value,/Optional service item/);
  assert.equal(document.querySelector('.mechanicJobDescription'),null);
  if(isMechanic)assert.doesNotMatch(value,/£|confirm the price/i);
  else assert.match(value,/Booking guide total: £185\.00/);
 }
});
test('website repairs keep customer instructions, tyre positions and advisories visible without fitted prices',()=>{
 const {c}=setup();c.isWebsiteBookingJob=()=>true;c.jobTypeLabels=()=>['Tyres','Other'];
 const job={job_type:'Tyres || Other',work_required:'Tyre size: 205/55R16\nTyre quantity: 2\nTyre positions: Both fronts\nFully fitted price: £85 per tyre; £170 total including VAT.\nTyre: Test Tyre. All prices include fitting, balancing, a standard valve, disposal and VAT.\n\nMOT Advisories, customer would like these done: Front brakes\n\nCheck noise on left turns'};
 const view=c.mechanicWorkView(job);
 assert.match(view.board,/205\/55R16/);assert.match(view.board,/Both fronts/);assert.match(view.board,/Front brakes/);assert.match(view.board,/Check noise on left turns/);
 assert.doesNotMatch(view.board+' '+view.details,/£|\bprice|VAT/i);assert.equal(view.save,undefined);
});
test('website overheating symptoms and collection instructions remain visible on every mechanic card',()=>{
 const {c,document}=setup();c.isWebsiteBookingJob=()=>true;c.jobTypeLabels=()=>['Other'];
 const work='NEVOS vehicle: NO\nVehicle is overheating - temperature gauge is climbing towards red and engine fan is staying on after the engine is turned off. There is no warm air coming through cabin fans. Potentially thermostat or water pump.\nPicking up Friday';
 const job={id:'overheating',registration:'TEST123',source:'website booking',status:'in_progress',work_required:work};
 document.getElementById('content').innerHTML=c.mechanicJobCardHtml(job);
 assert.equal(document.querySelector('.mechanicJobDescription').textContent,work.split('\n').slice(1).join('\n'));
 assert.equal(document.querySelector('.mechanicBookingInWorkshop').textContent,'In the workshop');
 assert.equal(job.work_required,work);
 for(const status of ['booked','provisional','quote','work_complete','ready_to_invoice']){
  document.getElementById('content').innerHTML=c.mechanicJobCardHtml({...job,status});
  assert.equal(!!document.querySelector('.mechanicBookingWaiting'),status==='booked');
  assert.equal(document.querySelector('.mechanicBookingInWorkshop'),null);
 }
});
test('natural-height cards preserve queue order, all mechanic groups, backlog and provisional identity',()=>{
 const t=setup(),groups=t.document.querySelectorAll('.mechanicBoardColumns .mechanicBoardGroup');
 assert.equal(groups.length,3);
 assert.deepEqual([...groups[0].querySelectorAll('.mechanicQueueCard')].map(card=>card.dataset.openJob),['first','later']);
 assert.match(groups[2].textContent,/Anyone.*No jobs here/s);
 assert.match(t.document.querySelector('[data-open-job="chris"]').textContent,/Provisionally booked/);
 assert.match(t.document.querySelector('[data-open-job="chris"]').getAttribute('style'),/#cbd0d7/);
 assert.equal(t.document.querySelectorAll('.mechanicBoardBacklog .mechanicQueueCard').length,3);
 assert.ok(groups[1].querySelector('[data-open-job="chris"]'),'provisional bookings also appear in their assigned diary');
 assert.equal(t.document.querySelector('.provisionalBookingsPanel').previousElementSibling.querySelector('h2').textContent,'Quotes1');
 assert.equal(t.document.querySelector('.provisionalBookingsPanel').nextElementSibling,null);
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

test('a full service and mini valet take less space at phone, iPad and desktop widths',{
 skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:90000
},async()=>{
 const directory=fs.mkdtempSync(path.join(tmpdir(),'vecta-compact-mechanic-'));
 try{
  const {c}=setup();c.isWebsiteBookingJob=()=>true;c.jobTypeLabels=()=>['Full Service'];
  const job={id:'web',registration:'TEST',vehicle:'Nissan Qashqai',source:'website booking',work_required:websiteServiceNotes};
  const compact=c.mechanicJobCardHtml(job);
  const {document}=parseHTML(mechanicVariant(main));
  const styles=[...document.querySelectorAll('style,link[rel=stylesheet]')].map(el=>el.tagName==='STYLE'?el.outerHTML:'<style>'+fs.readFileSync('public'+el.getAttribute('href'),'utf8')+'</style>').join('');
  const widths=[390,820,1440];
  const measure=function(){
    const card=document.querySelector('.mechanicQueueCard');
    const title=card.textContent;
    const shortHeight=card.getBoundingClientRect().height;
    const original=document.createElement('span');original.className='mechanicJobDescription';original.textContent=document.querySelector('template').content.textContent;
    card.querySelector('.mechanicCardDetails').append(original);
    const oldHeight=card.getBoundingClientRect().height;
    parent.postMessage({width:innerWidth,shortHeight,oldHeight,clean:!/[£]|mileage unknown|confirm the price/i.test(title)&&title.includes('Full Service')&&title.includes('Mini valet')},'*');
  };
  for(const width of widths){
    fs.writeFileSync(path.join(directory,width+'.html'),'<!doctype html><meta name="viewport" content="width=device-width">'+styles+'<div id="content"><div class="mechanicBoard"><div class="mechanicBoardColumns mechanicPersonalDay"><section class="mechanicBoardGroup"><div class="mechanicJobList">'+compact+'</div></section></div></div></div><template>'+escape(websiteServiceNotes)+'</template><script>('+measure.toString()+')()</script>');
  }
  const report=path.join(directory,'report.html');
  fs.writeFileSync(report,'<!doctype html><pre id="result"></pre><script>onmessage=e=>result.textContent+=JSON.stringify(e.data)+"\\n"</script>'+widths.map(width=>'<iframe width="'+width+'" height="850" src="'+width+'.html"></iframe>').join(''));
  const {stdout}=await promisify(execFile)(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+directory+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{maxBuffer:1024*1024,timeout:80000});
  const results=(stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]||'').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.deepEqual(results.map(r=>r.width).sort((a,b)=>a-b),widths);
  for(const r of results){assert.ok(r.clean&&r.shortHeight>0&&r.shortHeight+80<r.oldHeight,JSON.stringify(r));console.log('Compact mechanic card '+JSON.stringify(r));}
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
