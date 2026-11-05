import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
const vehicle={registration:'AB12CDE',make:'Toyota',model:'Yaris',variant:'1.0',typeId:'t_123',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svgz',fetchedAt:'2020-01-01T00:00:00Z'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,190));
function setup({storage=new Map(),mechanic=false,fetcher=async()=>({ok:true,json:async()=>({status:'NOT_FOUND'})})}={}){
 const {document,Event}=parseHTML('<html><body></body></html>');
 const requests=[];
 const root={document,VECTA_MECHANIC_DEPLOYMENT:mechanic,navigator:{onLine:true},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  fetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);},VectaFleetImages:{artwork:()=>'<svg></svg>'},VectaVehicleImage:{mount(){},colourHex(){return '';},resolveColour:(_reg,colour)=>colour}};
 vm.runInNewContext(source,{window:root,document,AbortController,AbortSignal,setTimeout,clearTimeout,encodeURIComponent});
 function open({automatic=false,model='Yaris',make='Toyota'}={}){
  document.body.innerHTML='<div id="modal"><div class="jobModalHead"><h2>Edit job</h2></div><section class="jobVehicleSection"><input id="job_registration" value="AB12CDE"><input id="job_make"><input id="job_model"></section></div>';
  document.querySelector('#job_make').value=make;document.querySelector('#job_model').value=model;
  const modal=document.querySelector('#modal');root.initHaynesJobTools(modal,{automatic});return modal;
 }
 return {root,document,Event,requests,open,tools:root.VectaHaynesJobTools};
}

test('saved model drawings suppress all Haynes requests on Main and mechanics, including reopening and blur',async()=>{
 for(const mechanic of [false,true])for(const automatic of [false,true]){
  const s=setup({mechanic,storage:new Map([['vecta_haynes_artwork_v1',JSON.stringify([{...vehicle,generic:true}])]])});
  for(let reopen=0;reopen<2;reopen++){
   const modal=s.open({automatic});modal.querySelector('#job_registration').dispatchEvent(new s.Event('blur'));await tick();
   assert.match(modal.querySelector('.jobCardHeaderVehicle img').src,/haynes-image/);
  }
  assert.equal(s.requests.length,0);
 }
});

test('model catalogue drawings are sufficient even without a registration-specific image',async()=>{
 const s=setup();s.root.VectaFleetImages.modelArtwork=()=>({...vehicle,generic:true});s.open();await tick();
 assert.equal(s.requests.length,0);assert.ok(s.document.querySelector('.jobCardHeaderVehicle img'));
});

test('a manually chosen fleet image is checked using the same fleet ID used for display',async()=>{
 const s=setup();s.root.app={jobs:[{id:'job',fleet_vehicle_id:'chosen'}]};s.root.editingJobId='job';
 s.root.VectaFleetImages.forJob=description=>description.fleet_vehicle_id==='chosen'?{drawing:{...vehicle,manual:true}}:null;
 s.open();await tick();assert.equal(s.requests.length,0);assert.ok(s.document.querySelector('.jobCardHeaderVehicle img'));
});

test('conflicting old technical identity cannot bypass a saved manual image on opening',async()=>{
 const s=setup({storage:new Map([
  ['vecta_haynes_vehicle_identity_v1',JSON.stringify([{...vehicle,make:'Ford',model:'Fiesta'}])],
  ['vecta_haynes_artwork_v1',JSON.stringify([{...vehicle,manual:true}])]
 ])});s.open();await tick();assert.equal(s.requests.length,0);
});

test('a cold browser accepts permanent server identity without renewing its technical timestamp',async()=>{
 const storage=new Map();let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({status:'MATCHED',vehicle})};};
 const first=setup({storage,fetcher});assert.equal((await first.tools.lookup(vehicle.registration,'Toyota')).fetchedAt,vehicle.fetchedAt);
 assert.equal(first.tools.snapshot(vehicle.registration),null,'old service snapshot remains expired');
 first.open();await tick();
 const reopened=setup({storage,fetcher});reopened.open();await tick();
 assert.equal((await reopened.tools.lookup(vehicle.registration,'Toyota')).model,'Yaris');assert.equal(calls,1);
});

test('wrong-registration and future-dated server identities remain rejected',async()=>{
 for(const bad of [{...vehicle,registration:'XY34ABC'},{...vehicle,fetchedAt:'2100-01-01T00:00:00Z'}]){
  const s=setup({fetcher:async()=>({ok:true,json:async()=>({status:'MATCHED',vehicle:bad})})});
  assert.equal(await s.tools.lookup(vehicle.registration,'Toyota'),null);
  assert.equal(s.tools.artworkSnapshot(vehicle.registration),null);
 }
});

