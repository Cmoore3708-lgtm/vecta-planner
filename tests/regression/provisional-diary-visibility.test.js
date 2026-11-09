import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
import {main,summaryContext} from './website-job-summary.test.js';
import '../../public/js/vecta-planner-rules.js';

const hold={id:'chris-hold',registration:'TEST001',vehicle:'Nissan Qashqai',technician:'Chris',booking_date:'2026-11-10',drop_time:'08:00',estimated_hours:1.5,status:'provisional',job_type:'Full Service',work_required:'Inspect brakes',card_type:'job'};
export function diaryContext(mechanic=false){
 const entry=mechanic?mechanicVariant(main):main,c=summaryContext(entry,mechanic);
 Object.assign(c,{selectedDate:'2026-11-10',mechanicBoardSelection:'',PLANNER_PX_PER_HOUR:60,
  selectedIso:()=>c.selectedDate,isVehicleTaxJob:()=>false,jobCompletionEvidence:j=>!!j.completed_at,
  vectaJobIsDeletedForLists:j=>['deleted','cancelled'].includes(j.status),isJobInvoiced:j=>!!j.invoice_id,
  unallocatedJobs:()=>[],unallocatedPanelHtml:()=>'',quoteJobs:()=>[],myTasksHtml:()=>'',plannerMetricsHtml:()=>'',
  plannerWindowConfig:()=>({startMinutes:480,dayLast:1080,gridPosition:0}),plannerLiveControlsHtml:()=>'',
  currentTimeLineHtml:()=>'',plannerTimeRows:()=>'<div>08:00</div>',mechanicHours:()=>0,
  jobTypeMeta:()=>({colour:'#444',soft:'#eee',contrast:'#fff'}),isOutstandingCarryOver:()=>false,
  topFor:j=>(Number(j.drop_time.slice(0,2))*60+Number(j.drop_time.slice(3,5))-480),heightFor:j=>Number(j.estimated_hours)*60,
 });
 c.window.VectaPlannerRules=globalThis.VectaPlannerRules;
 c.app={settings:{mechanics:['Alfie','Chris']},notes:'',jobs:[
  {...hold},{...hold,id:'chris-web-hold',registration:'TEST002',drop_time:'09:30',source:'website booking'},
  {...hold,id:'alfie-hold',technician:'Alfie'},
  {...hold,id:'tomorrow-hold',booking_date:'2026-11-11'},
  {...hold,id:'undated-hold',booking_date:null,technician:'Unallocated'},
  {...hold,id:'booked',status:'booked',drop_time:'11:00'},
  {...hold,id:'archived',archived:true},{...hold,id:'cancelled',status:'cancelled'},
  {...hold,id:'finished',status:'completed',completed_at:'2026-11-10T12:00:00Z'},
  {...hold,id:'quote',status:'quote'},{...hold,id:'invoiced',invoice_id:'invoice'},
 ]};
 for(const name of ['byTime','jobTypeInlineStyle','configuredMechanicNames','plannerLaneMechanics','plannerTechnicianName','isUnallocatedJob','allJobsForDate','jobsForDate','laneHtml','mobilePlannerHtml','mechanicPlannerHtml','plannerHtml']){
  const start=entry.indexOf('function '+name+'(');assert.ok(start>=0,name);
  vm.runInContext(entry.slice(start,entry.indexOf('\nfunction ',start+1)),c);
 }
 return c;
}

