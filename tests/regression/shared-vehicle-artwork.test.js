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
 vm.runInNewContext(source,{window:root,document,AbortController,AbortSignal,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},encodeURIComponent});
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
