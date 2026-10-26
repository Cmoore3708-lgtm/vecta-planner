import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
const client=fs.readFileSync('public/js/vecta-haynes-booking.js','utf8');
for(const path of ['public/booking.html','website/booking/index.html'])test(`${path}: Haynes pricing and persistent identity preserve advisories and live submission`,async()=>{
 const html=fs.readFileSync(path,'utf8'),{document}=parseHTML(html),requests=[];
 const root={document,URL,URLSearchParams,location:{search:''},AbortController,AbortSignal,console,setTimeout,clearTimeout,setInterval,clearInterval,alert(){},crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'}};
 root.window=root;root.fetch=async(url,options)=>{
  requests.push({url,options});
  const data=String(url).includes('/api/haynes-vehicle')?{status:'MATCHED',vehicle:{registration:'NU67VSE',make:'NISSAN',model:'Qashqai',variant:'1.6 DiG-T 190',engineCode:'MR16DDT',vehicle:'NISSAN Qashqai 1.6 DiG-T 190',typeId:'t_1'}}:String(url).includes('/api/vehicle-lookup')?{vehicle:'NISSAN QASHQAI',make:'NISSAN',advisories:['Tyre worn'],engineCapacity:1618}:String(url).includes('/api/website-booking')?{ok:true,request_id:'receipt',confirmed:false}:{};
  return {ok:true,status:200,json:async()=>data};
 };
 vm.createContext(root);if(html.includes('/js/vecta-booking-transfer.js'))vm.runInContext(fs.readFileSync('website/js/vecta-booking-transfer.js','utf8'),root);vm.runInContext(fs.readFileSync('public/js/vecta-tyre-booking.js','utf8'),root);vm.runInContext(client,root);vm.runInContext(fs.readFileSync('public/js/vecta-vehicle-image.js','utf8'),root);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1])vm.runInContext(m[1],root);
 await new Promise(r=>setImmediate(r));await vm.runInContext("state.form.registration='NU67VSE';lookup('NU67VSE')",root);await new Promise(r=>setImmediate(r));
 assert.equal(vm.runInContext('serviceEngineSize()',root),1600);
 assert.equal(vm.runInContext('state.step',root),2);
 assert.equal(document.querySelector('[data-haynes-confirm]'),null);
 for(const answer of ['yes','no']){vm.runInContext("state.form.nevos_vehicle='';render()",root);assert.ok(document.querySelector('.nevos-question'));document.querySelector('[data-nevos-choice="'+answer+'"]').onclick();assert.equal(document.querySelector('.nevos-question'),null);assert.equal(vm.runInContext('state.form.nevos_vehicle',root),answer);}
 vm.runInContext("state.form.job_types=['Service'];state.form.service_choice='Full Service';state.form.parts_range='Mid Range';state.form.inspect_mot_advisories='yes'",root);
 assert.equal(vm.runInContext('estimateCost()',root),155);
 for(let step=1;step<=5;step++){
  vm.runInContext(`state.step=${step};render()`,root);
  assert.equal(document.querySelectorAll('[data-haynes-slot]').length,1);
  assert.match(document.querySelector('[data-haynes-slot]').textContent,/MR16DDT/);
  if(step===1){
   assert.match(document.querySelector('.advisories').textContent,/Tyre worn/);
   const details=document.querySelector('.haynes-vehicle');
   assert.equal(details.querySelector('[data-field="registration"]').value,'NU67VSE');
   assert.ok(details.querySelector('.haynes-meta'),'Haynes vehicle details remain visible');
   assert.ok(details.querySelector('.vehicle-top [data-field="registration"]'),'registration remains in its vehicle identity block');
   assert.equal(document.querySelector('#next'),null);
   assert.equal(document.querySelector('[data-haynes-confirm]'),null);
   document.querySelector('#next').onclick();
   assert.equal(vm.runInContext('state.step',root),2);
   assert.equal(vm.runInContext('state.form.haynes_identity.engineCode',root),'MR16DDT');
  }
  else {assert.equal(document.querySelector('.vehicle-summary'),null);assert.doesNotMatch(document.querySelector('[data-haynes-slot]').textContent,/Mileage at last MOT|MOT due|Tyre worn/);}
  assert.equal(document.querySelector('[data-image-colour]'),null);
 }
 assert.equal(document.querySelector('#send').hasAttribute('disabled'),false);
 await document.querySelector('#send').onclick();
 const write=requests.find(r=>r.url==='/api/website-booking');assert.ok(write,'live submit must remain enabled');
 const body=JSON.parse(write.options.body);assert.equal(body.approximate_cost,155);assert.match(body.work_required,/Tyre worn/);
 assert.doesNotMatch(html,/Bookings cannot be submitted|Test — booking disabled/);
});
for(const path of ['public/booking.html','website/booking/index.html'])test(`${path}: optional copy cannot delay the form or override the approved confirmation message`,async()=>{
 const html=fs.readFileSync(path,'utf8'),{document}=parseHTML(html);let copyRequested=false;
 const root={document,URL,URLSearchParams,location:{search:''},AbortController,AbortSignal,console,setTimeout,clearTimeout,alert(){},crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'}};root.window=root;
 root.fetch=async url=>{if(String(url).includes('website-content-public')){copyRequested=true;assert.ok(document.querySelector('[data-field="registration"]'),'form must render before optional copy request');return new Promise(()=>{});}return {ok:true,status:200,json:async()=>({})};};
 vm.createContext(root);vm.runInContext(fs.readFileSync('public/js/vecta-tyre-booking.js','utf8'),root);vm.runInContext(client,root);vm.runInContext(fs.readFileSync('public/js/vecta-vehicle-image.js','utf8'),root);for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1])vm.runInContext(m[1],root);
 assert.equal(copyRequested,true);assert.equal(document.querySelector('#next'),null);
 vm.runInContext("window.__VECTA_ADMIN_COPY__={bookingServiceIntro:'Choose for {vehicle}.',bookingConfirmedTitle:'Booking confirmed',bookingConfirmedMessage:'Already accepted',bookingRequestReceivedTitle:'Booking request received',bookingRequestReceivedMessage:'Your appointment is not yet confirmed'};state.form.vehicle='Test car';state.form.registration='';state.step=1",root);assert.equal(vm.runInContext('valid()',root),false);assert.equal(vm.runInContext("adminCopy('bookingServiceIntro')",root),'Choose for Test car.');
 document.getElementById('app').innerHTML='<div class="success"><h1></h1><strong class="booking-confirmed"></strong></div>';vm.runInContext('applyConfirmationCopy()',root);assert.equal(document.querySelector('.success h1').textContent,'Booking confirmed');assert.match(document.querySelector('.booking-confirmed').textContent,/Your booking is confirmed/);assert.doesNotMatch(document.querySelector('.booking-confirmed').textContent,/not yet confirmed|review your request/);
});
