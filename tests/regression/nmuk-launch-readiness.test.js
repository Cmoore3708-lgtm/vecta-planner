import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {pricingVisitor,pricingCookie} from '../../lib/pricing-visitor.js';
import bookingHandler from '../../api/website-booking.js';
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
test('the retired booking email endpoint cannot claim or send queued emails',async()=>{
 const previousFetch=globalThis.fetch,previousSecret=process.env.CRON_SECRET;
 let networkCalls=0;
 process.env.CRON_SECRET='test-cron-secret';
 globalThis.fetch=async()=>{networkCalls++;throw Error('Automatic booking email must not use the network');};
 try{
  const res=response();
  await bookingHandler({method:'GET',query:{receipts:'1'},headers:{authorization:'Bearer test-cron-secret'}},res);
  assert.equal(res.code,200);assert.equal(res.body.sent,0);assert.match(res.body.skipped,/manually/);
  assert.equal(networkCalls,0);
  const unauthorised=response();
  await bookingHandler({method:'GET',query:{receipts:'1'},headers:{}},unauthorised);
  assert.equal(unauthorised.code,401);
 }finally{
  globalThis.fetch=previousFetch;
  if(previousSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previousSecret;
 }
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
