import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
const client=fs.readFileSync('public/js/vecta-haynes-booking.js','utf8');
for(const path of ['public/booking.html','website/booking/index.html'])test(`${path}: Haynes pricing and persistent identity preserve advisories and live submission`,async()=>{
 const html=fs.readFileSync(path,'utf8'),{document}=parseHTML(html),requests=[];
 const root={document,URL,URLSearchParams,location:{search:''},AbortController,AbortSignal,console,setTimeout,clearTimeout,alert(){},crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'}};
 root.window=root;root.fetch=async(url,options)=>{
  requests.push({url,options});
  const data=String(url).includes('/api/haynes-vehicle')?{status:'MATCHED',vehicle:{registration:'NU67VSE',make:'NISSAN',model:'Qashqai',variant:'1.6 DiG-T 190',engineCode:'MR16DDT',vehicle:'NISSAN Qashqai 1.6 DiG-T 190',typeId:'t_1'}}:String(url).includes('/api/vehicle-lookup')?{vehicle:'NISSAN QASHQAI',make:'NISSAN',advisories:['Tyre worn'],engineCapacity:1618}:String(url).includes('/api/website-booking')?{ok:true,request_id:'receipt',confirmed:false}:{};
  return {ok:true,status:200,json:async()=>data};
 };
 vm.createContext(root);vm.runInContext(client,root);vm.runInContext(fs.readFileSync('public/js/vecta-vehicle-image.js','utf8'),root);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1])vm.runInContext(m[1],root);
 await new Promise(r=>setImmediate(r));await vm.runInContext("state.form.registration='NU67VSE';lookup('NU67VSE')",root);await new Promise(r=>setImmediate(r));
 assert.equal(vm.runInContext('serviceEngineSize()',root),1600);
 vm.runInContext("state.form.job_types=['Service'];state.form.service_choice='Full Service';state.form.parts_range='Mid Range';state.form.inspect_mot_advisories='yes'",root);
 assert.equal(vm.runInContext('estimateCost()',root),155);
 for(let step=1;step<=5;step++){
  vm.runInContext(`state.step=${step};render()`,root);
  assert.equal(document.querySelectorAll('[data-haynes-slot]').length,1);
  assert.match(document.querySelector('[data-haynes-slot]').textContent,/MR16DDT/);
  if(step===1)assert.match(document.querySelector('.advisories').textContent,/Tyre worn/);
  else {assert.equal(document.querySelector('.vehicle-summary .advisories'),null);assert.doesNotMatch(document.querySelector('.vehicle-summary').textContent,/Mileage at last MOT|MOT due|Tyre worn/);}
  assert.equal(document.querySelector('[data-image-colour]'),null);
 }
 assert.equal(document.querySelector('#send').hasAttribute('disabled'),false);
 await document.querySelector('#send').onclick();
 const write=requests.find(r=>r.url==='/api/website-booking');assert.ok(write,'live submit must remain enabled');
 const body=JSON.parse(write.options.body);assert.equal(body.approximate_cost,155);assert.match(body.work_required,/Tyre worn/);
 assert.doesNotMatch(html,/Bookings cannot be submitted|Test — booking disabled/);
});
