import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../../api/website-booking.js';

const html=fs.readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
const helper=html.slice(html.indexOf('let bookingSubmission = null;'),html.indexOf('async function submit(){'));
const id='12345678-1234-4123-8123-123456789abc';
const payload={customer_name:'Booking test',email:'test@example.invalid',phone:'00000000000',registration:'AB12CDE',vehicle:'Test vehicle',job_types:['Brakes'],work_required:'Test only',appointment_date:'2026-12-01'};
function browser(fetch){let ids=0;const context=vm.createContext({fetch,crypto:{randomUUID:()=>`${id.slice(0,-1)}${++ids}`},AbortSignal:{timeout:()=>undefined},setTimeout:callback=>callback()});vm.runInContext(helper,context);return context;}
const reply=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});

test('the complete booking page scripts compile',()=>{
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
});
test('a timed out submission retries with a fresh timeout and the same identity',async()=>{
 let calls=0;const c=browser(async()=>{if(++calls===1){const error=new Error('Timed out');error.name='TimeoutError';throw error;}return reply(201,{ok:true,request_id:id});});
 await c.sendBookingRequest(payload);assert.equal(calls,2);
});

test('a lost response retries with the exact same booking identity and body',async()=>{
 const bodies=[];const c=browser(async(url,options)=>{bodies.push(options.body);if(bodies.length===1)throw new TypeError('Failed to fetch');return reply(200,{ok:true,request_id:id});});
 assert.equal((await c.sendBookingRequest(payload)).request_id,id);
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
});
test('temporary gateway failures retry, validation failures do not',async()=>{
 for(const status of [400,409,500,502,503,504]){let calls=0;const c=browser(async()=>{calls++;return calls===1?reply(status,{error:'Rejected'}):reply(201,{ok:true,request_id:id});});
  if(status<500){await assert.rejects(c.sendBookingRequest(payload),/Rejected/);assert.equal(calls,1);}
  else{await c.sendBookingRequest(payload);assert.equal(calls,2);}
 }
});
test('exhausted retries keep the identity for another click; edited details get a new identity',async()=>{
 const bodies=[];const c=browser(async(url,options)=>{bodies.push(JSON.parse(options.body));throw new TypeError('Failed to fetch');});
 await assert.rejects(c.sendBookingRequest(payload),/details are still here/);
 await assert.rejects(c.sendBookingRequest(payload),/details are still here/);
 assert.equal(bodies.length,6);assert.equal(new Set(bodies.map(b=>b.request_id)).size,1);
 await assert.rejects(c.sendBookingRequest({...payload,appointment_date:'2026-12-02'}));
 assert.notEqual(bodies[6].request_id,bodies[0].request_id);
});

async function withDatabase(run){
 const oldFetch=globalThis.fetch,oldEnv={...process.env};const rows=new Map();let notifications=0,loseInsertResponse=false;
 process.env.VERCEL_ENV='production';process.env.VERCEL_PROJECT_NAME='booking-test';process.env.VERCEL_PROJECT_PRODUCTION_URL='booking-test.invalid';process.env.VITE_SUPABASE_URL='https://booking-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/workshop_push_subscriptions')){notifications++;return reply(200,[]);}
  assert.ok(path.endsWith('/website_booking_requests'),'only booking requests may be written');
  if(options.method==='POST'){
   assert.match(options.headers.Prefer,/resolution=ignore-duplicates/);
   const row=JSON.parse(options.body);if(rows.has(row.id))return reply(201,[]);
   rows.set(row.id,row);if(loseInsertResponse){loseInsertResponse=false;throw new TypeError('Database response lost');}
   return reply(201,[row]);
  }
  const query=new URL(url).searchParams;const key=query.get('id');return reply(200,key?[rows.get(key.slice(3))].filter(Boolean):[...rows.values()]);
 };
 async function submit(body){const res={status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',body},res);return res;}
 try{await run({submit,rows,get notifications(){return notifications;},loseResponse(){loseInsertResponse=true;}});}finally{globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}
}
test('concurrent submissions create one inbox request and return the same receipt',async()=>withDatabase(async db=>{
 const responses=await Promise.all([db.submit({...payload,request_id:id}),db.submit({...payload,request_id:id})]);
 assert.deepEqual(responses.map(r=>r.code).sort(),[200,201]);assert.equal(db.rows.size,1);assert.equal(db.notifications,1);
 for(const response of responses){assert.equal(response.data.request_id,id);assert.equal(response.data.confirmed,false);}
 assert.equal(db.rows.get(id).status,'awaiting_review');
}));
test('a database insert whose response is lost recovers without a duplicate',async()=>withDatabase(async db=>{
 db.loseResponse();const first=await db.submit({...payload,request_id:id});assert.equal(first.code,500);
 const second=await db.submit({...payload,request_id:id});assert.equal(second.code,200);assert.equal(db.rows.size,1);
}));
test('reusing an identity for different details cannot overwrite the original',async()=>withDatabase(async db=>{
 await db.submit({...payload,request_id:id});const response=await db.submit({...payload,request_id:id,work_required:'Changed work'});
 assert.equal(response.code,409);assert.equal(db.rows.get(id).work_required,payload.work_required);
 assert.equal((await db.submit({...payload,request_id:'invalid'})).code,400);
}));
test('legacy submissions without a request identity still work',async()=>withDatabase(async db=>{
 const response=await db.submit(payload);assert.equal(response.code,201);assert.equal(db.rows.size,1);
}));
