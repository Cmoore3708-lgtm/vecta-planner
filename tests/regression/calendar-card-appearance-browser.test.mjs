import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const run=promisify(execFile),main=readFileSync('index.html','utf8');
const popupSource=readFileSync('public/js/calendar-job-popup.js','utf8');
const planner=popupSource.slice(popupSource.indexOf('  function calendarPlannerHtml('),popupSource.indexOf(' function mergeQueuedJobs('));
const start=main.indexOf('function installNewJobAvailabilityCalendar(');
const calendar=main.slice(start,main.indexOf('\n\nfunction previousVehicleWork(',start));

function fixture(mechanic,dashboard){
 const {document}=parseHTML(mechanic?mechanicVariant(main):main);
 const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>node.tagName==='STYLE'?node.outerHTML:'<style>'+readFileSync('public'+node.getAttribute('href'),'utf8')+'</style>').join('');
 const field=dashboard?'currentDate':'job_booking_date';
 return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+
  (dashboard?'<input id="currentDate" value="2026-11-18">':'<div id="jobModal" class="modal open"><div class="modalCard jobModalCard jobCardSimplified"><div class="jobCardSections"><div class="jobCardSupportColumn"><input id="job_booking_date" value="2026-11-18"></div></div></div></div>')+
  `<script>
  const app={settings:{mechanics:['Alfie','Chris','Anyone']},jobs:[
   {id:'short-job',registration:'AB12 CDE',booking_date:'2026-11-18',drop_time:'08:00',technician:'Alfie',status:'booked',work_required:'Full service and front brake inspection',estimated_hours:.5},
   {id:'long-job',registration:'CD34 EFG',booking_date:'2026-11-18',drop_time:'09:00',technician:'Chris',status:'booked',work_required:'Investigate intermittent engine warning light',estimated_hours:2}
  ]};
  const editingJobId='current-job',opened=[];
  const selectedIso=()=> '2026-11-18',todayIso=()=> '2026-11-16',esc=v=>String(v||''),niceDate=v=>v;
  const isVehicleTaxJob=()=>false,vectaJobIsDeletedForLists=()=>false,isUnallocatedJob=()=>false,plannerTechnicianLane=v=>v,mechanicHours=()=>1,byTime=()=>0,jobTitle=()=> 'Work';
  const openJobModal=id=>opened.push(id),confirm=()=>{throw Error('Unexpected discard prompt')};
  ${planner}
  window.VectaCalendarJobPopup={plannerHtml:calendarPlannerHtml,open:openJobModal};
  ${calendar}
  installNewJobAvailabilityCalendar(true,'${field}');
  ${dashboard?"document.getElementById('currentDate').onclick({preventDefault(){}});":"document.querySelector('.bookingDateDisclosure').open=true;"}
  Promise.resolve().then(()=>{
   const differences=[],cards=[...document.querySelectorAll('button.v243PlannerJob')];
   const properties=['fontSize','fontFamily','fontWeight','lineHeight','letterSpacing','textAlign','color','backgroundColor','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderLeftWidth','borderTopColor','borderLeftColor','borderRadius','boxShadow','whiteSpace','textOverflow'];
   for(const card of cards){
    // Before clickable cards, this exact markup was a div with these same classes,
    // top/height and child nodes. Compare against that rendered reference.
    const previous=document.createElement('div');previous.className=card.className;previous.style.cssText=card.style.cssText;previous.style.removeProperty('text-align');previous.innerHTML=card.innerHTML;card.after(previous);
    const compare=(actual,expected,label)=>{
     const a=getComputedStyle(actual),b=getComputedStyle(expected);
     for(const property of properties)if(a[property]!==b[property])differences.push(label+' '+property+': '+a[property]+' != '+b[property]);
     const ar=actual.getBoundingClientRect(),br=expected.getBoundingClientRect(),ac=card.getBoundingClientRect(),bc=previous.getBoundingClientRect();
     for(const [key,av,bv] of [['width',ar.width,br.width],['height',ar.height,br.height],['left',ar.left-ac.left,br.left-bc.left],['top',ar.top-ac.top,br.top-bc.top]])if(Math.abs(av-bv)>.1)differences.push(label+' '+key+': '+av+' != '+bv);
    };
    compare(card,previous,card.dataset.v243OpenJob);
    [...card.children].forEach((child,i)=>compare(child,previous.children[i],card.dataset.v243OpenJob+' '+child.tagName));
    previous.remove();
   }
   const fontSize=getComputedStyle(cards[0]).fontSize,registrationSize=getComputedStyle(cards[0].querySelector('b')).fontSize;
   cards[0].click();
   parent.postMessage({width:innerWidth,mechanic:${mechanic},dashboard:${dashboard},differences,fontSize,registrationSize,opened,cardCount:cards.length},'*');
  });
  </script>`;
}

test('clickable calendar cards match the original compact div appearance on Main and mechanics',{
 skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:120000
},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vecta-calendar-appearance-'));
 try{
  const frames=[];
  for(const mechanic of [false,true])for(const dashboard of [false,true]){
   const file=(mechanic?'mechanic':'main')+'-'+(dashboard?'dashboard':'booking')+'.html';writeFileSync(path.join(dir,file),fixture(mechanic,dashboard));
   for(const width of [1440,820,390,320])frames.push('<iframe width="'+width+'" height="900" src="'+file+'"></iframe>');
  }
  const report=path.join(dir,'report.html');
  writeFileSync(report,'<!doctype html><pre id="results"></pre><script>onmessage=e=>results.textContent+=JSON.stringify(e.data)+"\\n"</script>'+frames.join(''));
  const {stdout}=await run(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--allow-file-access-from-files','--no-first-run','--user-data-dir='+dir+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{timeout:90000,maxBuffer:1024*1024});
  const rows=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n').filter(Boolean).map(JSON.parse)||[];
  assert.equal(rows.length,16);
  for(const row of rows){
   const context=JSON.stringify(row);assert.deepEqual(row.differences,[],context);
   assert.equal(row.fontSize,'8px',context);assert.equal(row.registrationSize,'9px',context);
   assert.equal(row.cardCount,2,context);assert.deepEqual(row.opened,['short-job'],context);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
