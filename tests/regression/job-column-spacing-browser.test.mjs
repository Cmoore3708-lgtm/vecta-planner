import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';

// Real application styles and balancer, with a deliberately tall, indivisible
// conversation. Mocked rectangle tests cannot catch auto margins created by CSS.
export function columnCard(){
 const {document}=parseHTML(readFileSync('index.html','utf8'));
 const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>node.tagName==='STYLE'?node.outerHTML:'<style>'+readFileSync('public'+node.getAttribute('href'),'utf8')+'</style>').join('');
 const source=readFileSync('public/js/haynes-job-tools.js','utf8'),start=source.indexOf('function balanceJobSections(');
 const balance=source.slice(start,source.indexOf('\nroot.initHaynesJobTools=',start));
 return `<!doctype html><meta name="viewport" content="width=device-width">${styles}
 <div id="jobModal" class="modal open" aria-hidden="false"><div class="modalCard jobModalCard jobCardSimplified"><header class="jobModalHead"><h2>Job card layout check</h2></header><div class="modalBody jobModalBody"><div class="jobCardSections">
 <div class="jobCardMainColumn">
 <section class="jobVehicleHistory" style="min-height:40px">Previous work</section>
 <section class="jobFormSection jobWorkSection" style="min-height:260px"><h3>Job description</h3><textarea id="job_work_required">Steering wheel vibrates while braking.</textarea></section>
 <section class="jobFormSection jobInternalNotesSection" style="min-height:100px"><h3>Workshop notes</h3><textarea id="job_internal_workshop_notes">Keep this note</textarea></section>
 <section class="jobFormSection" id="parts" style="min-height:140px"><h3>Parts list</h3><input value="Brake pads"></section>
 <section class="jobFormSection privatePricingSection" id="pricing" style="min-height:190px"><h3>Invoice description &amp; pricing</h3><textarea>Brake check</textarea></section>
 </div><div class="jobCardSupportColumn"><div class="bookingAvailabilityWorkspace hasDayPlanner"><details class="bookingDateDisclosure"><summary>Change booking date</summary><div class="bookingDateBody" style="min-height:400px">Calendar</div></details></div></div>
 </div></div><div class="modalFoot"><button>Cancel</button><button>Save &amp; Close</button></div></div></div>
 <script>const root=window;${balance}
 const modal=document.querySelector('#jobModal'),sections=modal.querySelector('.jobCardSections'),main=sections.querySelector('.jobCardMainColumn'),aside=sections.querySelector('.jobCardSupportColumn'),parts=document.querySelector('#parts'),pricing=document.querySelector('#pricing');
 balanceJobSections(modal,sections,main,aside,parts,pricing);
 const note=document.querySelector('#job_internal_workshop_notes');
 setTimeout(()=>{
  const messages=document.createElement('section');messages.className='jobFormSection portalWorkshop';messages.style.minHeight='900px';messages.innerHTML='<h3>Customer messages</h3><p>A long customer conversation.</p>';
  main.append(messages);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const visible=[...aside.children].filter(el=>el.getBoundingClientRect().height>0),rect=el=>el.getBoundingClientRect();
   const report={width:innerWidth,gaps:visible.slice(1).map((el,i)=>rect(el).top-rect(visible[i]).bottom),rightUsed:rect(parts).top-rect(aside).top,
    lastTwo:[...aside.children].slice(-2).map(el=>el.id),preserved:note===document.querySelector('#job_internal_workshop_notes')&&note.value==='Keep this note',
    sideBySide:rect(aside).left>=rect(main).right,overflow:modal.scrollWidth>modal.clientWidth+1,
    mobileRestored:messages.parentElement===main&&note.parentElement.parentElement===main};
   parent.postMessage(report,'*');
  }));
 },50);
 </script>`;
}

export function columnReport(){return '<!doctype html><pre id="results"></pre><script>onmessage=e=>results.textContent+=JSON.stringify(e.data)+"\\n"</script>'+[1440,820,390].map(width=>'<h2>'+width+'px</h2><iframe width="'+width+'" height="900" src="columns.html"></iframe>').join('');}

test('job sections fill the right column from the top without a blank spacer above Parts',{
 skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:120000
},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vecta-job-columns-'));
 try{
  writeFileSync(path.join(dir,'columns.html'),columnCard());
  const report=path.join(dir,'report.html');writeFileSync(report,columnReport());
  const {stdout}=await promisify(execFile)(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--allow-file-access-from-files','--no-first-run','--user-data-dir='+dir+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{timeout:90000,maxBuffer:1024*1024});
  const rows=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n').filter(Boolean).map(JSON.parse)||[];
  assert.equal(rows.length,3);
  for(const row of rows){
   const context=JSON.stringify(row);
   assert.ok(row.gaps.every(gap=>gap>=0&&gap<=12),context);
   assert.deepEqual(row.lastTwo,['parts','pricing'],context);
   assert.equal(row.preserved,true,context);assert.equal(row.overflow,false,context);
   assert.equal(row.sideBySide,row.width>700,context);
   if(row.width<=700)assert.equal(row.mobileRestored,true,context);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
