import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const run=promisify(execFile);
const source=readFileSync('index.html','utf8');

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
  const planner=mechanic?'<div class="mechanicBoard"><div class="mechanicBoardIntro">All jobs</div><div class="mechanicBoardColumns"></div><div class="mechanicBoardBacklog">'+backlog+'</div></div>':'<div class="mobilePlanner">'+holds+'</div><div class="plannerLayout v233Planner livePriorityPlanner"><div class="plannerCard"></div><div class="livePriorityBacklog">'+backlog+'</div></div>';
  const helpers=entry.slice(entry.indexOf('function plannerBacklogScrollAreas('),entry.indexOf('var renderInProgress=false;'));
  return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+'<div id="content" style="padding-top:120px">'+planner+'</div><pre id="out"></pre><script>'+helpers+'\n('+check.toString()+')('+empty+')</script>';
}

function check(empty){
  const failures=[];
  const verify=(ok,message)=>{if(!ok)failures.push(message)};
  sizePlannerBacklog();
  const [sidebar,...lists]=plannerBacklogScrollAreas(),rect=sidebar.getBoundingClientRect();
  if(innerWidth>900){
    const rows=Array.from(sidebar.children,el=>el.getBoundingClientRect());
    verify(rect.left>innerWidth/2,'sidebar position');
    verify(Math.abs(rect.bottom+scrollY-innerHeight)<1,'sidebar height');
    verify(Math.abs(rows[0].height-rows[1].height)<1,'50/50 split');
    verify(Math.abs(rows[1].bottom-rect.bottom)<1&&rows[2].top>=rect.bottom,'Quotes below the fold');
    lists.forEach((list,i)=>{if(i||!empty){list.scrollTop=50;verify(list.scrollTop===50,'list '+i+' scroll')}});
    sidebar.scrollTop=sidebar.scrollHeight;
    verify(sidebar.scrollTop>0&&sidebar.lastElementChild.getBoundingClientRect().bottom<=rect.bottom+1,'Quotes reachable');
  }else{
    if(sidebar.matches('.livePriorityBacklog'))verify(!rect.height,'phone uses mobile planner');
    else verify(sidebar.scrollHeight<=sidebar.clientHeight+1,'mechanic lists stack');
    const hold=document.querySelector('.mobilePlanner .provisionalBookingsPanel,.mechanicBoardBacklog .provisionalBookingsPanel');
    verify(!!hold.getBoundingClientRect().height!==empty,'mobile provisional visibility');
  }
  document.getElementById('out').textContent=failures.join(', ')||'PASS';
}

test('desktop backlog fills two equal panels with Quotes below, and small screens keep the stacked layout',{
  skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,
  timeout:120000
},async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'vecta-sidebar-'));
  try{
    for(const mechanic of [false,true]){
      for(const [width,height,empty] of [[1440,900,false],[1024,768,true],[390,844,false],[820,1180,true]]){
        const file=path.join(directory,'fixture.html');
        writeFileSync(file,fixture(mechanic?mechanicVariant(source):source,mechanic,empty));
        const {stdout}=await run(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+directory+'/profile','--window-size='+width+','+height,'--dump-dom',pathToFileURL(file).href],{maxBuffer:4*1024*1024,timeout:20000});
        assert.equal(stdout.match(/<pre id="out">([^<]*)<\/pre>/)?.[1],'PASS',(mechanic?'Mechanic':'Main')+' at '+width+' px');
      }
    }
  }finally{rmSync(directory,{force:true,recursive:true})}
});
