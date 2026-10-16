import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
const asset='https://www.haynespro-assets.com/workshop/images/123.svgz';
const vehicle={registration:'AB12CDE',make:'Nissan',model:'Navara',variant:'2.3',typeId:'t_123',imageUrl:asset,fetchedAt:new Date().toISOString()};
function setup(values=new Map()){
 const {document}=parseHTML('<html><body></body></html>');
 let calls=0,writes=0;
 const root={document,navigator:{onLine:true},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>{writes++;values.set(key,value);}},fetch:async()=>{calls++;throw Error('offline');},VectaVehicleImage:{resolveColour:(_r,c)=>c,colourHex:c=>c==='Blue'?'#1c4778':''},VectaFleetImages:{artwork:()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'}};
 vm.runInNewContext(source,{window:root,document,AbortController,AbortSignal,setTimeout,clearTimeout,encodeURIComponent});
 return {root,document,tools:root.VectaHaynesJobTools,calls:()=>calls,writes:()=>writes};
}

test('generic fleet artwork discards registration, technical identity and unrelated cached fields',()=>{
 const {root,tools}=setup();
 root.VectaFleetImages.modelArtwork=()=>({...vehicle,vin:'private',source:'HaynesPro'});
 const drawing=tools.genericImage({registration:'RESCUE2',make:'Nissan',model:'Navara'});
 assert.deepEqual(Object.keys(drawing).sort(),['generic','imageUrl','make','model']);
 assert.equal(drawing.imageUrl,asset);assert.equal(drawing.generic,true);
 assert.equal(tools.vehicleLink(drawing),'');assert.equal(tools.genericImage({make:'Ford',model:'Navara'}),null);
});

test('hundreds of cached vehicle records hydrate without serialising entire collections per row',()=>{
 const records=Array.from({length:200},(_,i)=>({...vehicle,registration:'AB'+String(i).padStart(3,'0')+'CD'}));
 const values=new Map([['vecta_haynes_vehicle_snapshots_v1',JSON.stringify(records)]]);
 const {tools,writes}=setup(values);
 assert.equal(writes(),0);
 assert.equal(tools.snapshot(records[199].registration).imageUrl,asset);
 assert.equal(tools.artworkSnapshot(records[199].registration).imageUrl,asset);
 tools.remember({...vehicle,registration:'XY34ZZZ'});
 assert.equal(writes(),3,'new lookup still persists snapshot, identity and artwork');
 assert.equal(JSON.parse(values.get('vecta_haynes_vehicle_identity_v1')).length,201);
});

test('known colour remains permanent after years and stays make-specific',async()=>{
 const values=new Map([['vecta_dashboard_vehicle_colours_v1',JSON.stringify([{registration:vehicle.registration,make:'Nissan',colour:'Blue',at:Date.now()-5*365*86400000}])]]);
 const {tools,calls}=setup(values);
 await tools.lookupDashboardColour(vehicle);
 assert.equal(calls(),0);assert.equal(tools.dashboardColour(vehicle),'Blue');
 assert.equal(tools.dashboardColour({...vehicle,make:'Ford'}),'');
});

test('failed optional colour lookup stays paused across reopening and retries after five minutes',async()=>{
 const values=new Map();
 const first=setup(values);await first.tools.lookupDashboardColour(vehicle);assert.equal(first.calls(),1);
 const second=setup(values);await second.tools.lookupDashboardColour(vehicle);assert.equal(second.calls(),0);
 values.set('vecta_dashboard_colour_retries_v1',JSON.stringify([[vehicle.registration,Date.now()-301000]]));
 const third=setup(values);await third.tools.lookupDashboardColour(vehicle);assert.equal(third.calls(),1);
});

test('a successful colour result clears a previously persisted failure',async()=>{
 const values=new Map([['vecta_dashboard_colour_retries_v1',JSON.stringify([[vehicle.registration,Date.now()]])]]);
 const first=setup(values);assert.equal(first.tools.rememberLookupColour({...vehicle,primaryColour:'Blue'}),true);
 assert.deepEqual(JSON.parse(values.get('vecta_dashboard_colour_retries_v1')),[]);
 const second=setup(values);await second.tools.lookupDashboardColour(vehicle);assert.equal(second.calls(),0);
});

test('invalid and future colour records cannot suppress a fresh lookup',async()=>{
 for(const at of ['invalid',Date.now()+86400000]){
  const {tools,calls}=setup(new Map([['vecta_dashboard_vehicle_colours_v1',JSON.stringify([{registration:vehicle.registration,make:'Nissan',colour:'Blue',at}])]]));
  assert.equal(tools.dashboardColour(vehicle),'');await tools.lookupDashboardColour(vehicle);assert.equal(calls(),1);
 }
});

test('a growing fleet does not evict a previously confirmed colour',async()=>{
 const values=new Map();const first=setup(values);
 for(let i=0;i<400;i++)assert.equal(first.tools.rememberLookupColour({registration:'AB'+String(i).padStart(3,'0')+'CD',make:'Nissan',primaryColour:'Blue'}),true);
 const second=setup(values);await second.tools.lookupDashboardColour({registration:'AB000CD',make:'Nissan'});
 assert.equal(second.calls(),0);assert.equal(second.tools.dashboardColour({registration:'AB000CD',make:'Nissan'}),'Blue');
 assert.equal(JSON.parse(values.get('vecta_dashboard_vehicle_colours_v1')).length,400);
});

test('a fleet colour edit or a newer confirmed lookup replaces a permanent cached colour',()=>{
 const {root,tools}=setup();tools.rememberLookupColour({...vehicle,primaryColour:'Blue'});
 root.app={vehicles:[{registration:vehicle.registration,colour:'Red'}]};
 assert.equal(tools.dashboardColour(vehicle),'Red');
 root.app.vehicles=[];root.VectaVehicleImage.colourHex=c=>['Blue','Green'].includes(c)?'#fff':'';
 assert.equal(tools.rememberLookupColour({...vehicle,primaryColour:'Green'}),true);
 assert.equal(tools.dashboardColour(vehicle),'Green');
});

test('placeholder registrations never trigger decorative government colour lookups',async()=>{
 const {tools,calls}=setup();
 for(const registration of ['RESCUE2','UNKNOWN1','VAN','NO REG'])await tools.lookupDashboardColour({...vehicle,registration});
 assert.equal(calls(),0);
});

test('dashboard personalisation uses a local image until stored supplier artwork has been checked',()=>{
 const {root,document,tools}=setup();let mounted;
 root.VectaVehicleImage.mount=target=>{mounted=target.querySelector('img');};
 tools.remember(vehicle);
 document.body.innerHTML='<div class="unallocatedSideJob" data-open-unallocated="1"></div><div class="unallocatedSideJob quoteCard" data-open-job="2"></div>';
 root.enrichHaynesDashboard(document,[{...vehicle,id:'1',colour:'Blue'},{...vehicle,id:'2',colour:'Blue',status:'quote'}]);
 const images=[...document.querySelectorAll('img')];assert.equal(images.length,2);
 for(const img of images){assert.equal(img.dataset.vehicleSource,asset);assert.match(img.src,/^\/api\/haynes-image\?asset=/);assert.equal(img.dataset.registration,vehicle.registration);}
 assert.equal(mounted,images[1]);
});

test('job header personalisation also avoids a direct supplier image request',()=>{
 const {root,document,tools}=setup();let mounted;
 root.VectaVehicleImage.mount=target=>{mounted=target.querySelector('img');};tools.remember(vehicle);
 document.body.innerHTML='<div id="modal"><div class="jobModalHead"><h2>Edit job</h2></div><section class="jobVehicleSection"><input id="job_registration" value="AB12CDE"><input id="job_make" value="Nissan"><input id="job_model" value="Navara"></section></div>';
 root.initHaynesJobTools(document.querySelector('#modal'));
 assert.equal(mounted.dataset.vehicleSource,asset);assert.match(mounted.src,/^\/api\/haynes-image\?asset=/);
});