for(const mechanic of [false,true])test((mechanic?'mechanics':'Main')+': dated provisional bookings appear grey under their assigned mechanic without being confirmed',()=>{
 const c=diaryContext(mechanic),before=JSON.stringify(c.app.jobs);
 const {document}=parseHTML('<html><body>'+c.plannerHtml()+'</body></html>');
 const groups=mechanic?[...document.querySelectorAll('.mechanicBoardColumns .mechanicBoardGroup')].filter(n=>n.querySelector('h2 span').textContent==='Chris'):
  [document.querySelector('.mobileGroup-chris'),document.querySelector('.lane[data-tech="Chris"]')];
 assert.equal(groups.length,mechanic?1:2);
 for(const group of groups){
  const cards=group.querySelectorAll('[data-open-job],[data-job-id]');
  assert.deepEqual([...cards].map(n=>n.dataset.openJob||n.dataset.jobId),['chris-hold','chris-web-hold','booked']);
  for(const card of [...cards].slice(0,2))assert.match(card.getAttribute('style'),/background:#cbd0d7!important/);
 }
 assert.ok(document.querySelector('.provisionalBookingsPanel [data-open-job="chris-hold"]'),'review list remains available');
 assert.equal(JSON.stringify(c.app.jobs),before,'rendering must not change bookings, dates, times or statuses');
 c.selectedDate='2026-11-11';
 assert.deepEqual(Array.from(c.jobsForDate(),j=>j.id),['tomorrow-hold']);
 if(mechanic){
  c.selectedDate='2026-11-10';c.mechanicBoardSelection='Chris';
  const personal=parseHTML(c.plannerHtml()).document;
  assert.deepEqual([...personal.querySelectorAll('.mechanicPersonalDay [data-open-job]')].map(n=>n.dataset.openJob),['chris-hold','chris-web-hold','booked']);
 }
});

export function diaryFixture(mechanic=false){
 const c=diaryContext(mechanic),entry=mechanic?mechanicVariant(main):main;
 const {document}=parseHTML(entry);
 const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(n=>n.tagName==='STYLE'?n.outerHTML:'<style>'+fs.readFileSync('public'+n.getAttribute('href'),'utf8')+'</style>').join('');
 return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body><main id="content">'+c.plannerHtml()+'</main><script>('+checkDiaryInBrowser.toString()+')('+mechanic+')</script></body></html>';
}

for(const mechanic of [false,true])test((mechanic?'mechanics':'Main')+': provisional review cards follow unallocated jobs and quotes',()=>{
 const c=diaryContext(mechanic),before=JSON.stringify(c.app.jobs);
 c.unallocatedPanelHtml=()=>'<aside class="unallocatedPanel"><h3>Unallocated Jobs</h3></aside>';
 const {document}=parseHTML(c.plannerHtml());
 const backlog=document.querySelector(mechanic?'.mechanicBoardBacklog':'.livePriorityBacklog');
 assert.deepEqual([...backlog.children].map(n=>n.querySelector('h2,h3').textContent.trim().replace(/\s+/g,' ').replace(/\s*\d+$/,'')),['Unallocated '+(mechanic?'jobs':'Jobs'),'Quotes','Provisional Bookings']);
 assert.ok(backlog.lastElementChild.matches('.provisionalBookingsPanel'));
 if(!mechanic){
  const mobile=document.querySelector('.mobilePlanner'),panel=mobile.querySelector('.provisionalBookingsPanel');
  assert.ok(panel.previousElementSibling.matches('.mobileGroup-quotes'));
  assert.ok(panel.previousElementSibling.previousElementSibling.matches('.mobileGroup-unallocated-jobs'));
 }
 assert.equal(JSON.stringify(c.app.jobs),before,'moving the review section must not reschedule reserved diary slots');
});
function checkDiaryInBrowser(mechanic){
 const failures=[],check=(ok,label)=>{if(!ok)failures.push(label)};
 const group=mechanic?[...document.querySelectorAll('.mechanicBoardColumns .mechanicBoardGroup')].find(n=>n.querySelector('h2 span').textContent==='Chris'):
  [...document.querySelectorAll('.mobileGroup-chris,.lane[data-tech="Chris"]')].find(n=>n.getBoundingClientRect().height>0);
 check(!!group,'Chris diary rendered');
 if(!group){parent.postMessage({page:location.pathname.split('/').pop(),result:failures.join(', ')},'*');return}
 check(group.getBoundingClientRect().height>0,'Chris diary visible');
 for(const id of ['chris-hold','chris-web-hold']){
  const card=group.querySelector('[data-open-job="'+id+'"],[data-job-id="'+id+'"]');
  check(!!card,id+' allocated');if(!card)continue;
  const rect=card.getBoundingClientRect(),css=getComputedStyle(card);
  check(rect.width>0&&rect.height>0,id+' visible');
  check(rect.left>=0&&rect.right<=innerWidth+1,id+' fits screen');
  check(css.backgroundColor==='rgb(203, 208, 215)',id+' grey');
 }
 const normal=group.querySelector('[data-open-job="booked"],[data-job-id="booked"]');
 check(getComputedStyle(normal).backgroundColor!=='rgb(203, 208, 215)','confirmed card remains distinct');
 parent.postMessage({page:location.pathname.split('/').pop(),result:failures.join(', ')||'PASS'},'*');
}
test('grey provisional cards remain visible in their assigned diary on phone, tablet and desktop',{
 skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:120000
},async()=>{
 const directory=fs.mkdtempSync(path.join(tmpdir(),'vecta-provisional-diary-'));
 try{
  const frames=[];
  for(const mechanic of [false,true])for(const width of [320,390,820,1440]){
   const file=(mechanic?'mechanics':'main')+'-'+width+'.html';
   fs.writeFileSync(path.join(directory,file),diaryFixture(mechanic));
   frames.push('<iframe width="'+width+'" height="1000" src="'+file+'"></iframe>');
  }
  const report=path.join(directory,'report.html');
  fs.writeFileSync(report,'<!doctype html><pre id="results"></pre><script>onmessage=e=>{results.textContent+=e.data.page+" "+e.data.result+"\\n"}</script>'+frames.join(''));
  const {stdout}=await promisify(execFile)(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+directory+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{maxBuffer:1024*1024,timeout:90000});
  const results=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n')||[];
  assert.equal(results.length,frames.length,results.join('\n'));
  assert.deepEqual(results.filter(result=>!/ PASS$/.test(result)),[],results.join('\n'));
 }finally{fs.rmSync(directory,{force:true,recursive:true})}
});
