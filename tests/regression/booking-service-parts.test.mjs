import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingServiceParts} from '../../lib/booking-service-parts.js';
import {publicServicePrice,calculateServicePrice} from '../../lib/service-pricing.js';
import {signServicePrice} from '../../lib/service-price-token.js';
import handler from '../../api/website-booking.js';
const now=Date.now(),secret='d'.repeat(64);
const request={registration:'TEST123',service:'Oil & Filter Change',mileage:null,range:'Mid Range'};
const costs={request,recipeId:'fixture',vehicle:'Test vehicle',fuelType:'petrol',oilSpecification:'Test only',requiredKinds:['oil','oil_filter'],fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date(now).toISOString(),items:[
 {kind:'oil',sku:'TEST5L',brand:'Test',description:'Test oil 5L',quantityMilli:6700,unitNetPence:869,packNetPence:4341,packQuantityMilli:5000,vatBasis:'EX_VAT',inStock:true},
 {kind:'oil_filter',sku:'TESTFILTER',brand:'Test',description:'Oil filter',quantityMilli:1000,unitNetPence:494,vatBasis:'EX_VAT',inStock:true}]};
const policy={version:'fixture',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':10000}};
const quote=signServicePrice(publicServicePrice(calculateServicePrice(costs,request,policy,now)),secret,now);
test('parts use actual ex-VAT purchase prices, selected scope and oil pack sizes',()=>{
 const rows=bookingServiceParts(quote,[{result:costs}]);
 assert.equal(rows[0].cost_price,43.41);assert.equal(rows[0].quantity,2);assert.match(rows[0].description,/Fill 6.7L; priced 7L/);
 assert.equal(rows[1].cost_price,4.94);assert.equal(rows[1].ordered,false);
 const unrelated={...costs,request:{...request,registration:'OTHER123'}};
 assert.ok(bookingServiceParts(quote,[{result:unrelated}]).every(x=>x.cost_price===null));
 assert.ok(!JSON.stringify(quote).includes('unitNetPence'));
});
test('booking saves private GSF costs from the server result and ignores customer-supplied costs',async()=>{
 const oldEnv={...process.env},oldFetch=globalThis.fetch;let saved;
 Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'parts-test',VERCEL_PROJECT_PRODUCTION_URL:'parts-test.invalid',VITE_SUPABASE_URL:'https://parts-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test',GSF_SERVICE_QUOTE_SECRET:secret});
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);let result=[];
  if(u.pathname.endsWith('/gsf_service_jobs')){assert.equal(u.searchParams.get('result->>checkedAt'),'eq.'+costs.checkedAt);result=[{result:costs}];}
  if(u.pathname.endsWith('/website_booking_requests')&&options.method==='POST'){saved=JSON.parse(options.body);result=[saved];}
  return {ok:true,status:200,json:async()=>result};
 };
 try{
  const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',body:{request_id:'12345678-1234-4123-8123-123456789abc',customer_name:'Test',email:'test@example.invalid',phone:'000',registration:request.registration,vehicle:'Test',work_required:'Oil change',job_types:[request.service],service_choice:request.service,mileage_unknown:true,parts_range:'Mid Range',appointment_date:'2050-01-04',service_price_token:quote.token,gsf_parts:[{cost_price:0.01}]}},res);
  assert.equal(res.code,201);assert.equal(saved.gsf_parts[1].cost_price,4.94);assert.equal(saved.approximate_cost,quote.totalPence/100);
  assert.ok(!JSON.stringify(res.body).includes('cost_price'));
 }finally{globalThis.fetch=oldFetch;process.env=oldEnv;}
});
