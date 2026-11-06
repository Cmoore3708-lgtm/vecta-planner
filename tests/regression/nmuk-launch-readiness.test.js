import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {pricingVisitor,pricingCookie} from '../../lib/pricing-visitor.js';
import {receiptContent,processBookingReceipts} from '../../lib/booking-receipts.js';
import {servicePriceHandler} from '../../api/service-price.js';
const secret='a'.repeat(64),now=Date.parse('2026-11-05T12:00:00Z');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}});
test('50 employees behind the same factory address receive separate allowances',()=>{
 const actors=new Set();
 for(let n=0;n<50;n++){const res=response();actors.add(pricingVisitor({headers:{'x-vercel-forwarded-for':'192.0.2.1'}},res,secret,now));assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);}
 assert.equal(actors.size,50);
});
test('a signed browser identity survives IP changes, but forged and expired cookies do not',()=>{
 const res=response(),actor=pricingVisitor({headers:{}},res,secret,now),cookie=res.headers['Set-Cookie'].split(';')[0];
 const again=response();assert.equal(pricingVisitor({headers:{cookie,'x-vercel-forwarded-for':'203.0.113.5'}},again,secret,now+1000),actor);assert.equal(again.headers['Set-Cookie'],undefined);
 assert.notEqual(pricingVisitor({headers:{cookie:cookie.slice(0,-1)+'x'}},response(),secret,now),actor);
 assert.notEqual(pricingVisitor({headers:{cookie}},response(),secret,now+86401000),actor);
 assert.notEqual(pricingVisitor({headers:{cookie:pricingCookie+'=bad'}},response(),secret,now),actor);
});
test('pricing health requires manager authentication before reading any queue data',async()=>{
 const before={...process.env};delete process.env.VECTA_MAIN_USER;delete process.env.VECTA_MAIN_PASSWORD;
 try{const res=response();await servicePriceHandler({queue:()=>{throw Error('Must not read')}})({method:'GET',query:{health:'1'},headers:{}},res);assert.equal(res.code,401);}finally{process.env=before;}
});
const booking={id:'12345678-1234-4123-8123-123456789abc',registration:'TEST123',vehicle:'Test hatchback',customer_name:'<Chris>',email:'test@example.invalid',confirmed_date:'2026-11-12',job_types:['Full Service'],work_required:'Booking guide total: £150',approximate_cost:150};
test('receipt contains the saved reservation, reference, guide qualification and practical instructions',()=>{
 const p=receiptContent(booking,{trackingPath:()=>'/track#private-test'});
 assert.match(p.subject,/VECTA booking confirmed/);
 for(const body of [p.text,p.html]){
  assert.match(body,/Your booking is confirmed for Thursday, 12 November 2026/);
  assert.doesNotMatch(body,/booking request|awaiting|provisional|after reviewing|confirm your appointment separately/i);
 }
 assert.match(p.text,/12345678/);assert.match(p.text,/Guide total: £150.00/);assert.match(p.text,/confirm the price with you before any work/);assert.match(p.text,/SOUTH GATE/);assert.match(p.html,/&lt;Chris&gt;/);assert.doesNotMatch(p.html,/<Chris>/);assert.match(p.html,/View your car/);
 assert.deepEqual(p.to,['test@example.invalid']);assert.equal(p.reply_to,'chris@vectamotors.co.uk');
});
test('previews and missing email configuration never claim or send receipts',async()=>{
 const deps={rpc:()=>{throw Error('Do not claim')},fetcher:()=>{throw Error('Do not send')}};
 assert.equal((await processBookingReceipts({...deps,env:{VERCEL_ENV:'preview',RESEND_API_KEY:'test'}})).sent,0);
 assert.equal((await processBookingReceipts({...deps,env:{VERCEL_ENV:'production'}})).sent,0);
});
test('receipt retries reuse the frozen payload and idempotency key after a lost response',async()=>{
 const before={...process.env};Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'vecta-planner',VERCEL_PROJECT_PRODUCTION_URL:'vecta-planner.vercel.app',VITE_SUPABASE_URL:'https://jywufozycuwuoshlulwl.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'});
 let row={id:booking.id,lease:'lease',snapshot:booking,first_attempt_at:new Date(now).toISOString()},calls=0,prepared=0;
 const sent=[];
 const rpc=async(action,id,lease,payload)=>{if(action==='claim')return {...row};if(action==='prepare'){prepared++;row.payload=payload;return {...row};}if(action==='sent'){row.status='sent';return {saved:true};}return {saved:true};};
 const fetcher=async(url,options)=>{calls++;sent.push({body:options.body,key:options.headers['Idempotency-Key']});if(calls===1)throw Error('Response lost');return {ok:true,status:200,json:async()=>({id:'synthetic-provider-id'})};};
 const deps={id:booking.id,limit:1,env:{VERCEL_ENV:'production',RESEND_API_KEY:'fake'},rpc,fetcher,content:b=>receiptContent(b,{trackingPath:()=>'/track#frozen'}),now:()=>now};
 try{
  assert.equal((await processBookingReceipts(deps)).failed,1);
  row.snapshot={...booking,customer_name:'Changed name'};
  assert.equal((await processBookingReceipts(deps)).sent,1);assert.equal(prepared,1);assert.deepEqual(sent[0],sent[1]);
 }finally{process.env=before;}
});
test('unknown delivery outcomes older than the provider deduplication window are not resent',async()=>{
 const before={...process.env};Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'vecta-planner',VERCEL_PROJECT_PRODUCTION_URL:'vecta-planner.vercel.app',VITE_SUPABASE_URL:'https://jywufozycuwuoshlulwl.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'});
 try{const result=await processBookingReceipts({id:booking.id,env:{VERCEL_ENV:'production',RESEND_API_KEY:'fake'},rpc:async action=>action==='claim'?{id:booking.id,lease:'x',first_attempt_at:new Date(now-24*3600000).toISOString()}:{saved:true},fetcher:()=>{throw Error('Must not send')},now:()=>now});assert.equal(result.failed,1);assert.equal(result.sent,0);}finally{process.env=before;}
});

test('opening a website request carries its retail price, VAT and reserved slot without saving',async()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('var websiteRequestCreateBusy='),html.indexOf('function openWebsiteRequestJobCard('));
 for(const [amount,types,want,vat] of [[180,['Full Service'],180,'inc_vat'],[65,['MOT'],65,'no_vat'],[220,['Full Service','MOT'],220,'inc_vat'],[null,['Full Service'],null,'inc_vat'],[-10,['Full Service'],null,'inc_vat']]){
  let opened;const request={id:'request',approximate_cost:amount,job_types:types,confirmed_date:'2026-11-12',confirmed_time:'10:00',reserved_hours:1.5};
  const context={app:{jobs:[],websiteRequests:[request]},remoteClient:null,uid:()=> 'draft',normReg:String,normaliseJobTypeKey:v=>v.toLowerCase(),isRetiredMajorService:()=>false,jobTypeStorageValue:v=>v.join('||'),websiteRequestNote:()=>'',applyWebsiteDefaultService:()=>{},openWebsiteRequestJobCard:(r,j)=>{opened=j},vectaJobIsDeletedForLists:()=>false};
  vm.createContext(context);vm.runInContext(source,context);await context.createJobFromWebsiteRequest('request');
  assert.equal(opened.amount_quoted,want);assert.equal(opened.vat_mode,vat);assert.equal(opened.technician,'Alfie');assert.equal(opened.estimated_hours,1.5);assert.equal(opened.drop_time,'10:00');assert.equal(context.app.jobs.length,0);assert.equal(request.status,undefined);
 }
});
