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

const run=promisify(execFile);
const main=readFileSync('index.html','utf8');
const helper=readFileSync('public/js/haynes-job-tools.js','utf8');
const match={registration:'AB12CDE',make:'Toyota',model:'Yaris',variant:'1.0',typeId:'t_123',engineCode:'1KR',fetchedAt:'2021-01-01T00:00:00Z'};

function card(mechanic){
 const {document}=parseHTML(mechanic?mechanicVariant(main):main);
 const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>
  node.tagName==='STYLE'?node.outerHTML:'<style>'+readFileSync('public'+node.getAttribute('href'),'utf8')+'</style>'
 ).join('');
 return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+
  '<div id="jobModal" class="modal open" aria-hidden="false"><div class="modalCard jobModalCard">'+
  '<header class="jobModalHead"><h2>Edit job</h2></header><section class="jobVehicleSection"><div class="jobSectionGrid">'+
  '<input id="job_registration" value="AB12CDE"><input id="job_make" value="Toyota"><input id="job_model" value="Yaris"></div></section></div></div>'+
  '<script>window.VECTA_MECHANIC_DEPLOYMENT='+mechanic+';window.fetch=()=>{throw Error("Unexpected network lookup")};'+
  'window.VectaFleetImages={artwork:()=>\'<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg"></svg>\'};</script>'+
  '<script>'+helper+'</script><script>VectaHaynesJobTools.remember('+JSON.stringify(match)+',true,{allowExpiredIdentity:true});'+
  'initHaynesJobTools(document.querySelector("#jobModal"));'+
  'const height=document.querySelector(".jobCardHeaderVehicle svg").getBoundingClientRect().height;'+
  'const details=document.querySelector(".haynesJobVehicle strong");'+
  'parent.postMessage({width:innerWidth,mechanic:'+mechanic+',height,visible:details.textContent.includes("Yaris")&&details.getBoundingClientRect().height>0},"*");</script>';
}

test('the reopened card shows Haynes on each screen and doubles the vehicle only on the Main PC editor',{
 skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:120000
},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vecta-haynes-card-'));
 try{
  const frames=[];
  for(const mechanic of [false,true]){
   const file=(mechanic?'mechanic':'main')+'.html';writeFileSync(path.join(dir,file),card(mechanic));
   for(const width of [1440,820,390])frames.push('<iframe width="'+width+'" height="900" src="'+file+'"></iframe>');
  }
  const report=path.join(dir,'report.html');
  writeFileSync(report,'<!doctype html><pre id="results"></pre><script>onmessage=e=>results.textContent+=JSON.stringify(e.data)+"\\n"</script>'+frames.join(''));
  const {stdout}=await run(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--allow-file-access-from-files','--no-first-run','--user-data-dir='+dir+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{timeout:90000,maxBuffer:1024*1024});
  const rows=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n').filter(Boolean).map(JSON.parse)||[];
  assert.equal(rows.length,6);
  for(const row of rows){
   assert.equal(row.visible,true,JSON.stringify(row));
   assert.equal(row.height,!row.mechanic&&row.width>=1050?200:100,JSON.stringify(row));
  }
 }finally{rmSync(dir,{force:true,recursive:true});}
});
