import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueSelection,lookupLiveService} from '../../workers/gsf/live-service.mjs';
import {calculateServicePrice} from '../../lib/service-pricing.js';
import {servicePriceHandler} from '../../api/service-price.js';
import {gsfWorkerHandler} from '../../api/gsf-worker.js';
import {bookingServicePrice} from '../../lib/booking-service-price.js';
import '../../public/js/vecta-service-pricing.js';
const report=JSON.parse(readFileSync(new URL('../fixtures/gsf-service-catalogue.json',import.meta.url),'utf8'));
const policy=JSON.parse(readFileSync(new URL('../../workers/gsf/pricing-policy.example.json',import.meta.url),'utf8'));
const now=Date.now();
function capture(reg,category){return structuredClone(report.rows.find(x=>x.registration===reg).categories.find(x=>x.category===category));}
async function lookup(reg,service){return lookupLiveService({}, {registration:reg,service,mileage:null,range:'Mid Range'}, {now:()=>now,capture:async(_,r,c)=>capture(r,c),readFresh:async(_,s)=>({kind:s.kind,sku:s.searchTerm,brand:'Fixture supplier brand',description:s.description,quantityMilli:s.quantityMilli,unitNetPence:Math.ceil(s.expectedPricePence*1000/s.packQuantityMilli),...(s.kind==='oil'?{packNetPence:s.expectedPricePence,packQuantityMilli:s.packQuantityMilli}:{}),vatBasis:'EX_VAT',inStock:true})});}
test('uploaded PC oil selection binds first pack price to exact registration and original fill',()=>{
 const oil=catalogueSelection(capture('FV65JTY','Engine Oils (Applied)'),'oil','FV65JTY');assert.equal(oil.searchTerm,'COMECOFEP5L');assert.equal(oil.expectedPricePence,5699);assert.equal(oil.quantityMilli,4700);assert.equal(oil.packQuantityMilli,5000);
 for(const mutation of [c=>c.registration='NU67VSE',c=>c.selectedRegistration=false,c=>c.truncated=true,c=>c.visibleText=c.visibleText.replace('£56.99 Gold','£56.99 Silver')]){const c=capture('FV65JTY','Engine Oils (Applied)');mutation(c);assert.throws(()=>catalogueSelection(c,'oil','FV65JTY'));}
});
test('live catalogue requires diesel fuel filter, omits petrol plugs and uses agreed oil/filters/labour/VAT/£5 rule',async()=>{
 const diesel=await lookup('FV65JTY','Major Service');assert.equal(diesel.items.length,5);assert.ok(diesel.items.some(x=>x.kind==='fuel_filter'));const price=calculateServicePrice(diesel,diesel.request,policy,now);assert.equal(price.totalPence,37500);assert.equal(price.netPence+price.vatPence,37500);
 const petrol=await lookup('NU67VSE','Major Service');assert.equal(petrol.items.length,4);assert.ok(!petrol.items.some(x=>['spark_plug','fuel_filter'].includes(x.kind)));assert.equal(calculateServicePrice(petrol,petrol.request,policy,now).totalPence,26000);
});
test('website request → worker relay → signed quote → booking snapshot retains price and oil quantities',async()=>{
 const secret='b'.repeat(64),request={registration:'FV65JTY',service:'Major Service',mileage:null,range:'Mid Range'};
 let state='EMPTY',result;const queue=async(action,payload)=>{
  if(action==='enqueue'){if(state==='EMPTY')state='PENDING';return state==='MATCHED'?{status:'MATCHED',result}:{status:'PENDING'};}
  if(action==='pull'){assert.equal(state,'PENDING');return {status:'JOB',id:'12345678-1234-1234-1234-123456789abc',lease:'12345678-1234-1234-1234-123456789abd',request};}
  assert.equal(action,'complete');assert.deepEqual(payload.request,request);result=payload.result;state='MATCHED';return {status:'SAVED'};
 };
 const env={GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy),GSF_SERVICE_QUOTE_SECRET:secret,GSF_WORKER_TOKEN:secret};
 const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
 const api=servicePriceHandler({env,queue}),worker=gsfWorkerHandler({env,queue});
 let res=response();await api({method:'POST',body:request},res);assert.equal(res.body.status,'PENDING');
 res=response();await worker({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'pull'}},res);const job=res.body;assert.equal(job.status,'JOB');
 const live=await lookup(request.registration,request.service);res=response();await worker({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'complete',id:job.id,lease:job.lease,status:'MATCHED',request,result:live}},res);assert.equal(res.body.status,'SAVED');
 res=response();await api({method:'POST',body:request},res);assert.equal(res.body.status,'MATCHED');const q=res.body.quote;assert.equal(q.totalPence,37500);assert.ok(!JSON.stringify(q).includes('unitNetPence'));
 const body={registration:request.registration,service_choice:request.service,mileage_unknown:true,parts_range:request.range,service_price_token:q.token};
 const booking=bookingServicePrice(body,[request.service],secret);assert.equal(booking.approximateCost,375);assert.match(booking.snapshot,/Required 4.7L; charged 5L/);
 assert.throws(()=>bookingServicePrice({...body,registration:'NU67VSE'},[request.service],secret));
});
test('unimplemented quality grades never become Gold quotes',async()=>{
 for(const range of ['Budget','Premium/Dealer'])await assert.rejects(lookupLiveService({}, {registration:'FV65JTY',service:'Major Service',mileage:null,range},{capture:()=>{throw Error('must not browse');}}),/REVIEW_REQUIRED/);
});
test('selecting Service fetches one Major parts set, displays all packages and switches without another lookup',async()=>{
 const costs=await lookup('FV65JTY','Major Service'),secret='c'.repeat(64);
 let queueCalls=0,fetches=0;
 const api=servicePriceHandler({now:()=>now,env:{GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy),GSF_SERVICE_QUOTE_SECRET:secret},queue:async(action,payload)=>{
  queueCalls++;assert.equal(action,'enqueue');assert.deepEqual(payload.request,costs.request);return {status:'MATCHED',result:costs};
 }});
 const form={registration:'FV65JTY',job_types:['Service'],service_choice:'',mileage:'',parts_range:'Mid Range'};
 let resolve;const matched=new Promise(r=>resolve=r);
 const controller=globalThis.VectaServicePricing.createController({batch:true,getForm:()=>form,now:()=>now,wait:async()=>{},onChange:v=>{if(v.status==='matched')resolve(v);},fetcher:async(url,options)=>{
  fetches++;const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
  await api({method:'POST',body:JSON.parse(options.body)},res);return {ok:res.code===200,json:async()=>res.body};
 }});
 controller.update();await matched;
 for(const [service,total] of [['Oil & Filter Change',15000],['Full Service',25000],['Major Service',37500]]){
  form.service_choice=service;controller.update();const quote=controller.currentQuote();assert.equal(quote.totalPence,total);
  const booking=bookingServicePrice({registration:form.registration,service_choice:service,mileage_unknown:true,parts_range:'Mid Range',service_price_token:quote.token},[service],secret,now);
  assert.equal(booking.approximateCost,total/100);
 }
 assert.equal(fetches,1);assert.equal(queueCalls,1);controller.reset();
});
