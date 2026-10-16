import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
const asset='https://www.haynespro-assets.com/workshop/images/319004633.svgz';
const van={registration:'YY65UAX',make:'NISSAN',model:'NV200 Evalia (M20, ME0)',imageUrl:asset};
const job={id:'1',registration:'MTC 2',make:'',model:'',vehicle:'NV 200',colour:'Grey'};
function database(rows=new Map()){
 let reads=0,writes=0;const batches=[];
 const client={from(table){assert.equal(table,'workshop_settings');return {
  select(){return {like(_key,pattern){assert.equal(pattern,'vehicle_artwork:%');return {limit:async()=>{reads++;return {data:[...rows].map(([id,value])=>({id,value})),error:null};}};}};},
  upsert:async batch=>{writes++;batches.push(batch);for(const r of batch)rows.set(r.id,JSON.parse(JSON.stringify(r.value)));return {error:null};}
 };}};
 return {client,rows,batches,reads:()=>reads,writes:()=>writes};
}
function device(db,storage=new Map()){
 const {document}=parseHTML('<html><body><div class="mobileJob" data-open-job="1"></div></body></html>');
 let lookups=0;const timers=[];
 const root={document,remoteClient:db.client,navigator:{onLine:true},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  fetch:async()=>{lookups++;throw Error('No vehicle lookup should be made');},
  VectaVehicleImage:{resolveColour:(_r,c)=>c,colourHex:c=>c,mount:()=>Promise.resolve()},VectaFleetImages:{artwork:()=>'<svg></svg>'}};
 vm.runInNewContext(source,{window:root,document,AbortController,AbortSignal,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},encodeURIComponent,Date});
 return {root,document,storage,timers,lookups:()=>lookups};
}
async function settled(){for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));}
test('real NV200 Evalia model name matches NV 200 without matching NV2000 or another manufacturer',()=>{
 const d=device(database(),new Map([['vecta_haynes_artwork_v1',JSON.stringify([van])]])),tools=d.root.VectaHaynesJobTools;
 assert.equal(tools.genericImage(job).imageUrl,asset);
 assert.equal(tools.genericImage({model:'NV 2000'}),null);
 assert.equal(tools.genericImage({model:'NV 200',make:'Ford'}),null);
});
test('phone publishes its image once; a PC with empty storage paints MTC2 without a Haynes lookup',async()=>{
 const db=database(),phone=device(db,new Map([['vecta_haynes_artwork_v1',JSON.stringify([van])]]));
 phone.root.enrichHaynesDashboard(phone.document,[job]);await settled();await phone.root.VectaHaynesJobTools.flushSharedArtwork();
 const value=db.rows.get('vehicle_artwork:MTC2');assert.equal(value.imageUrl,asset);assert.equal(value.generic,true);
 assert.equal(value.typeId,undefined);assert.equal(value.variant,undefined);assert.equal(phone.lookups(),0);
 const writeCount=db.writes(),pc=device(db);pc.root.enrichHaynesDashboard(pc.document,[job]);await settled();
 assert.equal(pc.document.querySelector('img').dataset.haynesSource,asset);assert.equal(pc.lookups(),0);assert.equal(db.reads(),2);
 for(let i=0;i<5;i++)pc.root.enrichHaynesDashboard(pc.document,[job]);await settled();await pc.root.VectaHaynesJobTools.flushSharedArtwork();
 assert.equal(db.reads(),2);assert.equal(db.writes(),writeCount);
 const offline=device(db,pc.storage);offline.root.navigator.onLine=false;offline.root.enrichHaynesDashboard(offline.document,[job]);await settled();
 assert.equal(offline.document.querySelector('img').dataset.haynesSource,asset);assert.equal(offline.lookups(),0);assert.equal(db.reads(),2);
});
test('simultaneous desktop and phone cards share one cloud read and one batch of new artwork',async()=>{
 const db=database(),d=device(db,new Map([['vecta_haynes_artwork_v1',JSON.stringify([van])]]));
 d.document.body.insertAdjacentHTML('beforeend','<div class="job" data-job-id="1"><div class="plannerJobHeader"></div></div>');
 d.root.enrichHaynesDashboard(d.document,[job]);d.root.enrichHaynesDashboard(d.document,[job]);await settled();await d.root.VectaHaynesJobTools.flushSharedArtwork();
 assert.equal(db.reads(),1);assert.equal(db.writes(),1);assert.equal(db.batches[0].length,2);assert.equal(d.lookups(),0);
 assert.equal(d.document.querySelector('.job img').dataset.haynesSource,asset);
});
test('shared records reject mismatched registrations and unsafe URLs without exposing technical identity',async()=>{
 const db=database(new Map([
  ['vehicle_artwork:MTC2',{...van,registration:'MTC2',generic:true,typeId:'t_123',vin:'private'}],
  ['vehicle_artwork:WRONG',{...van,registration:'OTHER'}],
  ['vehicle_artwork:BAD',{...van,registration:'BAD',imageUrl:'https://evil.example/image.svg'}]
 ])),d=device(db);await d.root.VectaHaynesJobTools.hydrateSharedArtwork();
 const tools=d.root.VectaHaynesJobTools,v=tools.artworkSnapshot('MTC 2');assert.equal(v.imageUrl,asset);assert.equal(v.typeId,undefined);assert.equal(v.vin,undefined);
 assert.equal(tools.artworkSnapshot('MTC2','Ford'),null);assert.equal(tools.artworkSnapshot('OTHER'),null);assert.equal(tools.artworkSnapshot('BAD'),null);
});
test('offline and audit mode never read or publish shared artwork',()=>{
 const db=database(),d=device(db);d.root.navigator.onLine=false;assert.equal(d.root.VectaHaynesJobTools.hydrateSharedArtwork(),null);
 d.root.navigator.onLine=true;d.root.VECTA_AUDIT_PREVIEW=true;assert.equal(d.root.VectaHaynesJobTools.hydrateSharedArtwork(),null);assert.equal(db.reads(),0);assert.equal(db.writes(),0);
});
test('an unavailable shared catalogue times out once and stays paused across rerenders',async()=>{
 let reads=0;const db={client:{from(){return {select(){return {like(){return {limit(){reads++;return new Promise(()=>{});}};}};}};}}},d=device(db);
 const loading=d.root.VectaHaynesJobTools.hydrateSharedArtwork();assert.equal(reads,1);
 d.timers.find(t=>t.delay===10000).fn();assert.equal(await loading,false);
 for(let i=0;i<5;i++)assert.equal(d.root.VectaHaynesJobTools.hydrateSharedArtwork(),null);
 assert.equal(reads,1);
});
test('the shared read repaints the latest planner data rather than an old registration',async()=>{
 let finish;const db=database(new Map([['vehicle_artwork:MTC2',{...van,registration:'MTC2',generic:true}]]));
 const from=db.client.from;db.client.from=table=>{const chain=from(table);chain.select=()=>({like:()=>({limit:()=>new Promise(resolve=>{finish=()=>resolve({data:[...db.rows].map(([id,value])=>({id,value})),error:null});})})});return chain;};
 const d=device(db);d.root.enrichHaynesDashboard(d.document,[job]);
 d.root.enrichHaynesDashboard(d.document,[{...job,registration:'OTHER',make:'Ford',vehicle:'Unknown',colour:'Grey'}]);
 finish();await settled();assert.notEqual(d.document.querySelector('img')?.dataset.haynesSource,asset);
});
test('MTC2 rejects a stale Qashqai identity and cloud record, retaining its local NV200 offline',async()=>{
 const wrong={registration:'MTC2',make:'Nissan',model:'Qashqai',variant:'1.5',typeId:'t_123',fetchedAt:new Date().toISOString(),imageUrl:'https://www.haynespro-assets.com/workshop/images/319004648.svgz'};
 const storage=new Map([['vecta_haynes_vehicle_identity_v1',JSON.stringify([wrong])],['vecta_haynes_artwork_v1',JSON.stringify([{...van,registration:'MTC2',generic:true}])]]);
 const db=database(new Map([['vehicle_artwork:MTC2',wrong]])),d=device(db,storage);
 d.root.enrichHaynesDashboard(d.document,[job]);await settled();await d.root.VectaHaynesJobTools.flushSharedArtwork();
 assert.equal(d.document.querySelector('img').dataset.haynesSource,asset);
 assert.equal(db.rows.get('vehicle_artwork:MTC2').model,van.model);
 const offline=device(db,storage);offline.root.navigator.onLine=false;offline.root.enrichHaynesDashboard(offline.document,[job]);
 assert.equal(offline.document.querySelector('img').dataset.haynesSource,asset);assert.equal(d.lookups(),0);assert.equal(offline.lookups(),0);
});
test('a technical refresh without colour preserves blue across shared hydration and reopening',async()=>{
 const car={...van,registration:'NJ17GWM',model:'Qashqai',colour:'Blue'};
 const d=device(database(new Map([['vehicle_artwork:NJ17GWM',{...car,colour:undefined}]])),new Map([['vecta_haynes_artwork_v1',JSON.stringify([car])]]));
 await d.root.VectaHaynesJobTools.hydrateSharedArtwork();
 d.root.VectaHaynesJobTools.remember({...car,colour:undefined,variant:'1.5',typeId:'t_123',fetchedAt:new Date().toISOString()});
 assert.equal(d.root.VectaHaynesJobTools.artworkSnapshot('NJ17GWM').colour,'Blue');
 assert.equal(device(database(),d.storage).root.VectaHaynesJobTools.dashboardColour({registration:'NJ17 GWM'}),'Blue');
});

