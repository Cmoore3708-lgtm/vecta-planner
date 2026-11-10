import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {portalSnapshot} from '../../lib/customer-portal.js';
const url='https://www.haynespro-assets.com/workshop/images/319003090.svgz';
const job={id:'11111111-1111-4111-8111-111111111111',registration:'TEST001',vehicle:'Mercedes-Benz A-Class',booking_date:'2026-11-12',customer_email:'driver@example.invalid',status:'booked',work_required:'MOT'};
const now=Date.parse('2026-11-10T10:00:00Z');
test('private portal reads only the booked registration’s saved artwork before the booking day',async()=>{
 const reads=[];
 const db=async path=>{
  const u=new URL(path,'https://test.invalid');reads.push(u.pathname);
  if(u.pathname!=='/workshop_settings')return [];
  assert.equal(u.searchParams.get('id'),'in.(vehicle_artwork:TEST001,vehicle_colour:TEST001)');
  assert.equal(u.searchParams.get('select'),'id,value');assert.equal(u.searchParams.get('limit'),'2');
  return [{id:'vehicle_artwork:TEST001',value:{imageUrl:url,colour:'Silver'}},{id:'vehicle_colour:TEST001',value:{colour:'Black'}}];
 };
 const result=await portalSnapshot(db,{job},{now});
 assert.equal(result.booking.image_url,url);assert.equal(result.booking.image_colour,'Black');
 assert.equal(result.booking.images_allowed,false);assert.equal(result.booking.work_required,'MOT');
 assert.deepEqual(reads,['/customer_portal_events','/additional_work_approvals','/workshop_settings']);
});
test('missing, unavailable or untrusted artwork does not prevent the booking from loading',async()=>{
 for(const value of [null,{imageUrl:'https://untrusted.invalid/car.svg'},Error('cache unavailable')]){
  const result=await portalSnapshot(async path=>{
   if(!path.startsWith('workshop_settings?'))return [];
   if(value instanceof Error)throw value;
   return value?[{id:'vehicle_artwork:TEST001',value}]:[];
  },{job},{now});
  assert.equal(result.booking.image_url,'');assert.equal(result.booking.registration,'TEST001');
 }
});
test('mechanic snapshots do not perform customer artwork reads',async()=>{
 const result=await portalSnapshot(async path=>{assert.ok(!path.startsWith('workshop_settings?'));return [];},{job},{now,mechanic:true});
 assert.equal(result.booking.image_url,undefined);
});
test('portal reuses the personalised image and ignores stale image loads when the vehicle changes',async()=>{
 const {document}=parseHTML(readFileSync('public/track.html','utf8'));document.hidden=false;
 const data={booking:{...job,image_url:url,image_colour:'Black'},events:[],approvals:[],original:null};
 const mounts=[];const window={addEventListener(){},VectaVehicleImage:{mount:frame=>{mounts.push(frame.firstElementChild);return Promise.resolve();}}};
 vm.runInNewContext(readFileSync('public/js/vecta-customer-portal.js','utf8'),{document,window,location:{hash:'#fixture',search:''},Intl,Date,URLSearchParams,AbortSignal,clearTimeout(){},setTimeout(){},fetch:async()=>({ok:true,json:async()=>data})});
 await new Promise(r=>setImmediate(r));
 const frame=document.getElementById('portalVehicle'),identity=document.getElementById('identity'),first=frame.firstElementChild;
 assert.equal(mounts.length,1);assert.equal(first.dataset.registration,'TEST001');assert.equal(first.dataset.colour,'Black');assert.equal(first.dataset.vehicleCrop,'tight');
 assert.equal(frame.hidden,true);first.onload();assert.equal(frame.hidden,false);assert.ok(identity.classList.contains('hasVehicleImage'));
 await window.VectaCustomerPortal.refresh();assert.equal(frame.firstElementChild,first);assert.equal(mounts.length,1);
 data.booking={...data.booking,registration:'TEST002'};await window.VectaCustomerPortal.refresh();
 const second=frame.firstElementChild;assert.notEqual(second,first);first.onload();assert.equal(frame.hidden,true);
 second.onload();assert.equal(frame.hidden,false);second.onerror();assert.equal(frame.hidden,true);assert.ok(!identity.classList.contains('hasVehicleImage'));
 await window.VectaCustomerPortal.refresh();assert.equal(mounts.length,3);
 data.booking={...data.booking,image_url:''};await window.VectaCustomerPortal.refresh();assert.equal(frame.children.length,0);assert.equal(frame.hidden,true);
});
