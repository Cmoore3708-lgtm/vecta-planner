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
export function popupFixture(mechanic){
 const {document}=parseHTML(mechanic?mechanicVariant(main):main);
 const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>node.tagName==='STYLE'?node.outerHTML:'<style>'+readFileSync('public'+node.getAttribute('href'),'utf8')+'</style>').join('');
 return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+`
 <div id="jobModal" class="modal open"><div class="modalCard jobModalCard"><input id="job_registration" value="PARENT"><textarea id="job_work_required">Unsaved parent work</textarea><input id="part" value="Unsaved parent part"><input id="ordered" type="checkbox" checked><button id="calendarCard">Calendar job</button><button id="cancelJob">Close job</button><button id="saveJob">Save &amp; Close</button></div></div>
 <script>
 const child=new URLSearchParams(location.search).get('calendarJobPopup');
 let refreshes=0;const parentNode=document.getElementById('jobModal');
 window.vectaCalendarPopupState=()=>({jobs:[{id:'CHILD'}],isDeleted:()=>false});
 window.openJobModal=id=>{document.getElementById('job_registration').value=id;document.getElementById('job_work_required').value='Child work';return 'open';};
 </script><script>${readFileSync('public/js/calendar-job-popup.js','utf8')}</script><script>
 document.getElementById('calendarCard').onclick=()=>VectaCalendarJobPopup.open('CHILD','AB12 CDE',()=>{refreshes++;});
 document.getElementById('saveJob').onclick=()=>VectaCalendarJobPopup.saved();
 if(!child)addEventListener('load',async()=>{
  const errors=[];const check=(ok,label)=>{if(!ok)errors.push(label);};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
  async function ready(){for(let n=0;n<150;n++){const frame=document.querySelector('dialog iframe'),w=frame?.contentWindow;if(w?.document.querySelector('#job_registration')?.value==='CHILD'&&!w.document.querySelector('.calendarJobPopupStatus'))return w;await pause();}throw Error('Child editor never opened');}
  try{
   const card=document.getElementById('calendarCard');card.focus();check(document.activeElement===card,'initial focus target');card.click();const w=await ready();
   const d=document.querySelector('dialog'),box=d.getBoundingClientRect();
   check(d.open&&d.matches(':modal'),'native modal focus boundary');check(box.left>=0&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1,'popup fits viewport');
   check(parentNode===document.getElementById('jobModal'),'same parent DOM');check(document.getElementById('job_registration').value==='PARENT','parent identity');
   const input=w.document.getElementById('job_work_required');input.value='Child edit';input.dispatchEvent(new w.Event('input',{bubbles:true}));
   w.confirm=()=>false;d.querySelector('header button').click();check(!!document.querySelector('dialog'),'cancel discard keeps popup');
   w.__vectaJobSaveFenceUntil=Date.now()+6000;w.confirm=()=>true;d.querySelector('header button').click();check(!!document.querySelector('dialog'),'pending save keeps popup');w.__vectaJobSaveFenceUntil=0;
   VectaCalendarJobPopup.finishChild(window);check(!!document.querySelector('dialog'),'unrelated window cannot close popup');
   w.document.getElementById('cancelJob').click();await pause();check(!document.querySelector('dialog'),'child close returns to parent');check(document.activeElement===card,'focus returns to calendar card: '+document.activeElement?.tagName+'#'+document.activeElement?.id);
   card.click();const saved=await ready();saved.document.getElementById('saveJob').click();await pause();check(!document.querySelector('dialog'),'save closes only popup');
   check(document.getElementById('job_work_required').value==='Unsaved parent work','parent description retained');check(document.getElementById('part').value==='Unsaved parent part','parent part retained');check(document.getElementById('ordered').checked,'parent checkbox retained');check(refreshes===2,'calendar refreshes after close and save');
  }catch(error){errors.push(error.message);}
  parent.postMessage({popup:true,mechanic:${mechanic},width:innerWidth,errors},'*');
 });
 </script>`;
}

export function popupReport(frames){
 // Run one viewport at a time so sibling iframes cannot steal keyboard focus.
 return '<!doctype html><pre id="results"></pre><div id="stage"></div><script>const frames='+JSON.stringify(frames)+';function next(){stage.innerHTML=frames.shift()||"";}onmessage=e=>{if(e.data.popup){results.textContent+=JSON.stringify(e.data)+"\\n";next();}};next();</script>';
}

test('calendar popups isolate both editors, preserve drafts, fit phones and return keyboard focus',{
 skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:120000
},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vecta-calendar-popup-'));
 try{
  const frames=[];
  for(const mechanic of [false,true]){
   const file=(mechanic?'mechanic':'main')+'.html';writeFileSync(path.join(dir,file),popupFixture(mechanic));
   for(const width of [1440,820,390,320])frames.push('<iframe width="'+width+'" height="900" src="'+file+'"></iframe>');
  }
  const report=path.join(dir,'report.html');writeFileSync(report,popupReport(frames));
  const {stdout}=await run(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--allow-file-access-from-files','--no-first-run','--user-data-dir='+dir+'/profile','--virtual-time-budget=10000','--dump-dom',pathToFileURL(report).href],{timeout:90000,maxBuffer:1024*1024});
  const rows=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n').filter(Boolean).map(JSON.parse)||[];
  assert.equal(rows.length,8);for(const row of rows)assert.deepEqual(row.errors,[],JSON.stringify(row));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
