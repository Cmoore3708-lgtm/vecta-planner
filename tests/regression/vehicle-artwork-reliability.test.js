import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createArtworkHandler} from '../../lib/vehicle-artwork.js';
import {vehicleMatches} from '../../lib/haynes-vehicle.js';
import {saveVehicleArtwork,saveVehicleColour} from '../../lib/haynes-shared-artwork.js';
const asset='https://www.haynespro-assets.com/workshop/images/123.svgz';
const vehicle={registration:'AB12CDE',make:'Nissan',model:'Qashqai (J11)',imageUrl:asset,typeId:'t_123',variant:'1.5',fetchedAt:new Date().toISOString()};
const environment=()=>({url:'https://db.example',serviceKey:'private-key'});
async function request(rows,query={reg:'AB12CDE',make:'NISSAN',model:'QASHQAI N-TEC DCI'}){
 let body,code,headers={};
 await createArtworkHandler({environment,fetcher:async url=>{if(url.includes('or='))return {ok:true,json:async()=>[]};assert.match(url,/id=in\.\(vehicle_artwork:AB12CDE,vehicle_identity:AB12CDE,vehicle_colour:AB12CDE\)/);return {ok:true,json:async()=>rows};}})({method:'GET',query},{setHeader:(k,v)=>headers[k]=v,status(n){code=n;return this;},json(v){body=v;return this;}});
 return {body,code,headers};
}
test('saved illustration works without the PC and returns only public artwork fields',async()=>{
 const rows=[{id:'vehicle_identity:AB12CDE',value:{...vehicle,vin:'secret',email:'secret'}},{id:'vehicle_colour:AB12CDE',value:{registration:vehicle.registration,make:vehicle.make,colour:'Blue'}}];
 const r=await request(rows);assert.equal(r.code,200);assert.equal(r.body.status,'ARTWORK');assert.equal(r.body.vehicle.colour,'Blue');
 assert.deepEqual(Object.keys(r.body.vehicle).sort(),['colour','imageUrl','make','model','registration','source']);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('incorrect model and stale registration cannot become website artwork',async()=>{
 for(const wrong of [{...vehicle,model:'NV200'},{...vehicle,make:'Ford'},{...vehicle,registration:'CD34EFG'},{...vehicle,imageUrl:'https://evil.example/car.svg'}]){
  assert.equal((await request([{id:'vehicle_identity:AB12CDE',value:wrong}])).body.status,'NOT_FOUND');
 }
});
test('verified identity upgrades generic artwork; a manual image and colour take priority',async()=>{
 const rows=[{id:'vehicle_artwork:AB12CDE',value:{...vehicle,generic:true,imageUrl:asset.replace('123','456')}},{id:'vehicle_identity:AB12CDE',value:vehicle}];
 assert.equal((await request(rows)).body.vehicle.imageUrl,asset);
 rows[0].value={...rows[0].value,manual:true,colour:'Red'};
 rows.push({id:'vehicle_colour:AB12CDE',value:{registration:vehicle.registration,make:vehicle.make,colour:'Blue'}});
 const r=await request(rows);assert.equal(r.body.vehicle.imageUrl,rows[0].value.imageUrl);assert.equal(r.body.vehicle.colour,'Red');
});
test('model comparison accepts make aliases and trim suffixes but rejects similar numbered models',()=>{
 assert.ok(vehicleMatches({make:'Mercedes-Benz',model:'C-Class (W204)'},{make:'Mercedes',model:'C CLASS C220 CDI'}));
 assert.ok(vehicleMatches({make:'Nissan',model:'NV200 Evalia (M20)'},{make:'Nissan',model:'NV 200'}));
 for(const [a,b] of [['NV200','NV400'],['CX3','CX30'],['208','2008'],['Juke','Qashqai']]){
  assert.equal(vehicleMatches({make:'Nissan',model:a},{make:'Nissan',model:b}),false);
 }
});
test('automatic artwork upgrades use a conditional write and never overwrite manual choices',async()=>{
 for(const manual of [true,false]){
  let write;
  const result=await saveVehicleArtwork(vehicle,{environment,fetcher:async(url,options)=>{
   if(!options.method)return {ok:true,json:async()=>[{value:{...vehicle,generic:true,manual},updated_at:'2026-11-03T12:00:00Z'}]};
   write={url,...options};return {ok:true};
  }});
  assert.equal(result,true);
  if(manual)assert.equal(write,undefined);else{assert.equal(write.method,'PATCH');assert.match(write.url,/updated_at=eq\./);assert.equal(JSON.parse(write.body).value.generic,undefined);}
 }
});
test('later government colour can correct an earlier saved colour',async()=>{
 let prefer;await saveVehicleColour({...vehicle,primaryColour:'Blue'},{environment,fetcher:async(_url,options)=>{prefer=options.headers.Prefer;return {ok:true};}});
 assert.match(prefer,/resolution=merge-duplicates/);
});
const source=fs.readFileSync('public/js/vecta-haynes-booking.js','utf8');
function controller(fetcher,onChange,current=()=>vehicle.registration){
 const window={fetch:fetcher,VectaVehicleImage:{vehicleMatches}};
 vm.runInNewContext(source,{window,AbortController,setTimeout,clearTimeout,URLSearchParams});
 return window.VectaHaynesBooking.createController({getRegistration:current,getMake:()=>vehicle.make,getModel:()=>vehicle.model,fetcher,onChange});
}
test('booking paints saved artwork while Haynes is pending and keeps it after a login failure',async()=>{
 let finish;const changes=[];
 const tools=controller(async url=>url.startsWith('/api/vehicle-artwork')?{ok:true,json:async()=>({status:'ARTWORK',vehicle:{...vehicle,colour:'Blue'}})}:new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({status:'LOGIN_REQUIRED'})});}),v=>changes.push(v));
 const lookup=tools.lookup(vehicle.registration);await new Promise(r=>setImmediate(r));
 assert.equal(changes.at(-1).status,'artwork');assert.equal(changes.at(-1).vehicle.typeId,undefined);
 finish();await lookup;assert.equal(changes.at(-1).status,'artwork');assert.equal(changes.at(-1).vehicle.colour,'Blue');
});
test('a Haynes model mismatch does not replace the correct saved drawing',async()=>{
 const changes=[],tools=controller(async url=>({ok:true,json:async()=>url.startsWith('/api/vehicle-artwork')?{status:'ARTWORK',vehicle}:{status:'MATCHED',vehicle:{...vehicle,model:'NV400'}}}),v=>changes.push(v));
 await tools.lookup(vehicle.registration);assert.equal(changes.at(-1).status,'artwork');assert.equal(changes.at(-1).vehicle.model,vehicle.model);
});
test('changing the registration prevents either late lookup from painting the previous vehicle',async()=>{
 let current=vehicle.registration;const changes=[],tools=controller(async url=>{await new Promise(r=>setImmediate(r));return {ok:true,json:async()=>url.startsWith('/api/vehicle-artwork')?{status:'ARTWORK',vehicle}:{status:'MATCHED',vehicle}};},v=>changes.push(v),()=>current);
 const lookup=tools.lookup(current);current='CD34EFG';tools.reset();await lookup;assert.equal(changes.at(-1).status,'idle');
});