test('a targeted saved-image check recovers artwork missing from the batch without asking the PC',async()=>{
 const s=setup({fetcher:async()=>({ok:true,json:async()=>({status:'ARTWORK',vehicle:{...vehicle,generic:true}})})});
 s.open();await tick();assert.equal(s.requests.length,1);assert.match(s.requests[0].url,/^\/api\/vehicle-artwork\?/);
 assert.ok(s.document.querySelector('.jobCardHeaderVehicle img'));
 s.open();await tick();assert.equal(s.requests.length,1);
});

test('confirmed artwork absence permits one ordinary identity lookup for a genuinely missing image',async()=>{
 const s=setup({fetcher:async url=>({ok:true,json:async()=>url.startsWith('/api/vehicle-artwork')?{status:'NOT_FOUND'}:{status:'MATCHED',vehicle:{...vehicle,fetchedAt:new Date().toISOString()}}})});
 s.open();await tick();assert.equal(s.requests.length,2);
 assert.match(s.requests[1].url,/^\/api\/haynes-vehicle\?/);assert.equal(s.requests[1].options.method,undefined);
 assert.ok(s.document.querySelector('.jobCardHeaderVehicle img'));
});

test('unavailable or mismatched saved-artwork responses never fall through to the PC',async()=>{
 for(const data of [{status:'UNAVAILABLE'},{status:'ARTWORK',vehicle:{...vehicle,registration:'XY34ABC'}},{status:'ARTWORK',vehicle:{...vehicle,make:'Ford',model:'Fiesta'}}]){
  const s=setup({fetcher:async()=>({ok:true,json:async()=>data})});s.open();await tick();
  assert.equal(s.requests.length,1);assert.match(s.requests[0].url,/vehicle-artwork/);
 }
});

test('failed shared cache loading never launches the worker, including subsequent reopen',async()=>{
 const s=setup();s.root.remoteClient={from:()=>({select:()=>({like:()=>({limit:async()=>({error:new Error('offline')})})})})};
 s.open();await tick();s.open();await tick();assert.equal(s.requests.length,0);
});

test('late cache reads cannot start a lookup for changed registrations or a closed card',async()=>{
 for(const action of ['registration','close']){
  let finish;const s=setup({fetcher:()=>new Promise(resolve=>{finish=resolve;})});const modal=s.open();await tick();
  if(action==='registration'){const input=modal.querySelector('#job_registration');input.value='XY34ABC';input.dispatchEvent(new s.Event('input'));}
  else modal.setAttribute('aria-hidden','true');
  finish({ok:true,json:async()=>({status:'NOT_FOUND'})});await tick();assert.equal(s.requests.length,1);
 }
});

test('saved failed identifications retain their cooldown on job opening and browser reload',async()=>{
 const storage=new Map([['vecta_haynes_vehicle_retries_v1',JSON.stringify([{registration:vehicle.registration,at:Date.now()-7*86400000,status:'UNAVAILABLE'}])]]);
 for(let reload=0;reload<2;reload++){
  const s=setup({storage});s.open({model:''});await tick();assert.equal(s.requests.length,0);
 }
});

test('only an explicit Haynes click can force refresh and open the technical vehicle page',async()=>{
 const s=setup({storage:new Map([['vecta_haynes_artwork_v1',JSON.stringify([vehicle])]]),fetcher:async()=>({ok:true,json:async()=>({status:'MATCHED',vehicle})})});
 let destination,opened=0;s.root.open=()=>{opened++;return {location:{replace:url=>{destination=url;}}};};
 s.open();await tick();assert.equal(s.requests.length,0);
 await s.document.querySelector('.jobHeaderHaynesLookup').onclick({type:'click'});
 assert.equal(s.requests.length,1);assert.equal(s.requests[0].options.method,'POST');assert.match(s.requests[0].url,/retry=1/);
 assert.equal(opened,1);assert.match(destination,/modelDetail\?typeId=t_123/);
});

 test('new bookings fill missing fields from a saved identity without requesting it again',async()=>{
 const s=setup({storage:new Map([['vecta_haynes_vehicle_identity_v1',JSON.stringify([vehicle])]])});
 const modal=s.open({automatic:true,model:'',make:''});await tick();
 assert.equal(modal.querySelector('#job_make').value,'Toyota');assert.equal(modal.querySelector('#job_model').value,'Yaris');
 assert.equal(s.requests.length,0);
});
