import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../lib/booking-reminder-test.js';
import {managerSessionCookie} from '../../middleware.js';
import {staffEligible,staffReminderContent} from '../../lib/nmuk-service-reminders.js';

test('staff reminder covers booked MOTs but excludes quotes and closed jobs',()=>{
  const job={booking_date:'2026-10-12',archived:false,customer_account:'Staff',status:'booked',card_type:'job',registration:'AB12 CDE',recipient:'driver@example.com',job_type:'MOT'};
  assert.equal(staffEligible(job,'2026-10-12'),true);
  for(const change of [{status:'completed'},{status:'cancelled'},{status:'ready_to_invoice'},{card_type:'quote'},{customer_account:'CONTRACTOR'},{recipient:''},{archived:true}]) assert.equal(staffEligible({...job,...change},'2026-10-12'),false);
  assert.equal(staffEligible(job,'2026-10-13'),false);
  assert.match(staffReminderContent(job).text,/before you start your day/);
  assert.match(staffReminderContent(job).text,/reply to this email/);
});

test('manual test requires manager authentication and same origin; recipient is fixed',async()=>{
  const keys=['VECTA_MAIN_USER','VECTA_MAIN_PASSWORD','RESEND_API_KEY'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),fetchBefore=globalThis.fetch;
  Object.assign(process.env,{VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'test-password',RESEND_API_KEY:'test-only'});
  const sends=[];
  globalThis.fetch=async(url,options)=>{sends.push({url,options});return {ok:true,status:200,json:async()=>({id:'provider-test'})};};
  const run=async(req)=>{let status,body;await handler(req,{setHeader(){},status(code){status=code;return this;},json(value){body=value;return this;}});return {status,body};};
  try {
    const base={method:'POST',headers:{host:'vecta.example',origin:'https://vecta.example','content-type':'application/json'},body:{kind:'staff',to:'wrong@example.com'}};
    assert.equal((await run(base)).status,401);
    const cookie=(await managerSessionCookie({user:'manager',password:'test-password'})).split(';')[0];
    const authorized={...base,headers:{...base.headers,cookie}};
    assert.equal((await run({...authorized,headers:{...authorized.headers,origin:'https://attacker.example'}})).status,403);
    assert.equal((await run({...authorized,method:'GET'})).status,405);
    assert.equal((await run({...authorized,body:{kind:'other'}})).status,400);
    assert.equal(sends.length,0);
    const result=await run(authorized);assert.equal(result.status,200);
    const payload=JSON.parse(sends[0].options.body);
    assert.deepEqual(payload.to,['chris@nissan-fleet.co.uk']);
    assert.equal(payload.from,'chris@vectamotors.co.uk');assert.equal(payload.reply_to,payload.from);
    assert.match(payload.subject,/^\[TEST\]/);assert.match(payload.text,/not a real booking/);
    await run(authorized);assert.equal(sends[0].options.headers['Idempotency-Key'],sends[1].options.headers['Idempotency-Key']);
    globalThis.fetch=async()=>({ok:false,status:403,json:async()=>({})});
    assert.equal((await run(authorized)).status,502);
  } finally {globalThis.fetch=fetchBefore;for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('noon cron reads staff account memory, records send, and prevents duplicates',async()=>{
  const {default:cron}=await import('../../lib/nmuk-service-reminders.js');
  const OriginalDate=Date,previousFetch=fetch,keys=['CRON_SECRET','RESEND_API_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VERCEL_ENV'];
  const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  let clock='2026-12-14T12:00:00Z';
  globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return OriginalDate.parse(clock);}};
  Object.assign(process.env,{CRON_SECRET:'cron-test',RESEND_API_KEY:'email-test',SUPABASE_SERVICE_ROLE_KEY:'db-test',VITE_SUPABASE_URL:'https://mock.invalid',VERCEL_ENV:'production'});
  const sends=[],reserved=new Set();
  globalThis.fetch=async(url,options={})=>{
    const result=(data,status=200)=>({ok:status<300,status,json:async()=>data});
    if(url.includes('/jobs?'))return result([{id:'staff-1',booking_date:'2026-12-15',archived:false,status:'booked',card_type:'job',registration:'AB12 CDE',customer_name:'Driver',customer_email:'driver@example.com',job_type:'MOT'}]);
    if(url.includes('id=eq.fleet_state_v77'))return result([{value:{vehicles:[]}}]);
    if(url.includes('workshop_settings?'))return result([{id:'jobcustomer:staff-1',value:{customer_account:'Staff'}}]);
    if(url==='https://api.resend.com/emails'){sends.push(JSON.parse(options.body));return result({id:'provider-staff'});}
    if(options.method==='POST'){const id=JSON.parse(options.body).id;if(reserved.has(id))return result({message:'duplicate'},409);reserved.add(id);return result([]);}
    if(options.method==='PATCH')return result([]);
    throw Error('Unexpected URL');
  };
  const run=async()=>{let status,body;await cron({method:'GET',headers:{authorization:'Bearer cron-test'}},{status(code){status=code;return this;},json(value){body=value;return this;}});return {status,body};};
  try{
    clock='2026-12-14T11:00:00Z';assert.equal((await run()).body.skipped,'Outside UK midday');assert.equal(sends.length,0);
    clock='2026-12-14T12:00:00Z';assert.equal((await run()).body.sent,1);assert.equal((await run()).body.sent,0);
    assert.equal(sends.length,1);assert.equal(sends[0].from,'chris@vectamotors.co.uk');assert.equal(sends[0].reply_to,'chris@vectamotors.co.uk');assert.deepEqual(sends[0].to,['driver@example.com']);
  }finally{globalThis.Date=OriginalDate;globalThis.fetch=previousFetch;for(const [key,value]of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
