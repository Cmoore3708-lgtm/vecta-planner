import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import '../../public/js/vecta-service-pricing.js';
import {createPricingCache} from '../../lib/haynes-pricing-cache.js';
import pricingProxy from '../../lib/haynes-pricing-proxy.js';
const pricing=globalThis.VectaServicePricing;
const fixtures=JSON.parse(fs.readFileSync(process.env.VECTA_PRICING_VEHICLES_FIXTURE||'tests/fixtures/service-pricing-vehicles.json','utf8')).vehicles;
const html=fs.readFileSync('website/booking/index.html','utf8');
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const token='a'.repeat(64);
function cacheFor(rows,{authorised=true}={}){
 const calls=[];
 const handler=createPricingCache({env:key=>({SUPABASE_URL:'https://brqsejjykrubxuofavuu.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-key'})[key],fetcher:async(url,options)=>{
  calls.push({url,options});
  return response(url.includes('haynes_relay_worker')?(authorised?[{id:1}]:[]):rows);
 }});
 return {calls,handler};
}
const cacheRequest=identity=>new Request('https://cache.example/',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(identity)});
async function booking(fixture,{latePrice=null,asset=true}={}){
 const {document}=parseHTML(html),writes=[];let oilRequest=null;
 const root={document,URL,URLSearchParams,AbortController,AbortSignal,console,setTimeout,clearTimeout,setInterval,clearInterval,location:{search:''},alert(){},crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'}};
 root.window=root;
 const cache=cacheFor(fixture.result?[{result:fixture.result}]:[]);
 root.fetch=async(url,options)=>{
  if(url.startsWith('/api/vehicle-lookup'))return {ok:true,json:async()=>fixture.mot};
  if(url.startsWith('/api/haynes-vehicle'))return {ok:true,json:async()=>fixture.identity?{status:'MATCHED',vehicle:fixture.identity}:{status:'UNAVAILABLE'}};
  if(url.startsWith('/api/haynes-pricing')){
   if(latePrice)await latePrice;
   const q=new URL(url,'https://booking.example').searchParams;
   oilRequest=cache.handler(cacheRequest({registration:q.get('reg'),typeId:q.get('typeId'),engineCode:q.get('engineCode')}));const data=await (await oilRequest).json();return {ok:true,json:async()=>data};
  }
  if(url==='/api/website-booking'){writes.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({ok:true,request_id:'test',confirmed:false})};}
  return {ok:true,status:200,json:async()=>({})};
 };
 vm.createContext(root);
 for(const file of ['public/js/vecta-booking-transfer.js','public/js/vecta-haynes-booking.js','public/js/vecta-vehicle-image.js',...(asset?['public/js/vecta-service-pricing.js']:[])])vm.runInContext(fs.readFileSync(file,'utf8'),root);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1])vm.runInContext(m[1],root);
 await new Promise(r=>setImmediate(r));
 await vm.runInContext(`state.form.registration=${JSON.stringify(fixture.registration)};lookup(state.form.registration)`,root);
 await new Promise(r=>setImmediate(r));if(oilRequest)await oilRequest;await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 root.VectaBookingTransfer.close();
 vm.runInContext("state.step=2;state.form.job_types=['Service'];state.form.nevos_vehicle='no';render()",root);
 return {root,document,writes,cache,run:code=>vm.runInContext(code,root)};
}
for(const [i,f] of fixtures.entries())test(`vehicle fixture ${i+1}: ${f.mot.vehicle} uses ${f.expectedSource} through selection, review and submission`,async()=>{
 const b=await booking(f);
 const band=b.run('serviceGuidePrices(serviceEngineSize())');
 assert.deepEqual([band.oil,band.full,band.major],f.expected);
 assert.equal(band.source||'engine-size',f.expectedSource);
 assert.equal(b.document.querySelectorAll('[data-service-choice]').length,3);
 const choices=['Oil & Filter Change','Full Service','Major Service'];
 for(const [n,choice] of choices.entries()){
  b.document.querySelector(`[data-service-choice="${choice}"]`).onclick();
  assert.equal(b.run('estimateCost()'),f.expected[n]);
  assert.match(b.document.querySelector('.service-option.selected .price').textContent,new RegExp(String(f.expected[n]).replace('.','\\.')));
 }
 b.run("state.form.parts_range='Mid Range';state.form.customer_name='Test';state.form.phone='000';state.form.email='test@example.invalid';state.form.job_types=['Service','MOT'];state.step=5;render()");
 assert.equal(b.run('estimateCost()'),f.expected[2]+60,'MOT remains £65 and combined discount remains £5');
 assert.match(b.run('pricingHtml()'),/VAT/);
 await b.run('submit()');
 assert.equal(b.writes.length,1);assert.equal(b.writes[0].approximate_cost,f.expected[2]+60);
 assert.ok(b.cache.calls.every(c=>!c.options.method||c.options.method==='GET'),'cache cannot change records or enqueue work');
});
test('agreed VAT-inclusive petrol and diesel examples, decimals and invalid inputs',()=>{
 assert.deepEqual([pricing.prices(5,'Petrol').oil,pricing.prices(5,'Petrol').full,pricing.prices(5,'Petrol').major],[90,165,250]);
 assert.equal(pricing.prices(5,'Diesel').major,215);
 assert.equal(pricing.prices(3.75,'Petrol/Electric').major,240);
 for(const litres of [null,'5',NaN,Infinity,0,-1,16])assert.equal(pricing.prices(litres,'Petrol'),null);
 for(const fuel of ['', 'Hybrid Electric (Clean)','Electric','Petrol/Diesel'])assert.equal(pricing.prices(5,fuel),null);
});
test('petrol Major displays and submits spark-plug formula',async()=>{
 const f=structuredClone(fixtures[5]);f.result={source:'HaynesPro',vehicle:f.identity,oil:[{capacity:'Engine sump, including filter 3.25 (l)'}]};
 const b=await booking(f);assert.equal(b.run('serviceGuidePrices(serviceEngineSize()).major'),235);
 b.document.querySelector('[data-service-choice="Major Service"]').onclick();
 b.run("state.form.parts_range='Mid Range';state.step=5;render()");await b.run('submit()');assert.equal(b.writes[0].approximate_cost,235);
});
test('strict service refill parser rejects ranges, missing rows, dry fills and conflicting variants',()=>{
 const row=capacity=>({capacity});
 assert.equal(pricing.oilQuantity([row('Engine sump, including filter 4,6 (l)')]),4.6);
 assert.equal(pricing.oilQuantity([row('Engine sump, including filter 4.6 (l)'),row('Engine sump, including filter 4.6 (l)')]),4.6);
 for(const oil of [null,[],[row('')],[row('Engine sump 4.6 (l)')],[row('Gearbox 6 (l)')],[row('Engine sump, including filter 4–5 (l)')],[row('Engine sump, including filter 5 (l) dry fill')],[row('Engine sump, including filter 4 (l)'),row('Engine sump, including filter 5 (l)')]])assert.equal(pricing.oilQuantity(oil),null);
});
test('late oil data cannot change a selected service price; registration changes clear it',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve);
 const b=await booking(fixtures[0],{latePrice:wait});
 b.document.querySelector('[data-service-choice="Full Service"]').onclick();assert.equal(b.run('estimateCost()'),155);
 release();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(b.run('estimateCost()'),155);
 b.run("state.form.registration='BB22BBB';scheduleLookup();clearTimeout(state.timer)");assert.equal(b.run('servicePriceLock'),null);assert.equal(b.run('haynesOilPrice'),null);assert.equal(b.run('state.form.fuel_type'),'');
});
test('missing optional pricing asset preserves booking and engine-size fallback',async()=>{
 const b=await booking(fixtures[0],{asset:false});assert.equal(b.run('serviceGuidePrices(serviceEngineSize()).full'),155);
 assert.equal(b.document.querySelectorAll('[data-service-choice]').length,3);
});
test('timeout, malformed response, network errors and mismatched identity all fail to fallback',async()=>{
 const v=fixtures[0].identity;
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Promise(()=>{}),async()=>({ok:true,json:async()=>{throw Error('bad JSON')}}),async()=>({ok:true,json:async()=>({status:'MATCHED',source:'HaynesPro',...v,registration:'BB22BBB',oilLitres:5})})]){
  let value='initial';const c=pricing.createController({onChange:x=>value=x,fetcher,timeout:5});await c.lookup(v);assert.equal(value,null);
 }
 let release;let value;const c=pricing.createController({onChange:x=>value=x,fetcher:()=>new Promise(resolve=>release=resolve),timeout:100});const pending=c.lookup(v);await new Promise(r=>setImmediate(r));c.reset();release({ok:true,json:async()=>({status:'MATCHED',source:'HaynesPro',...v,oilLitres:5})});await pending;assert.equal(value,null);
});
test('cache authenticates caller, bounds requests and returns only oil and identity',async()=>{
 const c=cacheFor([{result:fixtures[0].result}]);const v=fixtures[0].identity;
 const good=await (await c.handler(cacheRequest(v))).json();assert.deepEqual(Object.keys(good).sort(),['status','registration','typeId','engineCode','oilLitres','source'].sort());
 assert.equal(good.oilLitres,pricing.oilQuantity(fixtures[0].result.oil));
 assert.equal((await cacheFor([],{authorised:false}).handler(cacheRequest(v))).status,401);
 assert.equal((await c.handler(new Request('https://cache.example/'))).status,405);
 assert.equal((await c.handler(cacheRequest({...v,typeId:'invalid'}))).status,400);
 assert.equal((await c.handler(cacheRequest({...v,padding:'x'.repeat(1100)}))).status,413);
 assert.equal((await (await c.handler(cacheRequest({...v,engineCode:'wrong'}))).json()).status,'UNAVAILABLE');
});
test('public proxy keeps credentials server-side and validates cache responses',async()=>{
 const previous={fetch:globalThis.fetch,environment:process.env.VERCEL_ENV,token:process.env.HAYNES_RELAY_SITE_TOKEN};
 try{
  process.env.VERCEL_ENV='preview';process.env.HAYNES_RELAY_SITE_TOKEN=token;
  const v=fixtures[0].identity;let seen;
  globalThis.fetch=async(url,options)=>{seen={url,options};return response({status:'MATCHED',source:'HaynesPro',...v,oilLitres:4.6,secret:'must not escape'});};
  const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await pricingProxy({method:'GET',query:{reg:v.registration,typeId:v.typeId,engineCode:v.engineCode}},res);
  assert.equal(res.body.oilLitres,4.6);assert.equal(res.body.secret,undefined);assert.equal(seen.options.headers.Authorization,'Bearer '+token);assert.ok(!JSON.stringify(res.body).includes(token));
  globalThis.fetch=async()=>response({status:'MATCHED',source:'HaynesPro',...v,oilLitres:'4.6'});
  await pricingProxy({method:'GET',query:{reg:v.registration,typeId:v.typeId,engineCode:v.engineCode}},res);assert.equal(res.body.status,'UNAVAILABLE');
 }finally{globalThis.fetch=previous.fetch;for(const [key,value] of [['VERCEL_ENV',previous.environment],['HAYNES_RELAY_SITE_TOKEN',previous.token]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('both deployments ship the same pricing module and routes',()=>{
 assert.equal(fs.readFileSync('public/js/vecta-service-pricing.js','utf8'),fs.readFileSync('website/js/vecta-service-pricing.js','utf8'));
 assert.equal(fs.readFileSync('public/booking.html','utf8'),html);
 assert.match(html,/src="\/js\/vecta-service-pricing.js"/);
 for(const p of ['vercel.json','website/vercel.json'])assert.ok(JSON.parse(fs.readFileSync(p)).rewrites.some(r=>r.source==='/api/haynes-pricing'));
});

test('service prices round upwards to £5 without increasing exact multiples',()=>{
 assert.deepEqual([pricing.prices(4.6,'Diesel').oil,pricing.prices(4.6,'Diesel').full,pricing.prices(4.6,'Diesel').major],[90,165,215]);
 assert.deepEqual([pricing.prices(6.5,'Diesel').oil,pricing.prices(6.5,'Diesel').full,pricing.prices(6.5,'Diesel').major],[105,180,230]);
 assert.equal(pricing.prices(4.001,'Diesel').oil,85);
 assert.equal(pricing.prices(4,'Diesel').oil,80);
});