test('manufacturer-prefixed job labels retain the exact saved Volkswagen and Audi artwork',()=>{
 for(const [make,model,registration] of [['Volkswagen','Beetle','DC14EEZ'],['Audi','A4','HGZ7396']]){
  const saved={...van,make,model,registration};
  const d=device(database(),new Map([['vecta_haynes_artwork_v1',JSON.stringify([saved])]]));
  assert.equal(d.root.VectaHaynesJobTools.artworkSnapshot(registration,make,make+' '+model)?.imageUrl,asset);
  assert.equal(d.root.VectaHaynesJobTools.artworkSnapshot(registration,make,make+' WrongModel'),null);
  d.root.enrichHaynesDashboard(d.document,[{id:'1',registration,vehicle:make+' '+model}]);
  assert.equal(d.document.querySelector('img').dataset.haynesSource,asset);
  assert.equal(d.lookups(),0);
 }
});

test('Cabstar job uses its saved NT400 Cabstar drawing without borrowing an NV200 image',()=>{
 const drawing={registration:'VK68UBR',make:'NISSAN',model:'NT400 Cabstar (F24)',imageUrl:'https://www.haynespro-assets.com/workshop/images/319011515.svgz'};
 const d=device(database(),new Map([['vecta_haynes_artwork_v1',JSON.stringify([drawing])]]));
 assert.equal(d.root.VectaHaynesJobTools.artworkSnapshot('VK68UBR','NISSAN','CABSTAR')?.imageUrl,drawing.imageUrl);
 assert.equal(d.root.VectaHaynesJobTools.artworkSnapshot('VK68UBR','NISSAN','NV200'),null);
});

