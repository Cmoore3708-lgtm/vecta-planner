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
const match={registration:'AB12CDE',make:'MERCEDES-BENZ',model:'EQC 400 AMG LINE 4MATIC',variant:'400 4MATIC',typeId:'t_123',engineCode:'1KR',fetchedAt:'2021-01-01T00:00:00Z'};

function card(mechanic){
 const {document}=parseHTML(mechanic?mechanicVariant(main):main);
 const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>
  node.tagName==='STYLE'?node.outerHTML:'<style>'+readFileSync('public'+node.getAttribute('href'),'utf8')+'</style>'
 ).join('');
 return '<!doctype html><meta name="viewport" content="width=device-width">'+styles+
  '<div id="jobModal" class="modal open" aria-hidden="false"><div class="modalCard jobModalCard">'+
  '<header class="jobModalHead"><h2>Edit job</h2></header><div class="jobCardSections">'+
  '<section class="jobVehicleSection"><div class="jobSectionGrid"><div class="field"><input id="job_registration" value="AB12CDE"></div>'+
  '<input type="hidden" id="job_make" value="MERCEDES-BENZ"><input type="hidden" id="job_model" value="EQC 400 AMG LINE 4MATIC">'+
  '<label class="noVehicleToggle"><input type="checkbox" id="job_no_vehicle">No Vehicle</label>'+
  '<div class="field"><label>Last MOT mileage</label><input id="job_mileage" value="50000"></div></div></section>'+
  '<details class="jobFormSection jobContactSection jobSectionDisclosure"><summary class="jobFormSectionHead">Customer details</summary>'+
  '<div class="jobSectionGrid"><div class="field"><label>Customer</label><input id="job_customer_name" value="chris stoker"></div>'+
  '<div class="field"><label>Account</label><input id="job_customer_account" value="Staff"></div></div></details>'+
  '<section class="jobBookingSection"><input type="hidden" id="job_customer_note" value="[[VECTA_CURRENT_MILEAGE:54321]]"></section>'+
  '</div></div></div>'+
  '<script>window.VECTA_MECHANIC_DEPLOYMENT='+mechanic+';window.fetch=()=>{throw Error("Unexpected network lookup")};'+
  'window.VectaFleetImages={artwork:()=>\'<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg"></svg>\'};</script>'+
  '<script>'+helper+'</script><script>VectaHaynesJobTools.remember('+JSON.stringify(match)+',true,{allowExpiredIdentity:true});'+
  'initHaynesJobTools(document.querySelector("#jobModal"));'+
  `const rect=selector=>document.querySelector(selector).getBoundingClientRect();
  const caption=document.querySelector('.jobCardCustomerCaption'),details=document.querySelector('.haynesJobVehicle strong');
  const body=rect('.jobCardHeaderBody'),matchBox=rect('.haynesJobTools'),customer=rect('.jobContactSection'),haynes=rect('.jobHeaderHaynesLookup'),mot=rect('#job_mileage'),current=rect('#job_current_mileage'),model=rect('.jobCardHeaderModel');
  const result={width:innerWidth,mechanic:${mechanic},visible:details.textContent.includes('EQC')&&details.getBoundingClientRect().height>0,
   pictureHeight:rect('.jobCardHeaderVehicle').height,pictureWidth:rect('.jobCardHeaderVehicle').width,imageHeight:rect('.jobCardHeaderVehicle svg').height,
   mileageWidth:current.width,modelFits:model.right<=rect('.jobCardHeaderVehicle').left&&model.bottom<=body.top,
   caption:caption.textContent,fontSize:parseFloat(getComputedStyle(caption).fontSize),
   matchGap:customer.top-matchBox.bottom,aligned:Math.max(customer.bottom,haynes.bottom,mot.bottom,current.bottom)-Math.min(customer.bottom,haynes.bottom,mot.bottom,current.bottom)<2,
   modelOneLine:model.height<=parseFloat(getComputedStyle(document.querySelector('.jobCardHeaderModel')).lineHeight)+1,
   overflow:document.querySelector('.jobModalCard').scrollWidth>document.querySelector('.jobModalCard').clientWidth+1,
   savedMileage:document.querySelector('#job_current_mileage').value,lastMileage:document.querySelector('#job_mileage').value};
  document.querySelector('.jobContactSection').open=true;
  result.openContactWidth=rect('.jobContactSection').width;result.bodyWidth=body.width;
  const name=document.querySelector('#job_customer_name');name.value="anne-marie o'neill";name.dispatchEvent(new Event('input',{bubbles:true}));
  result.editedCaption=caption.textContent;result.savedName=name.value;
  parent.postMessage(result,'*');</script>`;
}

test('the reopened job header keeps identity, matching, customer controls and mileage compact on Main and mechanics',{
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
   const context=JSON.stringify(row);
   assert.ok(Math.abs(row.pictureHeight-(row.width>700?Math.min(310,Math.max(220,row.width*.23)):100))<1,context);
   if(row.width>=1440)assert.ok(row.pictureWidth>=500,context);
   if(row.width>700)assert.ok(row.mileageWidth>=110&&row.mileageWidth<=160,context);
   assert.ok(row.imageHeight>=35,context);
   assert.equal(row.caption,'Chris Stoker',context);
   assert.equal(row.fontSize,row.width<=700?24:28,context);
   assert.ok(row.matchGap>=0&&row.matchGap<=12,context);
   if(row.width>=1050)assert.equal(row.aligned,true,context);
   // The wider car may wrap a long model name; it must remain clear of the car and controls.
   assert.equal(row.modelFits,true,context);
   assert.equal(row.overflow,false,context);
   assert.ok(row.openContactWidth>=row.bodyWidth-2,context);
   assert.equal(row.savedMileage,'54321');assert.equal(row.lastMileage,'50000');
   assert.equal(row.editedCaption,"Anne-Marie O'Neill");
   assert.equal(row.savedName,"anne-marie o'neill");
  }
 }finally{rmSync(dir,{force:true,recursive:true});}
});
