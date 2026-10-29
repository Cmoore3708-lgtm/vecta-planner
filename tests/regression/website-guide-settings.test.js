import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {guidePricesHandler} from '../../lib/website-guide-prices.js';
import {managerSessionCookie} from '../../middleware.js';
import proxy from '../../website/api/service-guide-prices.js';
const prices=globalThis.VectaGuidePrices;
const shared=fs.readFileSync('public/js/vecta-guide-prices.js','utf8');
const editor=fs.readFileSync('public/js/vecta-website-settings.js','utf8');
const booking=fs.readFileSync('website/booking/index.html','utf8');
function environment(){
 const previous={...process.env},fetcher=globalThis.fetch;
 Object.assign(process.env,{VERCEL_ENV:'production',VECTA_MAIN_USER:'manager-test',VECTA_MAIN_PASSWORD:'manager-password',SUPABASE_URL:'https://pricing-test.supabase.co',VITE_SUPABASE_URL:'https://pricing-test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key'});
 delete process.env.VERCEL_PROJECT_NAME;delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
 return ()=>{globalThis.fetch=fetcher;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);};
}
function request(method='GET',body,publicRead=false){return {method,body,query:publicRead?{public:'1'}:{},headers:{host:'workshop.test',authorization:'Basic '+Buffer.from('manager-test:manager-password').toString('base64'),origin:'https://workshop.test','x-vecta-website-settings':'1'}};}
async function run(req){
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await guidePricesHandler(req,res);return res;
}
test('guide table validates money and engine boundaries and preserves the former defaults',()=>{
 assert.equal(prices.priceForCc(1500).full,155);
 for(const [cc,oil] of [[1200,80],[1201,85],[1600,85],[1601,90],[2001,95],[2501,105],[3000,105]])assert.equal(prices.priceForCc(cc).oil,oil);
 assert.equal(prices.priceForCc(3001).individual,true);assert.equal(prices.priceForCc(''),null);
 for(const value of [-1,0,'155',NaN,Infinity,10001,1.234]){
  const rows=prices.defaults();rows[0].full=value;assert.throws(()=>prices.validate(rows));
 }
 assert.throws(()=>prices.validate([]));const wrong=prices.defaults();wrong[1].maxCc=1800;assert.throws(()=>prices.validate(wrong));
});
test('manager save persists the exact guide prices, reload returns them, and stale saves conflict',async()=>{
 const restore=environment();let record=null,writes=0;
 globalThis.fetch=async(url,options={})=>{
  assert.match(url,/pricing-test\.supabase\.co\/rest\/v1\/website_content/);
  assert.equal(options.headers.apikey,'server-only-test-key');
  if(options.method){writes++;record=JSON.parse(options.body);return new Response(JSON.stringify([record]));}
  return new Response(JSON.stringify(record?[record]:[]));
 };
 try{
  let res=await run(request('GET',undefined,true));assert.equal(res.data.prices[1].full,155);assert.equal(res.data.version,0);
  const edited=prices.defaults();edited[1].full=189.5;
  res=await run(request('PUT',{prices:edited,version:0}));assert.equal(res.code,200);assert.equal(res.data.version,1);
  res=await run(request('GET',undefined,true));assert.equal(res.data.prices[1].full,189.5);assert.equal(res.data.version,1);
  assert.deepEqual(Object.keys(res.data).sort(),['prices','savedAt','version']);
  res=await run(request('PUT',{prices:prices.defaults(),version:0}));assert.equal(res.code,409);assert.equal(writes,1);assert.equal(record.published.prices[1].full,189.5);
 }finally{restore();}
});
test('public reads expose prices only; unauthenticated, cross-site and malformed writes cannot reach storage',async()=>{
 const restore=environment();let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected storage request');};
 try{
  let req=request('PUT',{prices:prices.defaults(),version:0});delete req.headers.authorization;
  assert.equal((await run(req)).code,401);
  req=request('PUT',{prices:prices.defaults(),version:0});req.headers.origin='https://other.test';assert.equal((await run(req)).code,403);
  req=request('PUT',{prices:prices.defaults(),version:0});delete req.headers['x-vecta-website-settings'];assert.equal((await run(req)).code,403);
  assert.equal((await run(request('PUT',{prices:[],version:0}))).code,400);
  assert.equal((await run(request('PUT',{prices:prices.defaults(),version:-1}))).code,400);
  assert.equal(calls,0);
  assert.equal((await run(request('GET',undefined,true))).code,503);
 }finally{restore();}
});
test('manager cookie works and a zero-row update is never reported as saved',async()=>{
 const restore=environment();let reads=0;
 try{
  const cookie=await managerSessionCookie({user:'manager-test',password:'manager-password'});
  const req=request('PUT',{prices:prices.defaults(),version:2});delete req.headers.authorization;req.headers.cookie=cookie.split(';')[0];
  globalThis.fetch=async(url,options={})=>{reads++;return new Response(JSON.stringify(options.method?[]:[{published:{prices:prices.defaults()},published_version:2}]));};
  const res=await run(req);assert.equal(res.code,409);assert.equal(reads,2);
 }finally{restore();}
});
test('preview storage stays isolated and separate website previews never read production prices',async()=>{
 const restore=environment();let calls=0;process.env.VERCEL_ENV='preview';process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY='test-service-key';process.env.VECTA_TEST_SUPABASE_URL='https://brqsejjykrubxuofavuu.supabase.co';
 globalThis.fetch=async url=>{calls++;assert.match(url,/brqsejjykrubxuofavuu/);return new Response('[]');};
 try{
  assert.equal((await run(request('GET',undefined,true))).code,200);
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await proxy({method:'GET'},res);assert.equal(res.code,503);assert.equal(calls,1);
 }finally{restore();}
});
test('customer guide prices use saved table while live price labels still use the live quote',async()=>{
 const context={AbortSignal,fetch:async()=>{const rows=prices.defaults();rows[1].full=199;return new Response(JSON.stringify({prices:rows}));}};
 vm.createContext(context);vm.runInContext(shared,context);
 await context.VectaGuidePrices.load();
 context.state={form:{engine_size_manual:''}};context.engineCc=Number;
 for(const name of ['serviceGuidePrices','servicePriceLabel']){
  const start=booking.indexOf('function '+name+'('),end=booking.indexOf('\nfunction ',start+1);vm.runInContext(booking.slice(start,end),context);
 }
 assert.equal(context.serviceGuidePrices(1500).full,199);
 context.liveServiceQuote=()=>({request:{service:'Full Service'},totalPence:25000});
 assert.equal(context.servicePriceLabel('Full Service',context.serviceGuidePrices(1500)),'£250');
});
test('settings editor saves edits, preserves failed edits, and reloads persisted prices',async()=>{
 const {document}=parseHTML(fs.readFileSync('public/website-settings.html','utf8'));
 let record={prices:prices.defaults(),version:0,savedAt:null},fail=false;
 const context={document,AbortSignal,VectaGuidePrices:prices,fetch:async(url,options={})=>{
  if(options.method==='PUT'){if(fail)return new Response(JSON.stringify({error:'Connection lost'}),{status:503});const body=JSON.parse(options.body);record={prices:body.prices,version:record.version+1,savedAt:'2026-10-29T18:00:00Z'};}
  return new Response(JSON.stringify(record));
 }};
 const form=document.getElementById('priceForm');form.reportValidity=()=>true;
 vm.createContext(context);vm.runInContext(editor,context);await new Promise(r=>setImmediate(r));
 const input=()=>document.querySelector('[data-row="1"][data-price="full"]');
 input().value='175';await form.onsubmit({preventDefault(){}});assert.equal(record.prices[1].full,175);
 input().value='185';fail=true;await form.onsubmit({preventDefault(){}});assert.equal(input().value,'185');assert.match(document.getElementById('status').textContent,/Connection lost/);
 fail=false;await document.getElementById('reloadPrices').onclick();assert.equal(input().value,'175');
});