test('every image lookup can use the same base model despite different trims and engine descriptions',()=>{
 const examples=[['Mazda','6 (GJ, GL)','MAZDA 6 SPORT NAV D'],['Mazda','6 (GH)','6 SE-L D NAV'],['Mazda','6 (GJ)','MAZDA6 SPORT'],['Ford','Fiesta VII (HJ)','FIESTA TITANIUM TDCI'],['Nissan','Qashqai (J11)','QASHQAI N-CONNECTA DCI'],['Volkswagen','Golf VII (5G)','VW GOLF GT TDI'],['Toyota','Yaris (XP13)','YARIS ICON VVT-I'],['Peugeot','208 I (CA, CC)','PEUGEOT 208 ALLURE'],['Citroën','C4 Picasso II','CITROEN C 4 PICASSO BLUEHDI'],['Hyundai','i20 (GB)','I 20 SE MPI'],['BMW','3 (E90)','320D M SPORT'],['Mercedes-Benz','C-Class (W204)','C220 CDI SPORT'],['Land Rover','Range Rover Evoque','RANGE ROVER EVOQUE SE TD4']];
 for(const [make,model,description] of examples)assert.equal(vehicleMatches({make,model},{make,model:description}),true,make+' '+description);
});
test('unknown registration reuses a model drawing without inheriting the donor colour or technical identity',async()=>{
 let catalogueReads=0;const handler=createArtworkHandler({environment,fetcher:async url=>{
  if(url.includes('or=')){catalogueReads++;return {ok:true,json:async()=>[{id:'vehicle_identity:OTHER1',value:{...vehicle,registration:'OTHER1',make:'Mazda',model:'6 (GJ)',colour:'Red'}}]};}
  return {ok:true,json:async()=>[]};
 }});
 for(const registration of ['AB12CDE','CD34EFG']){
  let result;await handler({method:'GET',query:{reg:registration,make:'MAZDA',model:'6 SPORT NAV'}},{setHeader(){},status(){return this;},json(value){result=value;}});
  assert.equal(result.status,'ARTWORK');assert.equal(result.vehicle.registration,registration);assert.equal(result.vehicle.generic,true);assert.equal(result.vehicle.imageUrl,asset);
  assert.equal(result.vehicle.colour,undefined);assert.equal(result.vehicle.typeId,undefined);assert.equal(result.vehicle.variant,undefined);
 }
 assert.equal(catalogueReads,1);
});
