import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {servicePriceRequest,cleanServiceCosts,calculateServicePrice,publicServicePrice,pricingPolicy} from '../../lib/service-pricing.js';
import {signServicePrice,verifyServicePrice} from '../../lib/service-price-token.js';
import {bookingServicePrice} from '../../lib/booking-service-price.js';
import {servicePriceHandler} from '../../api/service-price.js';
import {gsfWorkerHandler} from '../../api/gsf-worker.js';
import {approvedRecipe,moneyPence,supplierUrl,readProduct} from '../../workers/gsf/supplier.mjs';

// Synthetic oil cost/quantity for arithmetic tests, NOT verified NU67 VSE service data.
const now=Date.parse('2026-10-24T21:00:00Z'),secret='a'.repeat(64);
const request={registration:'NU67VSE',service:'Full Service',mileage:50000,range:'Mid Range'};
const item=(kind,unitNetPence,quantityMilli=1000)=>({kind,sku:'TEST-'+kind,brand:'Test',description:kind,unitNetPence,quantityMilli,vatBasis:'EX_VAT',inStock:true});
const result=()=>({request,recipeId:'synthetic-test',vehicle:'Nissan Pulsar',oilSpecification:'SYNTHETIC TEST ONLY',
  requiredKinds:['oil','oil_filter','air_filter','cabin_filter'],items:[item('oil',600,4500),item('oil_filter',494),item('air_filter',1075),item('cabin_filter',1200)],
  fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date(now).toISOString()});
const policy={version:'test-1',markupBps:3000,vatBps:2000,roundUpPence:1,
  labourNetPence:{'Oil & Filter Change':3000,'Full Service':5000,'Major Service':6500}};
