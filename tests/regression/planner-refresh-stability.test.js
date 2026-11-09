import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const main=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(mechanic=false){
 const html=mechanic?mechanicVariant(main):main;
 const {document,window}=parseHTML('<html><body><input id="currentDate"><h1 id="viewTitle"></h1><div id="content"></div></body></html>');
 const timers=new Map(),stats={packed:0,bound:0,enriched:0};let next=0;
 const c={document,window,console,view:'planner',plannerInteractionBusy:false,
  app:{jobs:[{id:'a',work_required:'Service',drop_time:'08:00'},{id:'b',work_required:'MOT',drop_time:'09:00'}]},
  setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
  safe:fn=>fn(),selectedIso:()=> '2026-11-09',navItems:()=>[['planner','Dashboard'],['jobs','Jobs']],renderNav(){},
  vectaCreateInvoiceLookup:()=>({}),plannerPackVisibleDay(){stats.packed++;},
  bindView(){stats.bound++;},linkifyDisplayedEmails(){},jobsHtml:()=>'<p>Jobs</p>',
  plannerHtml(){return '<section>'+c.app.jobs.map(j=>'<div class="job" draggable="true" data-job-id="'+j.id+'"><span>'+j.drop_time+'</span><p>'+j.work_required+'</p></div>').join('')+'</section>';}
 };
 window.enrichHaynesDashboard=container=>{stats.enriched++;for(const card of container.querySelectorAll('.job'))if(!card.querySelector('img'))card.append(document.createElement('img'));};
 window.setTimeout=c.setTimeout; // The planner render function lives inside its application closure.
 vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-planner-rules.js',import.meta.url),'utf8'),{window});
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function deferPlannerRender('),html.indexOf('function vectaCreateInvoiceLookup(')),c);
 const tick=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());};
 return {c,document,window,timers,stats,tick};
}

for(const mechanic of [false,true]){
 test((mechanic?'mechanics':'main')+' preserves cards, saved images and text scroll on unchanged refreshes',()=>{
  const {c,document,stats}=setup(mechanic);c.render();
  const content=document.getElementById('content'),root=content.firstChild,card=content.querySelector('.job'),image=card.querySelector('img'),work=card.querySelector('p');
  work.scrollTop=32;
  for(let i=0;i<20;i++)c.render({fromCloud:true});
  assert.equal(content.firstChild,root);assert.equal(content.querySelector('.job'),card);assert.equal(card.querySelector('img'),image);assert.equal(work.scrollTop,32);
  assert.equal(stats.bound,1);assert.equal(stats.enriched,1);assert.equal(stats.packed,1);
 });
 test((mechanic?'mechanics':'main')+' updates changed work while keeping unaffected cards mounted',()=>{
  const {c,document}=setup(mechanic);c.render();
  const before=[...document.querySelectorAll('.job')],image=before[0].querySelector('img');
  c.app.jobs[1].work_required='MOT and tyres';c.render({fromCloud:true});
  const after=[...document.querySelectorAll('.job')];
  assert.equal(after[0],before[0]);assert.equal(after[0].querySelector('img'),image);assert.notEqual(after[1],before[1]);assert.match(after[1].textContent,/MOT and tyres/);
  c.view='jobs';c.render();c.view='planner';c.render();assert.equal(document.querySelectorAll('.job').length,2);
 });
}

test('all render callers defer during a gesture and apply the latest cloud update once it ends',()=>{
 const {c,document,timers,stats,tick}=setup();c.render();const card=document.querySelector('.job');
 c.plannerInteractionBusy=true;c.app.jobs[0].work_required='New instructions';
 for(let i=0;i<5;i++)c.render({fromCloud:true});
 assert.equal(timers.size,1);assert.equal(document.querySelector('.job'),card);tick();assert.equal(timers.size,1);assert.equal(stats.bound,1);
 c.plannerInteractionBusy=false;tick();assert.match(document.querySelector('.job').textContent,/New instructions/);assert.equal(stats.bound,2);assert.equal(stats.packed,1);assert.equal(timers.size,0);
});

test('pointer-down before dragstart protects the card and cancellation releases the deferred render',()=>{
 const {c,document,window,tick}=setup();c.render();const card=document.querySelector('.job');
 card.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(window.__vectaPlannerPointerHeld,true);
 c.app.jobs[0].work_required='Changed';c.render({fromCloud:true});assert.equal(document.querySelector('.job'),card);
 card.dispatchEvent(new window.Event('pointercancel',{bubbles:true}));tick();assert.match(document.querySelector('.job').textContent,/Changed/);
});

test('a queued local move keeps its packing request when cloud updates arrive during the drag',()=>{
 const {c,stats,tick}=setup();c.render();c.plannerInteractionBusy=true;c.render();c.render({fromCloud:true});
 c.plannerInteractionBusy=false;tick();assert.equal(stats.packed,2);
});

test('multi-row cloud moves render without writing intermediate positions back',()=>{
 const {c,document,tick,stats}=setup();c.render();
 Object.assign(c,{cloudRefreshDebounce:null,saveLocal(){},mergeRemoteRows:(rows,changed)=>rows.map(row=>changed.find(x=>x.id===row.id)||row),vectaApplyTerminalJobStates(){},vectaRunDataIngressMigrations(){},repairExistingPlannerOverlaps:async()=>0});
 vm.runInContext(main.slice(main.indexOf('function scheduleCloudRefresh('),main.indexOf('function startCloudSync(')),c);
 c.scheduleCloudRefresh({table:'jobs',eventType:'UPDATE',new:{...c.app.jobs[0],drop_time:'09:00'}});tick();
 assert.equal(stats.packed,1,'a partial remote move must not start a new queue packing write');
 c.scheduleCloudRefresh({table:'jobs',eventType:'UPDATE',new:{...c.app.jobs[1],drop_time:'08:00'}});tick();
 assert.equal(stats.packed,1);assert.match(document.querySelector('[data-job-id="b"]').textContent,/08:00/);
});

test('an older background save completing cannot unlock a new drag or resize',async()=>{
 const {c}=setup();let finish;
 c.persistPlannerJobs=()=>new Promise(resolve=>{finish=resolve;});
 vm.runInContext(main.slice(main.indexOf('var plannerSaveQueue='),main.indexOf('/* Resize the same ordered queue')),c);
 c.persistPlannerJobsInBackground([{id:'a'}]);await Promise.resolve();
 c.plannerInteractionBusy=true;finish();await c.plannerSaveQueue;
 assert.equal(c.plannerInteractionBusy,true);assert.equal(c.plannerSaveCount,0);assert.equal(c.cloudRefreshBusy,false);
 c.persistPlannerJobsInBackground([]);assert.equal(c.plannerInteractionBusy,true);
});

test('a previous drag click-suppression timer cannot unlock the next drag',()=>{
 const {c,document,window,timers}=setup();c.render();window.matchMedia=()=>({matches:false});c.bindResize=()=>{};
 vm.runInContext(main.slice(main.indexOf('function bindDrag('),main.indexOf('function minutesFromTime(')),c);
 const card=document.querySelector('.job');card.getBoundingClientRect=()=>({top:0});c.bindDrag(card);
 const event={clientY:30,dataTransfer:{setData(){}},preventDefault(){}};
 card.ondragstart(event);card.ondragend();const previousTimers=[...timers.values()];timers.clear();
 card.ondragstart(event);previousTimers.forEach(fn=>fn());assert.equal(c.plannerInteractionBusy,true);
});
