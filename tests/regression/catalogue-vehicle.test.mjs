import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {selectCatalogueVehicle} from '../../workers/repair-quotes/catalogue-vehicle.mjs';
import {discoverRepairCategory} from '../../workers/repair-quotes/general-gsf.mjs';
import {readServiceCategory} from '../../workers/gsf/service-capture.mjs';
import {readCatalogueSearchState} from '../../workers/repair-quotes/catalogue-search.mjs';
import {repairRequest} from '../../lib/repair-quote.js';
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1'});
function fixture({delay=2,result='AB12CDE',clearCount=1,fieldCount=1,login=false,recentOnly=false}={}){
 const events=[];let submitted=false,reads=0,selected=false,url='https://trade.gsfcarparts.com/';
 const document=()=>parseHTML('<html><body><input placeholder="ENTER REG / VIN"><input placeholder="Search parts or categories"><main>'+(submitted&&reads>delay?'<section>'+(!recentOnly?'<button>Clear</button>':'')+'<span>'+result+'</span></section>':'<p>Loading vehicle</p>')+'</main></body></html>').document;
 const field={waitFor:async()=>{events.push('wait-vrm');if(login){url='https://trade.gsfcarparts.com/signin';throw Error('Timeout');}},count:async()=>fieldCount,fill:async v=>events.push('fill-vrm:'+v)};
 const page={url:()=>url,goto:async v=>{url=v;events.push('home');},waitForTimeout:async()=>events.push('wait'),getByPlaceholder:()=>field,getByRole:(_role,{name})=>name==='Clear'?{count:async()=>clearCount,isVisible:async()=>true,click:async()=>events.push('clear')}: {click:async()=>{events.push('submit-vrm');submitted=true;}},evaluate:async(fn,input)=>{
  if(fn===readServiceCategory){reads++;const value=readServiceCategory(input,document());selected=value.selectedRegistration;events.push(selected?'vehicle-confirmed':'vehicle-pending');return value;}
  if(fn===readCatalogueSearchState)return readCatalogueSearchState(document());throw Error('Unexpected evaluate');
 },locator:s=>s==='a[href]'?{evaluateAll:async()=>[{href:'/parts/Radiator',text:'Radiator'}]}:{count:async()=>1,isVisible:async()=>true,fill:async()=>{assert.equal(selected,true);events.push('search-part');}}};
 return {page,events};
}
test('registration is selected and confirmed before the first part search, including delayed vehicle rendering',async()=>{
 const f=fixture();assert.equal(await discoverRepairCategory(f.page,'radiator',{request}),'Radiator');
 assert.ok(f.events.indexOf('wait-vrm')<f.events.indexOf('clear'));
 assert.ok(f.events.indexOf('clear')<f.events.indexOf('fill-vrm:AB12CDE'));
 assert.ok(f.events.indexOf('submit-vrm')<f.events.indexOf('vehicle-confirmed'));
 assert.ok(f.events.indexOf('vehicle-confirmed')<f.events.indexOf('search-part'));
 assert.equal(f.events.filter(e=>e==='vehicle-pending').length,2);
});
test('wrong registration and recent-vehicle mentions cannot establish the selected vehicle',async()=>{
 for(const options of [{result:'XY99ZZZ'},{recentOnly:true}]){
  const f=fixture({...options,delay:0});await assert.rejects(selectCatalogueVehicle(f.page,request.registration,{attempts:3}),e=>e.detail==='VEHICLE_NOT_CONFIRMED_BEFORE_SEARCH'&&e.observed.selectedRegistration===false);
  assert.ok(!f.events.includes('search-part'));
 }
});
test('ambiguous registration controls stop before entering or searching for a part',async()=>{
 for(const options of [{fieldCount:2},{clearCount:2}]){
  const f=fixture(options);await assert.rejects(selectCatalogueVehicle(f.page,request.registration),e=>e.detail.endsWith('AMBIGUOUS'));
  assert.ok(!f.events.includes('submit-vrm'));
 }
});
test('sign-in redirects while waiting for registration are reported as sign-in',async()=>{
 const f=fixture({login:true});await assert.rejects(selectCatalogueVehicle(f.page,request.registration),e=>e.code==='LOGIN_REQUIRED'&&e.supplier==='GSF');
});