test('missing planner artwork can refresh an old shared session without calling Haynes',async()=>{
 const db=database(),d=device(db);await d.root.VectaHaynesJobTools.hydrateSharedArtwork();
 db.rows.set('vehicle_artwork:HGZ7396',{registration:'HGZ7396',make:'AUDI',model:'A4 (8W)',imageUrl:asset});
 const original=Date.now;Date.now=()=>original()+61000;
 try{await d.root.VectaHaynesJobTools.hydrateSharedArtwork({refresh:true});}finally{Date.now=original;}
 assert.equal(d.root.VectaHaynesJobTools.artworkSnapshot('HGZ7396','AUDI','A4').imageUrl,asset);assert.equal(db.reads(),2);assert.equal(d.lookups(),0);
 assert.ok(d.root.VectaHaynesJobTools.storedArtwork().some(v=>v.model==='A4 (8W)'));
});

test('manual internal artwork stays on the linked fleet record rather than entering the registration cache',()=>{
 const d=device(database());d.root.VectaFleetImages.forJob=()=>({vehicle:{id:'internal-1',colour:'Blue'},drawing:{make:'AUDI',model:'A4',imageUrl:asset,manual:true}});
 d.root.enrichHaynesDashboard(d.document,[{...job,registration:'',fleet_vehicle_id:'internal-1'}]);
 const img=d.document.querySelector('img');assert.equal(img.dataset.haynesSource,asset);assert.equal(img.dataset.fleetArtworkId,'internal-1');assert.equal(img.dataset.colour,'Blue');assert.equal(d.lookups(),0);
});

