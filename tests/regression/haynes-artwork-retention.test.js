import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
const car={registration:'YB11DCE',make:'Kia',model:'Picanto',variant:'1.0',typeId:'t_123',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svgz',fetchedAt:'2020-01-01T00:00:00Z'};
function setup(storage){
 const {window,document}=parseHTML('<html><body><div class="mobileJob" data-open-job="1"></div></body></html>');
 const timers=[];let calls=0;
 window.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 window.fetch=async()=>{calls++;throw Error('offline');};
 delete window.VectaVehicleImage;delete window.app;delete window.fleetVehicles;
 vm.runInNewContext(source,{window,document,AbortController,AbortSignal,setTimeout:fn=>timers.push(fn),clearTimeout(){},encodeURIComponent});
 return {window,document,timers,calls:()=>calls};
}
test('expired legacy match preserves exact artwork through reopening without validating old technical data',async()=>{
 const storage=new Map([['vecta_haynes_vehicle_snapshots_v1',JSON.stringify([car])]]);
 for(let reopen=0;reopen<2;reopen++){
  const {window,document,calls}=setup(storage),tools=window.VectaHaynesJobTools;
  assert.equal(tools.snapshot(car.registration),null);
  assert.equal(tools.artworkSnapshot(car.registration).imageUrl,car.imageUrl);
  assert.equal(tools.vehicleLink(tools.artworkSnapshot(car.registration)),'');
  assert.equal(tools.artworkSnapshot(car.registration,'Ford'),null);
  window.enrichHaynesDashboard(document,[{id:'1',registration:car.registration,make:'Kia',model:'Picanto',colour:'Red'}]);
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.equal(document.querySelector('img').src,car.imageUrl);assert.equal(calls(),0);
 }
});
test('failed thumbnail stays attached and retries twice without an endless request loop',()=>{
 const {window,document,timers}=setup(new Map([['vecta_haynes_vehicle_snapshots_v1',JSON.stringify([car])]]));
 window.enrichHaynesDashboard(document,[{id:'1',registration:car.registration,make:'Kia',colour:'Red'}]);
 const img=document.querySelector('img');img.onerror();assert.equal(document.querySelector('img'),img);
 assert.equal(timers.length,1);timers.shift()();img.onerror();assert.equal(timers.length,1);timers.shift()();img.onerror();assert.equal(timers.length,0);
 assert.equal(document.querySelector('img'),img);
});

test('internal NV 200 reuses saved NV200 artwork offline after repeated reopening',async()=>{
 const van={...car,registration:'YY65UAX',make:'Nissan',model:'NV200'};
 const storage=new Map([['vecta_haynes_artwork_v1',JSON.stringify([van])]]);
 for(let reopen=0;reopen<2;reopen++){
  const {window,document,calls}=setup(storage),tools=window.VectaHaynesJobTools;
  const drawing=tools.genericImage({registration:'MTC 2',make:'Nissan',model:'NV 200'});
  assert.equal(drawing.imageUrl,van.imageUrl);assert.equal(drawing.generic,true);
  assert.equal(drawing.typeId,undefined);assert.equal(drawing.registration,undefined);
  assert.equal(tools.genericImage({model:'NV 200',make:'Ford'}),null);
  window.enrichHaynesDashboard(document,[{id:'1',registration:'MTC 2',make:'Nissan',model:'NV 200',colour:'Grey'}]);
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.equal(document.querySelector('img.haynesDashboardImage').dataset.haynesSource,van.imageUrl);
  assert.equal(calls(),0);
 }
});

test('permanent vehicle identities recover model artwork even without the short-lived caches',()=>{
 const van={...car,registration:'YY65UAX',make:'Nissan',model:'NV200'};
 const storage=new Map([['vecta_haynes_vehicle_identity_v1',JSON.stringify([van])]]);
 const {window,calls}=setup(storage);
 assert.equal(window.VectaHaynesJobTools.genericImage({model:'NV 200'}).imageUrl,van.imageUrl);
 assert.equal(window.VectaHaynesJobTools.genericImage({model:'NV 2000'}),null);
 assert.equal(calls(),0);
});
