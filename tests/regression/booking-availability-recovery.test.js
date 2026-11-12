import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
const slots=[{date:'2026-11-24',time:'09:00',technician:'Alfie'}];
function fn(name){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);return html.slice(start,end);}
function setup(fetch){
 const {document}=parseHTML('<html><body></body></html>');
 const timers=new Map();let nextTimer=0;
 const c={document,fetch,AbortController,state:{step:3,form:{job_types:['Service','MOT'],service_choice:'Full Service',available_slots:[],mot_advisories:[],completion_deadline:'After 3pm',appointment_date:'',appointment_time:'',technician:''}},
  setTimeout(fn,ms){const id=++nextTimer;if(ms===20000)timers.set(id,fn);else fn();return id;},clearTimeout(id){timers.delete(id);},timers,
  estimateHours:()=>3,isMotBooking:()=>c.state.form.job_types.includes('MOT'),esc:String,prettyDate:String};
 vm.createContext(c);
 const start=html.indexOf('async function requestAvailability('),end=html.indexOf('\nfunction bindV137(',start);
 vm.runInContext(html.slice(start,end)+'\n'+['monthKey','calendarMonthLabel','shiftMonth','motCalendarHtml','bindV137','valid','bookingMissingRequirements'].map(fn).join('\n'),c);
 c.render=()=>{document.body.innerHTML=c.state.availability_loading?'<p>Loading dates</p>':c.motCalendarHtml();c.bindV137();};
 return c;
}
const reply=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('a dropped availability read retries automatically and displays selectable server dates',async()=>{
 let calls=0;const bodies=[],signals=[];const c=setup(async(url,options)=>{assert.equal(url,'/api/availability');bodies.push(options.body);signals.push(options.signal);if(++calls===1)throw new TypeError('Failed to fetch');return reply(200,{slots});});
 await c.fetchAvailability();assert.equal(calls,2);assert.equal(new Set(bodies).size,1);assert.notEqual(signals[0],signals[1]);assert.equal(c.timers.size,0);
 assert.equal(c.state.availability_error,'');assert.equal(c.state.availability_loading,false);assert.ok(c.document.querySelector('[data-mot-date]'));
 c.document.querySelector('[data-mot-date]').onclick();assert.equal(c.valid(),true);assert.equal(c.state.form.appointment_date,slots[0].date);
 assert.deepEqual(JSON.parse(bodies[0]).job_types,['Full Service','MOT']);
});
test('persistent gateway failure shows a working Try again button, preserves work and never claims no dates',async()=>{
 let calls=0;const c=setup(async()=>{calls++;return reply(503,{error:'Temporary outage'});});
 await c.fetchAvailability();assert.equal(calls,3);assert.match(c.document.body.textContent,/couldn’t load/);assert.doesNotMatch(c.document.body.textContent,/no online dates/);
 assert.equal(c.valid(),false);assert.match(c.bookingMissingRequirements().join(' '),/Press Try again/);
 c.fetch=async()=>reply(200,{slots});await c.document.querySelector('[data-retry-availability]').onclick();
 assert.equal(c.state.availability_error,'');assert.equal(c.state.form.completion_deadline,'After 3pm');assert.equal(c.state.form.service_choice,'Full Service');assert.ok(c.document.querySelector('[data-mot-date]'));
});
test('invalid JSON and missing or incomplete slot data are retried, never interpreted as an empty diary',async()=>{
 for(const response of [{ok:true,json:async()=>{throw new SyntaxError('HTML gateway response');}},reply(200,{}),reply(200,{slots:null}),reply(200,{slots:[{date:'2026-11-24'}]}),reply(200,null)]){
  let calls=0;const c=setup(async()=>{calls++;return response;});await c.fetchAvailability();assert.equal(calls,3);assert.equal(c.state.availability_error,'unavailable');assert.doesNotMatch(c.document.body.textContent,/no online dates/);
 }
});
test('a genuine empty server result stays empty and can be checked again without inventing capacity',async()=>{
 let calls=0;const c=setup(async()=>{calls++;return reply(200,{slots:[]});});await c.fetchAvailability();assert.equal(calls,1);assert.equal(c.state.availability_error,'');
 assert.match(c.document.body.textContent,/no online dates/);assert.equal(c.document.querySelector('[data-mot-date]'),null);assert.equal(c.valid(),false);
 assert.match(c.document.querySelector('[data-retry-availability]').textContent,/Check dates again/);
});
test('validation errors do not cause automatic retries',async()=>{
 let calls=0;const c=setup(async()=>{calls++;return reply(400,{error:'Invalid work type'});});await c.fetchAvailability();assert.equal(calls,1);assert.equal(c.state.availability_error,'unavailable');
});
test('a stalled read is aborted and retried with a fresh timeout',async()=>{
 let calls=0;const c=setup(async(url,options)=>{if(++calls===1)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Timed out'))));return reply(200,{slots});});
 const pending=c.fetchAvailability();assert.equal(c.state.availability_loading,true);assert.equal(c.timers.size,1);[...c.timers.values()][0]();await pending;
 assert.equal(calls,2);assert.equal(c.timers.size,0);assert.ok(c.document.querySelector('[data-mot-date]'));
});
test('a slower old request cannot replace dates or errors from a newer work selection',async()=>{
 for(const oldReply of [reply(200,{slots:[{date:'2026-11-25',time:'08:00',technician:'Chris'}]}),reply(400,{})]){
  let resolve;const c=setup(()=>new Promise(r=>{resolve=r;}));const older=c.fetchAvailability();
  c.state.form.job_types=['Tyres'];c.state.form.service_choice='';c.fetch=async()=>reply(200,{slots});await c.fetchAvailability();resolve(oldReply);await older;
  assert.equal(c.state.form.available_slots[0].date,'2026-11-24');assert.equal(c.state.availability_error,'');assert.equal(c.state.availability_loading,false);
 }
});
test('Continue stays blocked while dates are rechecked, and a failed read clears the old selection',async()=>{
 let resolve;const c=setup(()=>new Promise(r=>{resolve=r;}));Object.assign(c.state.form,{appointment_date:slots[0].date,appointment_time:slots[0].time,technician:'Alfie'});
 const pending=c.fetchAvailability();assert.equal(c.valid(),false);assert.match(c.bookingMissingRequirements().join(' '),/Wait for the available dates/);
 resolve(reply(400,{}));await pending;assert.equal(c.valid(),false);assert.equal(c.state.form.appointment_date,'');
});
