import test from 'node:test';
import assert from 'node:assert/strict';
import {servicePriceHandler} from '../../api/service-price.js';
import {bookingServicePrice} from '../../lib/booking-service-price.js';
import {bookingServiceParts} from '../../lib/booking-service-parts.js';
import {workshopAllowances} from '../../lib/workshop-estimate-defaults.js';
import {estimateWorkshopService} from '../../lib/workshop-service-estimate.js';

const secret='a'.repeat(64),now=Date.now();
const policy={version:'test',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Interim Service':3000,'Full Service':6000,'Major Service':10000}};
const input={registration:'H16CKK',service:'Major Service',mileage:null,range:'Mid Range'};
const item=(kind,price)=>({kind,sku:'SKU-'+kind,brand:'Fixture',description:kind,unitNetPence:price,quantityMilli:1000,vatBasis:'EX_VAT',inStock:true});
const sample={request:input,recipeId:'fixture',vehicle:'Test petrol vehicle',fuelType:'petrol',scopeVerified:true,fitmentVerified:true,partial:true,oilVerified:false,checkedAt:new Date(now).toISOString(),requiredKinds:['oil','oil_filter','air_filter','cabin_filter'],items:[item('oil_filter',825),item('air_filter',1350),item('cabin_filter',1900)]};
async function quote(raw,options={}){
 let data;
 const api=servicePriceHandler({now:()=>now,history:async()=>[],queue:async(action,{request})=>{
   assert.equal(action,'enqueue');assert.deepEqual(request,raw.request);return {status:'MATCHED',result:raw};
 },env:{GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_QUOTE_SECRET:secret,GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy)}});
 await api({method:'POST',body:{...input,allServices:true,...options}},{setHeader(){},status(){return this;},json(v){data=v;}});
 return data;
}
test('missing oil keeps verified filters from pricing through a signed website booking',async()=>{
 const result=await quote(sample);assert.equal(result.status,'MATCHED');
 for(const service of ['Interim Service','Full Service']){
  const offer=result.quotes.find(q=>q.request.service===service);
  assert.equal(offer.guidePrice,true);assert.equal(offer.oilSpecification,'');
  const expected=estimateWorkshopService({...input,service},sample,[],policy,now);
  assert.equal(offer.totalPence,expected.totalPence);assert.ok(offer.items.find(i=>i.kind==='oil').serviceAllowance);
  const booked=bookingServicePrice({registration:input.registration,service_choice:service,mileage_unknown:true,service_price_token:offer.token},[service],secret,now);
  assert.match(booked.snapshot,/Confirm grade and fill/);assert.doesNotMatch(booked.snapshot,/Required 1L|charged 1L/);
  const parts=bookingServiceParts(booked.quote,[{result:sample}],secret);
  assert.equal(parts[0].quantity,1);assert.equal(parts[0].cost_price,workshopAllowances.oil/100);
  assert.deepEqual(parts.slice(1).map(i=>i.cost_price),service==='Full Service'?[8.25,13.5,19]:[8.25]);
  assert.ok(!JSON.stringify(offer).includes('unitNetPence'));
 }
});
test('a full-only gap leaves the narrower Interim offer live; changed identity or stale evidence cannot be signed',async()=>{
 const raw={...sample,oilVerified:true,oilSpecification:'Verified oil',items:[{...item('oil',1000),quantityMilli:4200},item('oil_filter',825)]};
 let result=await quote(raw);assert.equal(result.quotes.find(q=>q.request.service==='Full Service').guidePrice,true);
 assert.equal(result.quotes.find(q=>q.request.service==='Interim Service').guidePrice,undefined);
 result=await quote({...raw,checkedAt:new Date(now-600000).toISOString()});assert.equal(result.status,'UNAVAILABLE');
 result=await quote({...raw,scopeVerified:false});assert.equal(result.status,'UNAVAILABLE');
});
test('core-only fallback binds the Full supplier result to only the supported customer packages',async()=>{
 const result=await quote({...sample,request:{...input,service:'Full Service'}},{coreServices:true});
 assert.deepEqual(result.quotes.map(q=>q.request.service),['Oil & Filter Change','Interim Service','Full Service']);
});