test('the real Fleet renderer retains the Hilux despite its longer job/fleet trim description',async()=>{
 const hilux={registration:'J321WPC',make:'TOYOTA',model:'Hilux (GUN; GGN; LAN)',imageUrl:'https://www.haynespro-assets.com/workshop/images/319009548.svgz'};
 const db=database(new Map([['vehicle_artwork:J321WPC',hilux]])),d=device(db);await d.root.VectaHaynesJobTools.hydrateSharedArtwork();
 const vehicle={id:'hilux',registration:'J321 WPC',make:'TOYOTA',model:'HILUX INVINCIB X D-4D4WD DCB A'};
 d.root.innerHeight=800;d.root.__vectaFleetState=()=>({vehicles:[vehicle]});
 const cell=d.document.createElement('span');cell.dataset.fleetImage='hilux';cell.getBoundingClientRect=()=>({top:10,bottom:70,width:100,height:60});d.document.body.appendChild(cell);
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-fleet-images.js',import.meta.url),'utf8'),{window:d.root,document:d.document,MutationObserver:class{observe(){}},setTimeout,queueMicrotask});
 assert.equal(d.root.VectaFleetImages.drawingFor(vehicle).imageUrl,hilux.imageUrl);assert.equal(cell.querySelector('img').dataset.vehicleSource,hilux.imageUrl);assert.equal(d.lookups(),0);
 for(let i=0;i<5;i++)d.root.VectaFleetImages.mount();assert.equal(d.lookups(),0);
});
test('shared colour is reused on a new device and survives offline reopening',async()=>{
 const db=database(new Map([['vehicle_colour:AB12CDE',{registration:'AB12CDE',make:'NISSAN',colour:'Blue'}]])),first=device(db);await first.root.VectaHaynesJobTools.hydrateSharedArtwork();
 assert.equal(first.root.VectaHaynesJobTools.dashboardColour({registration:'AB12CDE',make:'NISSAN'}),'Blue');
 const offline=device(db,first.storage);offline.root.navigator.onLine=false;assert.equal(offline.root.VectaHaynesJobTools.dashboardColour({registration:'AB12CDE',make:'NISSAN'}),'Blue');assert.equal(offline.lookups(),0);
});