const env={GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy),GSF_SERVICE_QUOTE_SECRET:secret,GSF_WORKER_TOKEN:secret};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('GSF money parser rejects RRP, multiple prices and ambiguous VAT strings',()=>{
  assert.equal(moneyPence('£4.94'),494);assert.equal(moneyPence('£1,234.56'),123456);
  for(const bad of ['£4.94 RRP £8.00','4.94','£4,94','£0.1'])assert.throws(()=>moneyPence(bad));
  for(const bad of ['http://trade.gsfcarparts.com/product/x','https://evil.test/product/x','https://trade.gsfcarparts.com/basket'])assert.throws(()=>supplierUrl(bad));
});
test('request canonicalisation binds registration, mileage, service and quality',()=>{
  assert.deepEqual(servicePriceRequest({...request,registration:'nu67 vse'}),request);
  for(const patch of [{service:'MOT'},{mileage:-1},{mileage:'50000'},{range:'cheap'},{registration:'<bad>'}])assert.throws(()=>servicePriceRequest({...request,...patch}));
});
test('pricing applies markup to parts, preset net labour and VAT exactly once',()=>{
  const price=calculateServicePrice(result(),request,policy,now);
  assert.equal(price.partsNetPence,7110);assert.equal(price.labourNetPence,5000);
  assert.equal(price.netPence,12110);assert.equal(price.vatPence,2422);assert.equal(price.totalPence,14532);
  assert.equal(price.lines[0].costNetPence,2700);
  const safe=JSON.stringify(publicServicePrice(price));
  for(const privateField of ['unitNetPence','markupBps','costNetPence','labourNetPence'])assert.equal(safe.includes(privateField),false);
});
test('round up the final VAT-inclusive amount and reconcile the VAT breakdown',()=>{
  const price=calculateServicePrice(result(),request,{...policy,roundUpPence:500},now);
  assert.equal(price.totalPence,15000);assert.equal(price.netPence+price.vatPence,15000);
  assert.equal(price.netPence,price.partsNetPence+price.labourNetPence+price.roundingNetPence);
});
test('unknown VAT, missing oil, unverified fitment and stale costs cannot become prices',()=>{
  for(const patch of [{fitmentVerified:false},{scopeVerified:false},{oilVerified:false},{checkedAt:'2020-01-01'},
    {items:result().items.filter(row=>row.kind!=='oil')},{items:result().items.map(row=>({...row,vatBasis:'UNKNOWN'}))},
    {items:result().items.map(row=>({...row,inStock:false}))},{items:[...result().items,item('oil',999)]}])assert.throws(()=>cleanServiceCosts({...result(),...patch},request,now));
  assert.throws(()=>cleanServiceCosts(result(),{...request,registration:'CM14KEL'},now));
  assert.throws(()=>pricingPolicy({...policy,markupBps:null}));
  assert.throws(()=>pricingPolicy({...policy,labourNetPence:{}}));
});
test('customer quote resists tampering, expiry and changes to the selected service',()=>{
  const price=publicServicePrice(calculateServicePrice(result(),request,policy,now));
  const quote=signServicePrice(price,secret,now);
  assert.equal(verifyServicePrice(quote.token,request,secret,now).totalPence,14532);
  assert.throws(()=>verifyServicePrice(quote.token+'x',request,secret,now));
  assert.throws(()=>verifyServicePrice(quote.token,{...request,range:'Budget'},secret,now));
  assert.throws(()=>verifyServicePrice(quote.token,request,secret,now+1800000));
});
test('booking saves the signed price and parts, keeps MOT discount and rejects altered mileage',()=>{
  const liveNow=Date.now(),data={...result(),checkedAt:new Date(liveNow).toISOString()};
  const quote=signServicePrice(publicServicePrice(calculateServicePrice(data,request,policy,liveNow)),secret,liveNow);
  const body={registration:request.registration,service_choice:request.service,mileage:'50000',parts_range:request.range,service_price_token:quote.token};
  const booking=bookingServicePrice(body,['Full Service','MOT'],secret);
  assert.equal(booking.approximateCost,205.32);assert.match(booking.snapshot,/145.32 including VAT/);assert.match(booking.snapshot,/TEST-oil_filter/);
  assert.throws(()=>bookingServicePrice({...body,mileage:'60000'},['Full Service'],secret));
  assert.equal(bookingServicePrice({},['MOT']),null);
});
test('public API is disabled by default and never accepts customer cost/markup overrides',async()=>{
  const disabled=response();await servicePriceHandler({env:{},queue:()=>assert.fail('queue called')})({method:'POST'},disabled);
  assert.equal(disabled.body.status,'DISABLED');
  let input;const res=response();await servicePriceHandler({env,now:()=>now,queue:async(action,payload)=>{input=payload;return {status:'MATCHED',result:result()};}})({method:'POST',body:{...request,markupBps:0,unitNetPence:0}},res);
  assert.equal(res.body.quote.totalPence,14532);assert.equal(input.request.markupBps,undefined);assert.equal(input.actor.length,64);
  assert.equal(JSON.stringify(res.body).includes('unitNetPence'),false);
});
test('a signed price remains usable without a supplier or database round trip',async()=>{
  const quote=signServicePrice(publicServicePrice(calculateServicePrice(result(),request,policy,now)),secret,now);
  const res=response();await servicePriceHandler({env,now:()=>now,queue:()=>assert.fail('queue called')})({method:'POST',body:{...request,quoteToken:quote.token}},res);
  assert.equal(res.body.quote.token,quote.token);
});
test('worker route rejects unauthorized and malformed completions before database access',async()=>{
  let calls=0;const handler=gsfWorkerHandler({env,queue:async()=>{calls++;return {status:'IDLE'};}});
  for(const authorization of ['', 'Bearer wrong','Bearer '+'é'.repeat(64)]){const res=response();await handler({method:'POST',headers:{authorization},body:{action:'pull'}},res);assert.equal(res.code,401);}
  const malformed=response();await handler({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'complete'}},malformed);assert.equal(malformed.code,400);assert.equal(calls,0);
  const ok=response();await handler({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'pull'}},ok);assert.equal(ok.body.status,'IDLE');assert.equal(calls,1);
});
test('uncalibrated, expired or unknown vehicle recipes require review',()=>{
  assert.throws(()=>approvedRecipe({calibrationApproved:false},request,now),/SETTINGS_REQUIRED/);
  assert.throws(()=>approvedRecipe({calibrationApproved:true,recipes:[]},request,now),/REVIEW_REQUIRED/);
  assert.throws(()=>approvedRecipe({calibrationApproved:true,recipes:[{...request,approved:true,reviewedAt:'2020-01-01'}]},request,now),/REVIEW_REQUIRED/);
});
test('supplier reader binds the selected SKU, live ex-VAT flag and account price',async()=>{
  const product={kind:'oil_filter',sku:'UFI23.265.00',brand:'UFI',description:'Oil filter',quantityMilli:1000,packQuantityMilli:1000,
    url:'https://trade.gsfcarparts.com/product/test-fixture',rootCss:'.product',skuCss:'.sku',priceCss:'.price',stockCss:'.stock',vatBasisCss:'.vat'};
  let values={'.sku':'SKU: UFI23.265.00','.price':'£4.94','.stock':'In stock.','.vat':'Ex VAT'};
  const locator=selector=>({count:async()=>1,isVisible:async()=>true,waitFor:async()=>{},innerText:async()=>values[selector],locator});
  const visited=[],page={goto:async url=>visited.push(url),url:()=>product.url,locator};
  const row=await readProduct(page,product);assert.equal(row.unitNetPence,494);assert.equal(row.sku,product.sku);
  values['.vat']='Inc VAT';await assert.rejects(readProduct(page,product),/SETTINGS_REQUIRED/);
  values['.vat']='Ex VAT';values['.sku']='SKU: WRONG';await assert.rejects(readProduct(page,product),/REVIEW_REQUIRED/);
  values['.sku']='SKU: UFI23.265.00';values['.price']='£4.94 RRP £9.00';await assert.rejects(readProduct(page,product),/SETTINGS_REQUIRED/);
  assert.ok(visited.every(url=>url===product.url));
});
function controller(fetcher,form,wait=async()=>{}){
  const context={fetch:fetcher,AbortController,AbortSignal,setTimeout:()=>1,clearTimeout,Date};vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../public/js/vecta-service-pricing.js',import.meta.url),'utf8'),context);
  const states=[],api=context.VectaServicePricing.createController({getForm:()=>form,onChange:state=>states.push(state),fetcher,wait,now:()=>now});
  return {api,states};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('website ignores a late response for a vehicle or service that changed',async()=>{
  const form={...request,job_types:['Service'],service_choice:request.service,parts_range:request.range};let finish;
  const {api,states}=controller(()=>new Promise(resolve=>finish=resolve),form);
  api.update();await flush();form.registration='CM14KEL';api.update();
  finish({ok:true,json:async()=>({status:'MATCHED',quote:{request,totalPence:14532,token:'signed',expiresAt:now+60000}})});
  await flush();assert.equal(api.currentQuote(),null);assert.equal(states.some(state=>state.status==='matched'),false);api.reset();
});
test('website polls pending work, accepts only matching prices and retains guide on offline',async()=>{
  const form={registration:request.registration,job_types:['Service'],service_choice:request.service,mileage:50000,parts_range:request.range};
  const responses=[{status:'PENDING'},{status:'MATCHED',quote:{request,totalPence:14532,token:'signed',expiresAt:now+60000}}];
  const {api,states}=controller(async()=>({ok:true,json:async()=>responses.shift()}),form);
  api.update();await flush();assert.equal(api.currentQuote().totalPence,14532);assert.equal(states.at(-1).status,'matched');api.reset();
  const offline=controller(async()=>({ok:true,json:async()=>({status:'OFFLINE'})}),form);offline.api.update();await flush();assert.equal(offline.states.at(-1).status,'unavailable');assert.equal(offline.api.currentQuote(),null);
});
test('booking page scripts parse and service pricing is loaded before the booking code',()=>{
  const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
  const {document}=parseHTML(html);for(const script of document.querySelectorAll('script:not([src])'))if(script.textContent.trim())new vm.Script(script.textContent);
  assert.ok(html.indexOf('vecta-service-pricing.js')<html.indexOf('const servicePricing='));
  assert.match(html,/service_price_token:liveServiceQuote\(\)\?\.token/);
});
test('actual website shows a matched service price and submits its signed snapshot',async()=>{
  const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8'),{document}=parseHTML(html),writes=[];
  const root={document,URL,URLSearchParams,location:{search:''},AbortController,AbortSignal,console,setTimeout,clearTimeout,setInterval,clearInterval,alert(){},crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'}};
  root.window=root;
  root.fetch=async(url,options)=>{
    if(url==='/api/service-price'){
      const input=JSON.parse(options.body),timestamp=Date.now();
      const costs={...result(),request:input,checkedAt:new Date(timestamp).toISOString()};
      return {ok:true,json:async()=>({status:'MATCHED',quote:signServicePrice(publicServicePrice(calculateServicePrice(costs,input,policy,timestamp)),secret,timestamp)})};
    }
    if(url==='/api/website-booking'){writes.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,request_id:'receipt'})};}
    return {ok:true,json:async()=>({})};
  };
  vm.createContext(root);
  for(const file of ['vecta-tyre-booking.js','vecta-haynes-booking.js','vecta-vehicle-image.js','vecta-service-pricing.js'])vm.runInContext(readFileSync(new URL('../../public/js/'+file,import.meta.url),'utf8'),root);
  const create=root.VectaServicePricing.createController;root.VectaServicePricing.createController=options=>create({...options,wait:async()=>{}});
  for(const script of document.querySelectorAll('script:not([src])'))if(script.textContent.trim())vm.runInContext(script.textContent,root);
  vm.runInContext("state.step=2;state.form.registration='NU67VSE';state.form.vehicle='Nissan Pulsar';state.form.job_types=['Service'];state.form.service_choice='Full Service';state.form.mileage='50000';state.form.parts_range='Mid Range';state.form.engine_size_manual='1600';render();",root);
  await flush();await flush();
  assert.equal(vm.runInContext('estimateCost()',root),145.32);
  assert.match(document.querySelector('.service-option.selected').textContent,/Price including VAT£145.32/);
  assert.match(document.querySelector('.guide-price-card').textContent,/VEHICLE PRICE/);
  vm.runInContext("state.step=5;state.form.customer_name='Test';state.form.phone='Test';state.form.email='test@example.test';state.form.work_required='Full Service';render()",root);
  await document.querySelector('#send').onclick();assert.ok(writes[0].service_price_token);
  assert.equal(writes[0].approximate_cost,145.32);assert.equal(verifyServicePrice(writes[0].service_price_token,request,secret).totalPence,14532);
  assert.ok(document.querySelector('.success'));
});
