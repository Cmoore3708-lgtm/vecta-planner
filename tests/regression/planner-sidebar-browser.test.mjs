import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const run=promisify(execFile);
const source=readFileSync('index.html','utf8');

function bookingColourSamples(entry,mechanic){
  const ctx=vm.createContext({jobTypeMeta:()=>({colour:'#123',soft:'#eee',contrast:'#fff'})});
  for(const name of ['isWebsiteBookingJob','jobTypeInlineStyle']){
    const start=entry.indexOf('function '+name+'(');
    vm.runInContext(entry.slice(start,entry.indexOf('\nfunction ',start+1)),ctx);
  }
  return ['webHold','manualHold','confirmed','unallocated'].map(kind=>{
    const job={status:kind.endsWith('Hold')?'provisional':'booked',source:kind==='manualHold'?'workshop':'website booking'};
    const card=kind.endsWith('Hold')?(mechanic?'mobileJob mechanicQueueCard':'sideJob provisionalSideCard'):kind==='unallocated'?'sideJob unallocatedSideJob':mechanic?'mobileJob mechanicQueueCard':'job';
    return '<button data-colour-check="'+kind+'" class="jobTypeCoded '+card+(ctx.isWebsiteBookingJob(job)?' websiteBookingOutline':'')+'" style="'+ctx.jobTypeInlineStyle(job)+'">Sample</button>';
  }).join('');
}

// Exercise the actual cascade in a browser. The markup fixture represents only
// the sidebar and adjacent lanes, so the check needs no workshop data or login.
function fixture(entry,mechanic,empty){
  const {document}=parseHTML(entry);
  const styles=Array.from(document.querySelectorAll('style,link[rel="stylesheet"]'),node=>{
    if(node.tagName==='STYLE')return node.outerHTML;
    return '<style>'+readFileSync('public'+node.getAttribute('href'),'utf8')+'</style>';
  }).join('');
  const cards='<div style="height:90px;flex:none">Test job</div>'.repeat(12);
  const holds='<section class="panel provisionalBookingsPanel'+(empty?' provisionalPanelEmpty':'')+'"><div class="unallocatedHead"><h3>Provisional Bookings</h3></div><div class="provisionalBookingList">'+(empty?'No provisional bookings.':cards)+'</div></section>';
  const group=(label,quote)=>mechanic?'<section class="mechanicBoardGroup"><h2 class="mechanicGroupHeading">'+label+'</h2><div class="mechanicJobList">'+cards+'</div></section>':'<aside class="panel unallocatedPanel'+(quote?' quotePanel':'')+'"><div class="unallocatedHead"><h3>'+label+'</h3></div><div class="unallocatedJobList">'+cards+'</div></aside>';
  const backlog=holds+group('Unallocated Jobs',false)+group('Quotes',true);
  const planner=mechanic?'<div class="mechanicBoard"><div class="mechanicBoardIntro">All jobs</div><div class="mechanicBoardColumns"><section data-planner-day></section></div><div class="mechanicBoardBacklog">'+backlog+'</div></div>':'<div class="mobilePlanner">'+holds+'</div><div class="plannerLayout v233Planner livePriorityPlanner"><div class="plannerCard"><div data-planner-day></div></div><div class="livePriorityBacklog">'+backlog+'</div></div>';
  return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+'<div id="content" style="padding-top:120px">'+planner+'<div hidden>'+bookingColourSamples(entry,mechanic)+'</div></div><script>('+check.toString()+')('+empty+')</script>';
}

