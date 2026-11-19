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

export function card(mechanic){
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
  '<div class="field"><label>Account</label><input id="job_customer_account" value="Staff"></div><div class="field"><label>Phone</label><input id="job_customer_phone" value="07700 900123"></div></div></details>'+
  '<details class="jobTypesDisclosure"><summary>Job Types</summary><div class="templateBtns"><button type="button">Full Service</button></div></details>'+
  '<details class="jobBookingSection jobSectionDisclosure"><summary class="jobFormSectionHead">Booking details</summary><div class="jobSectionGrid"><input id="job_booking_date" value="2026-11-14"></div><input type="hidden" id="job_customer_note" value="[[VECTA_CURRENT_MILEAGE:54321]]"></details>'+
  '<div class="jobVehicleHistory"><section class="jobFormSection jobMotAdvisories" aria-label="Previous MOT advisories"><h3>Previous MOT advisories</h3><div data-mot-history-body><ul><li>Front windscreen wiper blade defective</li><li>Nearside rear tyre worn close to legal limit on inner edge</li></ul></div></section></div>'+
  '</div></div></div>'+
  '<script>window.VECTA_MECHANIC_DEPLOYMENT='+mechanic+';window.fetch=()=>{throw Error("Unexpected network lookup")};'+
  'window.VectaFleetImages={artwork:()=>\'<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg"></svg>\'};</script>'+
  '<script>'+helper+'</script><script>VectaHaynesJobTools.remember('+JSON.stringify(match)+',true,{allowExpiredIdentity:true});'+
  'initHaynesJobTools(document.querySelector("#jobModal"));'+
  `const rect=selector=>document.querySelector(selector).getBoundingClientRect();
  const caption=document.querySelector(innerWidth<=700?'.jobCardPhoneCustomerName':'.jobCardCustomerCaption'),details=document.querySelector('.haynesJobVehicle strong');
  const body=rect('.jobCardDetailButtons'),matchBox=rect('.haynesJobTools'),mot=rect('#job_mileage'),current=rect('#job_current_mileage'),model=rect('.jobCardHeaderModel');
  const buttons=[...document.querySelectorAll('.jobCardDetailButtons>button')],buttonBoxes=buttons.map(el=>el.getBoundingClientRect());
  const advisories=document.querySelector('.jobMotAdvisories'),advisoryBox=advisories.getBoundingClientRect();
  const result={width:innerWidth,mechanic:${mechanic},visible:details.textContent.includes('EQC')&&details.getBoundingClientRect().height>0,
   pictureHeight:rect('.jobCardHeaderVehicle').height,pictureWidth:rect('.jobCardHeaderVehicle').width,imageHeight:rect('.jobCardHeaderVehicle svg').height,
   mileageWidth:current.width,modelFits:model.right<=rect('.jobCardHeaderHeading').right&&model.bottom<=mot.top,
   nameBesideModel:caption.getBoundingClientRect().left>=model.right&&Math.abs(caption.getBoundingClientRect().top-model.top)<10,
   buttonsBesideCar:body.right<=rect('.jobCardHeaderVehicle').left&&body.top<rect('.jobCardHeaderVehicle').bottom,
   buttonsFitMatch:Math.abs(body.left-matchBox.left)<1&&Math.abs(body.right-matchBox.right)<1,
   buttonsMatchGap:body.top-matchBox.bottom,
   advisoriesBelowTabs:advisoryBox.top>=body.bottom&&advisoryBox.top-body.bottom<=10,
   advisoriesFit:Math.abs(advisoryBox.left-body.left)<1&&Math.abs(advisoryBox.right-body.right)<1&&advisories.scrollWidth<=advisories.clientWidth+1,
   advisoriesKeepColour:getComputedStyle(advisories).backgroundColor==='rgb(255, 245, 245)'&&getComputedStyle(advisories).borderTopColor==='rgb(220, 38, 38)',
   mileageUnderCustomer:mot.top>=caption.getBoundingClientRect().bottom&&current.right<=rect('.jobCardHeaderVehicle').left&&mot.left===model.left,
   caption:caption.textContent,fontSize:parseFloat(getComputedStyle(caption).fontSize),
   visibleNames:[...document.querySelectorAll('.jobCardCustomerCaption,.jobCardPhoneCustomerName')].filter(el=>el.getBoundingClientRect().height>0).length,
   nameBelowModel:caption.getBoundingClientRect().top>=model.bottom&&caption.getBoundingClientRect().right<=rect('.jobCardHeaderVehicle').left,
   buttonLabels:buttons.map(el=>el.textContent),buttonsOneRow:buttonBoxes.every(box=>Math.abs(box.top-buttonBoxes[0].top)<1),
   buttonsFit:buttonBoxes.every((box,i)=>box.width>0&&box.right<=body.right+1&&(!i||box.left>=buttonBoxes[i-1].right)&&buttons[i].scrollWidth<=buttons[i].clientWidth+1),
   buttonsBelowMatch:buttonBoxes[0].top>=matchBox.bottom,panelsClosed:buttons.every(el=>el.getAttribute('aria-expanded')==='false'&&document.getElementById(el.getAttribute('aria-controls')).hidden),
   mileageAboveHaynes:Math.max(mot.bottom,current.bottom)<=rect('.haynesJobVehicle>a.dark').top,
   mileageTogether:Math.abs(mot.bottom-current.bottom)<2,
   modelOneLine:model.height<=parseFloat(getComputedStyle(document.querySelector('.jobCardHeaderModel')).lineHeight)+1,
   overflow:document.querySelector('.jobModalCard').scrollWidth>document.querySelector('.jobModalCard').clientWidth+1,
   savedMileage:document.querySelector('#job_current_mileage').value,lastMileage:document.querySelector('#job_mileage').value};
  buttons[0].click();
  result.advisoriesStayPut=Math.abs(rect('.jobMotAdvisories').top-advisoryBox.top)<1;
  advisories.hidden=true;result.advisoriesCanHide=rect('.jobMotAdvisories').height===0;advisories.hidden=false;
  result.panelsUseCarSpace=rect('.jobCardDetailPanels').right>=rect('.jobCardHeaderVehicle').right-1&&rect('.jobCardDetailPanels').top>=rect('.jobCardHeaderVehicle').bottom;
  result.openContactWidth=rect('.jobContactSection').width;result.bodyWidth=body.width;
  result.noDuplicateSummary=rect('.jobContactSection>summary').height===0;
  const name=document.querySelector('#job_customer_name');name.value="anne-marie o'neill";name.dispatchEvent(new Event('input',{bubbles:true}));
  result.editedCaption=caption.textContent;result.savedName=name.value;
  buttons[0].click();result.customerCloses=document.querySelector('.jobContactSection').hidden&&buttons[0].getAttribute('aria-expanded')==='false';
  buttons[0].click();result.customerReopens=!document.querySelector('.jobContactSection').hidden&&name.value===result.savedName;
  result.independentPanels=true;
  for(const button of buttons.slice(1)){
   button.click();const target=document.getElementById(button.getAttribute('aria-controls'));
   result.independentPanels=result.independentPanels&&!target.hidden&&target.open&&button.getAttribute('aria-expanded')==='true'&&!document.querySelector('.jobContactSection').hidden;
   result.noDuplicateSummary=result.noDuplicateSummary&&target.querySelector('summary').getBoundingClientRect().height===0;
   button.click();result.independentPanels=result.independentPanels&&target.hidden&&button.getAttribute('aria-expanded')==='false';
  }
  const chat=document.querySelector('.jobCardWhatsApp'),chatBox=chat?.getBoundingClientRect();
  result.whatsappFits=${mechanic}?chat===null:innerWidth>700?chatBox.width===0:chatBox.width>=44&&chatBox.height>=44&&chatBox.right<=body.right+1&&chatBox.left>=buttonBoxes.at(-1).right&&Math.abs(chatBox.top-body.top)<2;
  result.whatsappDestination=${mechanic}||chat.getAttribute('href')==='https://wa.me/447700900123';
  if(innerWidth<=700){
   document.querySelector('.haynesJobVehicle').replaceChildren();
   const lookup=rect('.jobHeaderHaynesLookup');
   result.lookupClearsIdentity=lookup.height>0&&lookup.top>=caption.getBoundingClientRect().bottom&&lookup.top>=rect('.jobCardHeaderModel').bottom;
  }
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
   for(const width of [1440,820,390,320])frames.push('<iframe width="'+width+'" height="900" src="'+file+'"></iframe>');
  }
  const report=path.join(dir,'report.html');
  writeFileSync(report,'<!doctype html><pre id="results"></pre><script>onmessage=e=>results.textContent+=JSON.stringify(e.data)+"\\n"</script>'+frames.join(''));
  const {stdout}=await run(process.env.VECTA_CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--allow-file-access-from-files','--no-first-run','--user-data-dir='+dir+'/profile','--virtual-time-budget=3000','--dump-dom',pathToFileURL(report).href],{timeout:90000,maxBuffer:1024*1024});
  const rows=stdout.match(/<pre id="results">([^<]*)<\/pre>/)?.[1].trim().split('\n').filter(Boolean).map(JSON.parse)||[];
  assert.equal(rows.length,8);
  for(const row of rows){
   assert.equal(row.visible,true,JSON.stringify(row));
   assert.equal(row.whatsappFits,true,JSON.stringify(row));assert.equal(row.whatsappDestination,true,JSON.stringify(row));
   const context=JSON.stringify(row);
   assert.ok(Math.abs(row.pictureHeight-(row.width>700?Math.min(310,Math.max(220,row.width*.23)):140))<1,context);
   if(row.width>=1440)assert.ok(row.pictureWidth>=500,context);
   if(row.width>700)assert.ok(row.mileageWidth>=110&&row.mileageWidth<=160,context);
   assert.ok(row.imageHeight>=35,context);
   assert.equal(row.caption,'Chris Stoker',context);
   assert.equal(row.fontSize,row.width<=700?14:24,context);
   assert.equal(row.visibleNames,1,context);
   if(row.width>700){assert.equal(row.nameBesideModel,true,context);assert.equal(row.buttonsBesideCar,true,context);assert.equal(row.buttonsFitMatch,true,context);assert.ok(row.buttonsMatchGap>=0&&row.buttonsMatchGap<=12,context);assert.equal(row.panelsUseCarSpace,true,context);}
   if(row.width<=700){assert.equal(row.lookupClearsIdentity,true,context);assert.equal(row.nameBelowModel,true,context);assert.ok(row.pictureWidth>=130&&row.imageHeight>=135,context);assert.equal(row.mileageUnderCustomer,true,context);assert.ok(row.mileageWidth>=60&&row.mileageWidth<=110,context);}
   assert.deepEqual(row.buttonLabels,row.mechanic?['Customer details']:['Customer details','Job types','Booking details'],context);
   for(const key of ['buttonsOneRow','buttonsFit','buttonsBelowMatch','advisoriesBelowTabs','advisoriesFit','advisoriesKeepColour','advisoriesStayPut','advisoriesCanHide','panelsClosed','mileageAboveHaynes','mileageTogether','customerCloses','customerReopens','independentPanels','noDuplicateSummary'])assert.equal(row[key],true,key+': '+context);
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
