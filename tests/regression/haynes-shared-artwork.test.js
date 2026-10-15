import test from 'node:test';
import assert from 'node:assert/strict';
import {saveVehicleArtwork} from '../../lib/haynes-shared-artwork.js';

const vehicle={registration:'DC14 EEZ',make:'VOLKSWAGEN',model:'Tiguan I (5N)',imageUrl:'https://www.haynespro-assets.com/workshop/images/319011560.svgz',vin:'private',typeId:'t_123'};
test('successful lookup fills shared artwork without overwriting a saved choice or copying technical fields',async()=>{
 let request;
 const result=await saveVehicleArtwork(vehicle,{environment:()=>({url:'https://workshop.example',serviceKey:'server-only'}),fetcher:async(url,options)=>{request={url,...options};return {ok:true};}});
 assert.equal(result,true);assert.match(request.url,/workshop_settings\?on_conflict=id$/);
 assert.match(request.headers.Prefer,/resolution=ignore-duplicates/);
 const row=JSON.parse(request.body);assert.equal(row.id,'vehicle_artwork:DC14EEZ');assert.equal(row.value.imageUrl,vehicle.imageUrl);
 assert.equal(row.value.vin,undefined);assert.equal(row.value.typeId,undefined);
});
test('unsafe drawings never reach the shared store',async()=>{
 let calls=0;
 assert.equal(await saveVehicleArtwork({...vehicle,imageUrl:'https://other.example/car.svg'},{fetcher:async()=>{calls++;}}),false);
 assert.equal(calls,0);
});
test('image storage failure cannot fail a successful vehicle lookup',async()=>{
 assert.equal(await saveVehicleArtwork(vehicle,{environment:()=>{throw Error('Unavailable');}}),false);
});