function check(empty){
  const failures=[];
  const verify=(ok,message)=>{if(!ok)failures.push(message)};
  for(const node of document.querySelectorAll('[data-colour-check]')){
    const kind=node.dataset.colourCheck,style=getComputedStyle(node);
    verify(style.backgroundColor===(kind.endsWith('Hold')?'rgb(203, 208, 215)':'rgb(223, 240, 255)'),kind+' card face');
    const blueFrame=style.outlineWidth==='4px'&&style.outlineStyle==='solid'&&style.outlineColor==='rgb(129, 199, 255)'&&style.outlineOffset==='-4px';
    verify(blueFrame===(kind==='webHold'),kind+' website frame');
  }
  const sidebar=document.querySelector('.livePriorityBacklog,.mechanicBoardBacklog');
  const planner=sidebar.previousElementSibling;
  if(innerWidth>900){
    const sections=Array.from(sidebar.children);
    verify(sidebar.getBoundingClientRect().left>innerWidth/2,'sidebar position');
    verify(sections.map(s=>s.querySelector('h2,h3').textContent).join('|')==='Provisional Bookings|Unallocated Jobs|Quotes','section order');
    for(const height of [270,1150]){
      planner.querySelector('[data-planner-day]').style.height=height+'px';
      const rect=sidebar.getBoundingClientRect(),lane=planner.getBoundingClientRect();
      verify(lane.height>=height&&lane.height<height+50,'planner height follows its own content');
      verify(Math.abs(rect.top-lane.top)<1&&Math.abs(rect.bottom-lane.bottom)<1,'sidebar matches planner at '+height);
      for(const [i,section] of sections.entries()){
        const list=section.lastElementChild;
        verify(list.scrollHeight<=list.clientHeight+1,'all jobs expand inside section '+i);
        verify(section.scrollHeight<=section.clientHeight+1,'no clipped jobs in section '+i);
        if(i){const gap=section.getBoundingClientRect().top-sections[i-1].getBoundingClientRect().bottom;verify(gap>=0&&gap<=12,'natural section spacing '+i)}
      }
      if(empty)verify(sections[0].getBoundingClientRect().height<120,'empty bookings take only their content height');
      sidebar.scrollTop=sidebar.scrollHeight;
      verify(sidebar.scrollTop>0&&sections[2].getBoundingClientRect().bottom<=rect.bottom+1,'last quote reachable');
      sidebar.scrollTop=0;
    }
    sections.forEach(section=>section.lastElementChild.textContent='No jobs');
    verify(sidebar.scrollHeight<=sidebar.clientHeight+1,'short lists fit without scrolling');
    verify(sections[2].getBoundingClientRect().bottom<sidebar.getBoundingClientRect().top+360,'Quotes follows short lists');
  }else{
    if(sidebar.matches('.livePriorityBacklog'))verify(!sidebar.getBoundingClientRect().height,'phone uses mobile planner');
    else verify(sidebar.scrollHeight<=sidebar.clientHeight+1,'mechanic lists stack');
    const hold=document.querySelector('.mobilePlanner .provisionalBookingsPanel,.mechanicBoardBacklog .provisionalBookingsPanel');
    verify(!!hold.getBoundingClientRect().height!==empty,'mobile provisional visibility');
  }
  parent.postMessage({page:location.pathname.split('/').pop(),result:failures.join(', ')||'PASS'},'*');
}

test('the backlog has one scroll area matching the current planner height, with small screens stacking naturally',{
  skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,
  timeout:120000
},async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'vecta-sidebar-'));
  try{
    const frames=[];
    for(const mechanic of [false,true]){
      for(const [width,height,empty] of [[1440,900,false],[1024,768,true],[390,844,false],[820,1180,true]]){
        const file=(mechanic?'mechanic':'main')+'-'+width+'.html';
        writeFileSync(path.join(directory,file),fixture(mechanic?mechanicVariant(source):source,mechanic,empty));
        frames.push('<iframe width="'+width+'" height="'+height+'" src="'+file+'"></iframe>');
      }
    }
    const report=path.join(directory,'report.html');
    writeFileSync(report,'<!doctype html><pre id="results"></pre><script>onmessage=e=>{const d=e.data;results.textContent+=d.page+" "+d.result+"\\n"}</script>'+frames.join(''));
    const {stdout}=await run(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+directory+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{maxBuffer:1024*1024,timeout:90000});
    const results=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n')||[];
    assert.equal(results.length,frames.length,results.join('\n'));
    for(const result of results)assert.match(result,/ PASS$/,result);
  }finally{rmSync(directory,{force:true,recursive:true})}
});
