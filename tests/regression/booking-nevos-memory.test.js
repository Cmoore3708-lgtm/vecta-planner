import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function formContext(){
 const state={mileage_dialog_open:true,form:{registration:'AB12CDE',vehicle:'Nissan Juke',vehicle_make:'Nissan',job_types:['Service','Tyres'],service_choice:'Full Service',work_required:'Full Service',tyre_choice:'Budget',tyre_brand:'Budget brand',tyre_unit_price:6000,parts_preference:'budget',service_extra_choice:'replace'}},listeners={},sent=[];
 const parent={postMessage:(...args)=>sent.push(args)},window={parent,location:{origin:'https://vecta.example',search:'?app=1'},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(){}};
 const c=vm.createContext({state,window,URLSearchParams});
 for(const name of ['applyNevosChoice','isNevosEligibleVehicle','nevosHtml']){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),c);}
 vm.runInContext(fs.readFileSync('public/js/vecta-garage-booking.js','utf8'),c);
 window.VectaGarageBooking.connect({getForm:()=>state.form,render(){},applyNevos:c.applyNevosChoice});
 return {c,state,listeners,window,parent,sent};
}
test('saved Yes prefill removes the prompt and enforces the same NEVOS restrictions as answering it',()=>{
 const {c,state,listeners,window,parent}=formContext(),data={type:'vecta-garage-prefill',registration:'AB12 CDE',nevos_vehicle:'yes',profile:{email:'qa@example.invalid'}};
 listeners.message({origin:window.location.origin,source:parent,data});
 assert.equal(state.form.nevos_vehicle,'yes');assert.equal(c.nevosHtml(),'');assert.equal(state.form.parts_preference,'oem');assert.deepEqual(state.form.job_types,['Tyres']);assert.equal(state.form.service_choice,'');assert.equal(state.mileage_dialog_open,false);assert.equal(state.form.service_extra_choice,'none');assert.equal(state.form.tyre_choice,'');assert.equal(state.form.tyre_brand,'');
 // Official lookup must not wipe a saved answer arriving before it finishes.
 const start=html.indexOf('async function lookupRegistration('),end=html.indexOf('\nfunction ',start);
 assert.doesNotMatch(html.slice(start,end),/nevos_vehicle\s*=/);
});
test('saved No is distinct from unknown; an edited answer and unrelated vehicle are not overwritten',()=>{
 for(const answer of ['no',null,'maybe']){
  const {c,state,listeners,window,parent}=formContext();listeners.message({origin:window.location.origin,source:parent,data:{type:'vecta-garage-prefill',registration:'AB12CDE',nevos_vehicle:answer,profile:{email:'qa@example.invalid'}}});
  assert.equal(c.nevosHtml().includes('Is this a NEVOS vehicle?'),answer!=='no');
  assert.equal(state.form.parts_preference,'budget');
 }
 const {c,state,listeners,window,parent,sent}=formContext();c.applyNevosChoice('no');listeners.message({origin:window.location.origin,source:parent,data:{type:'vecta-garage-prefill',registration:'AB12CDE',nevos_vehicle:'yes',profile:{email:'qa@example.invalid'}}});assert.equal(state.form.nevos_vehicle,'no');
 window.VectaGarageBooking.rememberNevos(state.form.registration,'no');assert.equal(sent.at(-1)[0].type,'vecta-nevos-choice');assert.equal(sent.at(-1)[0].nevos_vehicle,'no');
 c.applyNevosChoice('');assert.match(c.nevosHtml(),/Is this a NEVOS/);
});
test('portal saves only the selected same-origin car; failed persistence is visible and does not fake a saved answer',async()=>{
 const {document,window:dom}=parseHTML(fs.readFileSync('public/app/home.html','utf8')),$=id=>document.getElementById(id),listeners={},requests=[];
 const vehicle={id:'car-one',registration:'AB12CDE',vehicle_data:{vehicle:'Nissan Juke'}},origin='https://vecta.example';let fail=false;
 $('modal').close=()=>{};$('bookingFrame').contentWindow={postMessage(){}};
 const context={document,location:{origin},window:{scrollTo(){},addEventListener:(n,fn)=>listeners[n]=fn},confirm:()=>true,navigator:{onLine:true,userAgent:'test',platform:'test'},matchMedia:()=>({matches:false}),localStorage:{getItem:()=> 'session'},requestAnimationFrame:fn=>fn(),AbortSignal,setTimeout,clearTimeout,URL,URLSearchParams,fetch:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);const action=body.action;
  return {ok:!(fail&&action==='garage-nevos-save'),status:fail?503:200,json:async()=>action==='garage-status'?{email:'qa@example.invalid',vehicles:[vehicle],suggestions:[],profile:{name:'Alex'}}:action==='garage-rewards'?{active:false}:action==='garage-booking-prefill'?{vehicle_id:vehicle.id,registration:vehicle.registration,profile:{email:'qa@example.invalid'}}:{ok:true}};
 }};
 vm.runInNewContext(fs.readFileSync('public/app/garage.js','utf8'),context);await flush();document.querySelector('[data-tab="book"]').dispatchEvent(new dom.Event('click',{bubbles:true}));await flush();
 const send=(data={},extra={})=>listeners.message({origin,source:$('bookingFrame').contentWindow,data:{type:'vecta-nevos-choice',registration:vehicle.registration,nevos_vehicle:'no',...data},...extra});
 send({}, {origin:'https://evil.invalid'});send({}, {source:{}});send({registration:'XY99ZZZ'});send({nevos_vehicle:true});await flush();assert.equal(requests.filter(r=>r.action==='garage-nevos-save').length,0);
 send();await flush();assert.equal(vehicle.nevos_vehicle,'no');assert.deepEqual(requests.at(-1),{action:'garage-nevos-save',session:'session',vehicle_id:'car-one',nevos_vehicle:'no'});
 fail=true;send({nevos_vehicle:'yes'});await flush();assert.match($('status').textContent,/could not be saved/);assert.equal(vehicle.nevos_vehicle,'no');
});
