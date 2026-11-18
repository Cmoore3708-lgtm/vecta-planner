import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
import {main,summaryContext} from './website-job-summary.test.js';

import '../../public/js/vecta-dashboard-parts.js';

function fixture(variant,width,sidebar){
  const src=variant==='mechanic'?mechanicVariant(main):main;
  const c=summaryContext(src,variant==='mechanic');
  Object.assign(c,{PARTS_STATUS_VALUES:['','Not required','Parts need ordering','Awaiting parts','Parts here'],
    normReg:s=>s,fleetIsInternalRegistration:()=>false,fleetPlateStripStyle:()=>'',jobParts:()=>[]});
  for(const name of ['partsStoredStatus','normalisePartsStatus','partsStatusDot','partsStatusClass','partsStatusFromJob','listPlate','fullPlate','plannerPlate','compactUnallocatedPlate']){
    const start=src.indexOf('function '+name+'(');
    vm.runInContext(src.slice(start,src.indexOf('\nfunction ',start+1)).split('\nvar PARTS_STATUS_VALUES')[0],c);
  }
  c.dashboardParts=globalThis.VectaDashboardParts.create({...c,values:c.PARTS_STATUS_VALUES});
  const j={id:'sample',customer_account:'Staff',customer_name:'Alexandrianna Smith',technician:'Alfie',job_type:'Other',registration:'AB12ABC',
    vehicle:'Nissan Qashqai',parts_status:'Parts need ordering',work_required:'Check brakes',estimated_hours:1,source:'website booking'};
  let body;
  if(variant==='mechanic')body='<div class="mechanicBoard"><section class="mechanicJobList">'+c.mechanicJobCardHtml(j)+'</section></div>';
  else if(width<=768)body='<div class="mobilePlanner"><div class="mobileGroup">'+c.mobileJobCardHtml(j)+'</div></div>';
  else if(sidebar)body='<div class="plannerLayout v233Planner livePriorityPlanner"><div class="plannerCard" style="height:420px"></div><div class="livePriorityBacklog"><aside class="panel unallocatedPanel"><div class="unallocatedJobList">'+c.unallocatedJobCardHtml(j)+'</div></aside></div></div>';
  else body='<div class="livePriorityPlanner"><div class="plannerGrid"><div class="lane" style="width:330px;height:320px">'+c.jobCardHtml(j)+'</div></div></div>';

  const {document}=parseHTML(src);
  const styles=[...document.querySelectorAll('style,link[rel=stylesheet]')].map(el=>
    el.tagName==='STYLE'?el.outerHTML:'<style>'+readFileSync('public'+el.getAttribute('href'),'utf8')+'</style>').join('');
  return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+'<div id="content" style="padding:6px!important">'+body+'</div><script>('+checkLayout.toString()+')()</script>';
}
function checkLayout(){
  const card=document.querySelector('.job,.mobileJob,.unallocatedSideJob');
  const target=card.querySelector('.plannerJobHeader')||card;
  const image=document.createElement('img');
  image.className='haynesDashboardImage';
  image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90"><path fill="silver" d="M8 60L32 50L61 24H127L150 48L174 53V73H7Z"/></svg>');
  target.classList.add('hasHaynesDashboardImage');
  target.append(image);
  image.onload=()=>{
    card.scrollIntoView({block:'center',inline:'center'});
    const plate=card.querySelector('.ukPlate').getBoundingClientRect();
    const name=card.querySelector('.plannerJobCustomer,.mobileJobCategory,.dashboardCustomerName');
    const control=(card.closest('.dashboardCardActions')||card).querySelector('select');
    const n=name.getBoundingClientRect(),a=card.getBoundingClientRect(),i=image.getBoundingClientRect(),r=control.getBoundingClientRect();
    const errors=[];
    if(name.textContent!=='Alexandrianna'||n.width<18||n.x<plate.right-1||n.y>=plate.bottom)errors.push('name placement '+JSON.stringify([n,plate]));
    if(card.matches('.mobileJob,.unallocatedSideJob')&&n.right>i.x+1&&n.bottom>i.y+1&&n.x<i.right&&n.y<i.bottom)errors.push('name touches artwork');
    if(Math.abs(r.right-a.right)>10||Math.abs(r.bottom-a.bottom)>10)errors.push('parts control corner');
    control.scrollIntoView({block:'center',inline:'center'});
    const hit=control.getBoundingClientRect();
    if(document.elementFromPoint(hit.x+hit.width/2,hit.y+hit.height/2)!==control)errors.push('parts control covered by '+document.elementFromPoint(hit.x+hit.width/2,hit.y+hit.height/2)?.className+' at '+JSON.stringify(hit));
    parent.postMessage(errors.join(' / ')||'PASS','*');
  };
}

test('first name and parts control fit Main and mechanic cards at phone, tablet and desktop widths',{
  skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:90000
},async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'vecta-parts-control-'));
  try{
    const cases=[['main',320],['main',390],['main',1440],['main',1440,true],['mechanic',390],['mechanic',820],['mechanic',1440]];
    const frames=cases.map(([variant,width,sidebar])=>{
      const id=[variant,width,sidebar?'sidebar':'card'].join('-');
      writeFileSync(path.join(dir,id+'.html'),fixture(variant,width,sidebar));
      return '<iframe id="'+id+'" width="'+width+'" height="650" src="'+id+'.html"></iframe>';
    });
    const file=path.join(dir,'report.html');
    writeFileSync(file,'<!doctype html><pre id="results"></pre><script>onmessage=e=>{let f=[...document.querySelectorAll("iframe")].find(x=>x.contentWindow===e.source);results.textContent+=f.id+" "+e.data+"\\n"}</script>'+frames.join(''));
    const {stdout}=await promisify(execFile)(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+path.join(dir,'profile'),'--virtual-time-budget=4000','--dump-dom',pathToFileURL(file).href],{timeout:80000,maxBuffer:1024*1024});
    const results=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n')||[];
    assert.equal(results.length,cases.length,results.join('\n'));
    assert.ok(results.every(line=>line.endsWith(' PASS')),results.join('\n'));
  }finally{rmSync(dir,{recursive:true,force:true})}
});
