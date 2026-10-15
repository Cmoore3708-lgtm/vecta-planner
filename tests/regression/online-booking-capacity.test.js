import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../../api/availability.js';
import {bookingTypes} from '../../lib/booking-input.js';
test('work types are canonical, deduplicated and cannot understate service duration',()=>{
 assert.deepEqual(bookingTypes({job_types:['Service','MOT','MOT'],service_choice:'Major Service'}),['Major Service','MOT']);
 assert.deepEqual(bookingTypes({job_types:['Interim Service']}),['Oil & Filter Change']);
 assert.throws(()=>bookingTypes({job_types:['free text']}),{code:'BOOKING_INPUT'});
});
test('availability uses the same server engine as admission and ignores client duration claims',async()=>{
 const oldFetch=global.fetch,oldEnv={...process.env};Object.assign(process.env,{VERCEL_ENV:'production',VITE_SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'});let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.equal(new URL(url).pathname,'/rest/v1/rpc/vecta_online_booking_availability');assert.deepEqual(JSON.parse(options.body),{p_types:['Major Service','MOT']});return new Response(JSON.stringify({slots:[{date:'2050-01-04',time:'08:00'}],earliest_date:'2050-01-04',hours:3.5}));};
 const r={setHeader(){},status(n){this.code=n;return this},json(v){this.data=v;return this}};
 try{await handler({method:'POST',body:{job_types:['Major Service','MOT'],estimated_hours:0.5}},r);assert.equal(r.code,200);assert.equal(r.data.hours,3.5);assert.equal(calls,1);}finally{global.fetch=oldFetch;process.env=oldEnv;}
});
test('both booking pages compile and use server-checked dates without browser 48-hour arithmetic',()=>{
 for(const file of ['website/booking/index.html','public/booking.html']){
  const html=fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
  assert.doesNotMatch(html,/appointmentIsBeyond48Hours|appointmentIsAtLeastDaysAway/);
  assert.match(html,/f.available_slots=d.slots\|\|\[\]/);
 }
});