test('planner reads shared Hilux artwork through the main app private-client bridge on a fresh PC',async()=>{
 const hilux={registration:'J321WPC',make:'TOYOTA',model:'Hilux (GUN; GGN; LAN)',imageUrl:'https://www.haynespro-assets.com/workshop/images/319009548.svgz'};
 const db=database(new Map([['vehicle_artwork:J321WPC',hilux],['vehicle_colour:J321WPC',{registration:'J321WPC',make:'TOYOTA',colour:'White'}]])),d=device(db);
 // The production main script is an IIFE: remoteClient is not a window property.
 delete d.root.remoteClient;
 d.root.__vectaWorkshopClient=()=>db.client;
 d.document.body.innerHTML='<div class="job" data-job-id="1"><div class="plannerJobHeader"></div></div>';
 const realJob={id:'1',registration:'J321WPC',make:'TOYOTA',model:'HILUX INVINCIB X D-4D4WD DCB A',vehicle:'TOYOTA HILUX INVINCIB X D-4D4WD DCB A'};
 d.root.enrichHaynesDashboard(d.document,[realJob]);await settled();
 const img=d.document.querySelector('.job img');
 assert.equal(img?.dataset.haynesSource,hilux.imageUrl);assert.equal(img.dataset.colour,'White');
 for(let i=0;i<5;i++)d.root.enrichHaynesDashboard(d.document,[realJob]);await settled();
 assert.equal(db.reads(),1);assert.equal(d.lookups(),0);
 assert.equal(JSON.parse(d.storage.get('vecta_haynes_artwork_v1')).find(v=>v.registration==='J321WPC').imageUrl,hilux.imageUrl);
 d.root.VectaHaynesJobTools.remember({...hilux,registration:'AB12CDE',variant:'2.4',typeId:'t_123',fetchedAt:new Date().toISOString()});
 await d.root.VectaHaynesJobTools.flushSharedArtwork();
 assert.equal(db.rows.get('vehicle_artwork:AB12CDE').imageUrl,hilux.imageUrl);assert.equal(db.writes(),1);
 const offline=device(db,d.storage);delete offline.root.remoteClient;offline.root.__vectaWorkshopClient=()=>null;offline.root.navigator.onLine=false;
 offline.root.enrichHaynesDashboard(offline.document,[realJob]);assert.equal(offline.document.querySelector('img').dataset.haynesSource,hilux.imageUrl);assert.equal(offline.lookups(),0);
});

test('main app exposes its current private database client through the bridge, including reconnects',()=>{
 const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const bridge=html.match(/window\.__vectaWorkshopClient=function\(\)\{return remoteClient;\};/);
 assert.ok(bridge,'The helper must be wired to the actual main-script connection');
 const root={};vm.runInNewContext('(function(){var remoteClient=null;'+bridge[0]+'window.connect=function(client){remoteClient=client;};})();',{window:root});
 assert.equal(root.__vectaWorkshopClient(),null);assert.equal(root.remoteClient,undefined);
 const first={},second={};root.connect(first);assert.equal(root.__vectaWorkshopClient(),first);root.connect(second);assert.equal(root.__vectaWorkshopClient(),second);
 root.connect(null);assert.equal(root.__vectaWorkshopClient(),null);
});

test('real fleet matcher renders automatic internal images on phone and desktop without publishing internal references',async()=>{
 const db=database(),d=device(db),asset='https://www.haynespro-assets.com/workshop/images/319106279.svgz';
 const vehicles=[{id:'internal',fleetGroup:'Nissan Internal',registration:'RESCUE 2',model:'Nissan Qashqai J12',colour:'Green'}];
 d.root.__vectaFleetState=()=>({vehicles,save:async()=>true,render:()=>{}});
 const fleetSource=fs.readFileSync(new URL('../../public/js/vecta-fleet-images.js',import.meta.url),'utf8');
 vm.runInNewContext(fleetSource,{window:d.root,document:d.document,MutationObserver:class{observe(){}},setTimeout:(fn,delay)=>d.timers.push({fn,delay})});
 const j={id:'1',fleet_vehicle_id:'internal',registration:'RESCUE 2',model:'Qashqai',make:'',vehicle:'Qashqai'};
 d.document.body.insertAdjacentHTML('beforeend','<div class="job" data-job-id="1"><div class="plannerJobHeader"></div></div>');
 d.root.enrichHaynesDashboard(d.document,[j]);await settled();
 const images=d.document.querySelectorAll('.haynesDashboardImage');assert.equal(images.length,2);
 for(const img of images){assert.equal(img.dataset.vehicleSource,asset);assert.equal(img.dataset.colour,'Green');assert.equal(img.dataset.fleetArtworkId,'internal');}
 await d.root.VectaHaynesJobTools.flushSharedArtwork();assert.equal(db.writes(),0);assert.equal(d.lookups(),0);
 vehicles[0].model='Qashqai';
 assert.equal(d.root.VectaHaynesJobTools.storedDrawing(j),null,'ambiguous model must not fall through to generic Qashqai');
});
