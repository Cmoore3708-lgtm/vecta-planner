import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {servicePriceRequest,cleanServiceCosts,calculateServicePrice,publicServicePrice,pricingPolicy,serviceRequiredKinds} from '../../lib/service-pricing.js';
import {signServicePrice,verifyServicePrice} from '../../lib/service-price-token.js';
import {bookingServicePrice} from '../../lib/booking-service-price.js';
import {servicePriceHandler} from '../../api/service-price.js';
import {gsfWorkerHandler} from '../../api/gsf-worker.js';
import {approvedRecipe,moneyPence,supplierUrl,readProduct,readProductBySku,lookupService} from '../../workers/gsf/supplier.mjs';
import {readProductDialog} from '../../workers/gsf/product-dialog.mjs';
import {comparisonVehicles,compareServices,comparisonMarkdown,comparisonCsv} from '../../workers/gsf/comparison.mjs';

// Synthetic oil cost/quantity for arithmetic tests, NOT verified NU67 VSE service data.
const now=Date.parse('2026-10-24T21:00:00Z'),secret='a'.repeat(64);
const request={registration:'NU67VSE',service:'Full Service',mileage:50000,range:'Mid Range'};
const item=(kind,unitNetPence,quantityMilli=1000)=>({kind,sku:'TEST-'+kind,brand:'Test',description:kind,unitNetPence,quantityMilli,vatBasis:'EX_VAT',inStock:true});
const result=()=>({request,recipeId:'synthetic-test',vehicle:'Nissan Pulsar',fuelType:'petrol',oilSpecification:'SYNTHETIC TEST ONLY',
  requiredKinds:['oil','oil_filter','air_filter','cabin_filter'],items:[item('oil',540,5000),item('oil_filter',494),item('air_filter',1075),item('cabin_filter',1200)],
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
test('default packages do not require mileage; diesel major includes fuel filter and petrol excludes plugs',()=>{
  assert.deepEqual(serviceRequiredKinds('Oil & Filter Change'),['oil','oil_filter']);
  assert.deepEqual(serviceRequiredKinds('Full Service'),['oil','oil_filter','air_filter','cabin_filter']);
  assert.deepEqual(serviceRequiredKinds('Major Service','petrol'),['oil','oil_filter','air_filter','cabin_filter']);
  assert.deepEqual(serviceRequiredKinds('Major Service','diesel'),['oil','oil_filter','air_filter','cabin_filter','fuel_filter']);
  assert.throws(()=>serviceRequiredKinds('Major Service','unknown'),/REVIEW_REQUIRED/);
  const input={...request,service:'Major Service',mileage:null},costs={...result(),request:input};
  assert.ok(calculateServicePrice(costs,input,policy,now).totalPence>0);
  assert.throws(()=>calculateServicePrice({...costs,fuelType:'diesel'},input,policy,now),/INCOMPLETE/);
  const diesel={...costs,fuelType:'diesel',requiredKinds:[...costs.requiredKinds,'fuel_filter'],items:[...costs.items,item('fuel_filter',1000)]};
  assert.ok(calculateServicePrice(diesel,input,policy,now).totalPence>0);
  for(const kind of ['spark_plug','fuel_filter']) {
    assert.throws(()=>calculateServicePrice({...costs,requiredKinds:[...costs.requiredKinds,kind],items:[...costs.items,item(kind,1000)]},input,policy,now),/REVIEW_REQUIRED/);
  }
});
test('Interim is oil/filter only and EV Major is air/cabin only without engine-oil data',()=>{
  assert.deepEqual(serviceRequiredKinds('Interim Service'),['oil','oil_filter']);
  assert.deepEqual(serviceRequiredKinds('EV Major Service'),['air_filter','cabin_filter']);
  const interimRequest={...request,service:'Interim Service',mileage:null};
  const interim={...result(),request:interimRequest,requiredKinds:['oil','oil_filter'],items:result().items.slice(0,2)};
  assert.equal(calculateServicePrice(interim,interimRequest,policy,now).labourNetPence,3000);
  const evRequest={...request,service:'EV Major Service',mileage:null};
  const ev={...result(),request:evRequest,fuelType:'electric',oilSpecification:'',oilVerified:false,requiredKinds:['air_filter','cabin_filter'],items:[item('air_filter',1000),item('cabin_filter',1500)]};
  const clean=cleanServiceCosts(ev,evRequest,now);assert.equal(clean.oilSpecification,'');assert.equal(clean.oilVerified,false);
  assert.throws(()=>calculateServicePrice(ev,evRequest,policy,now),/SETTINGS_REQUIRED/);
  const evPolicy={...policy,labourNetPence:{...policy.labourNetPence,'EV Major Service':9000}}; // Synthetic labour, not an agreed rate.
  assert.equal(calculateServicePrice(ev,evRequest,evPolicy,now).labourNetPence,9000);
  assert.throws(()=>cleanServiceCosts({...ev,fuelType:'petrol'},evRequest,now),/REVIEW_REQUIRED/);
  for(const kind of ['oil','oil_filter','sump_plug'])assert.throws(()=>cleanServiceCosts({...ev,items:[...ev.items,item(kind,1000)],requiredKinds:[...ev.requiredKinds,kind]},evRequest,now),/REVIEW_REQUIRED/);
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
test('oil charges whole litres using the exact pack fraction before penny rounding and markup',()=>{
  const costs=result();costs.items[0]={...costs.items[0],quantityMilli:4500,unitNetPence:600,packNetPence:2999,packQuantityMilli:5000};
  const price=calculateServicePrice(costs,request,{...policy,markupBps:5000},now);
  assert.equal(price.lines[0].quantityMilli,4500);assert.equal(price.lines[0].chargedQuantityMilli,5000);
  assert.equal(price.lines[0].costNetPence,2999); // Synthetic £29.99 / 5L × 5 charged litres.
  assert.equal(price.lines[0].sellNetPence,4499);
  costs.items[0].quantityMilli=6700;
  const seven=calculateServicePrice(costs,request,{...policy,markupBps:5000},now);
  assert.equal(seven.lines[0].chargedQuantityMilli,7000);assert.equal(seven.lines[0].costNetPence,4199);
  assert.equal(seven.lines[0].sellNetPence,6299);
  assert.equal(publicServicePrice(seven).items[0].quantityMilli,6700);
  assert.equal(publicServicePrice(seven).items[0].chargedQuantityMilli,7000);
  costs.items[0].quantityMilli=6000;
  assert.equal(calculateServicePrice(costs,request,policy,now).lines[0].chargedQuantityMilli,6000);
  const safe=JSON.stringify(publicServicePrice(price));
  assert.equal(safe.includes('packNetPence'),false);assert.equal(safe.includes('packQuantityMilli'),false);
  for(const patch of [{packNetPence:undefined},{packQuantityMilli:0},{packQuantityMilli:250001},{unitNetPence:601}]) {
    const broken={...costs,items:costs.items.map((row,i)=>i===0?{...row,...patch}:row)};
    assert.throws(()=>cleanServiceCosts(broken,request,now));
  }
});
test('per-litre oil prices also round the charge quantity up without changing filter quantities',()=>{
  const costs=result();costs.items[0]={...costs.items[0],unitNetPence:600,quantityMilli:6700};
  const price=calculateServicePrice(costs,request,policy,now);
  assert.equal(price.lines[0].costNetPence,4200);assert.equal(price.lines[0].chargedQuantityMilli,7000);
  assert.equal(price.lines[1].chargedQuantityMilli,1000);
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
  assert.match(booking.snapshot,/Required 5L; charged 5L/);
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
const productFixture=readFileSync(new URL('../fixtures/gsf-product-dialog.html',import.meta.url),'utf8');
test('GSF dialog reader extracts account cost and checks VAT without using RRP',()=>{
  const {document}=parseHTML(productFixture),product=readProductDialog(document);
  assert.equal(product.sku,'23.265.00');assert.equal(product.brand,'UFI');
  assert.equal(product.unitNetPence,494);assert.equal(product.costIncVatPence,593);assert.equal(product.vatBasis,'EX_VAT');
  assert.deepEqual(product.stock,[{location:'Boldon',quantity:1},{location:'RDC',quantity:1},{location:'NDC',quantity:406}]);
});
test('GSF dialog reader rejects missing, conflicting or ambiguous commercial data',()=>{
  for(const html of [productFixture.replace('ex vat','inc vat'),productFixture.replace('£5.93','£6.93'),
    productFixture.replace('In stock.','Out of stock.'),productFixture.replace('£4.94','£0.00'),
    productFixture.replace('<div><p>SKU</p><p>23.265.00','<div><p>SKU</p><p>WRONG'),
    productFixture.replace('</h5>','</h5><p>£7.87 ex vat</p>'),productFixture+productFixture]) {
    assert.throws(()=>readProductDialog(parseHTML(html).document));
  }
});
test('GSF full product page uses the same account price checks and rejects unrelated pages',()=>{
  // Same rendered fields observed on /partdetails/UFI23.265.00, without a modal.
  const html=productFixture.replace('<div role="dialog" aria-label="Part Details">','<main>')
    .replace('<h2>Part Details</h2>','').replace(/<\/div>\s*$/,'</main>');
  const pageDoc=(content,path='/partdetails/UFI23.265.00')=>{
    const {document}=parseHTML(content);
    Object.defineProperty(document,'location',{value:new URL('https://trade.gsfcarparts.com'+path)});
    return document;
  };
  assert.equal(readProductDialog(pageDoc(html)).unitNetPence,494);
  assert.throws(()=>readProductDialog(pageDoc(html,'/enhancedSearch/UFI23.265.00')),/PRODUCT_DETAILS_NOT_OPEN/);
  assert.throws(()=>readProductDialog(pageDoc(html+html)),/PRODUCT_DETAILS_NOT_OPEN/);
  for(const broken of [html.replace('£5.93','£8.93'),html.replace('ex vat','inc vat'),html.replace('In stock.','Out of stock.')])
    assert.throws(()=>readProductDialog(pageDoc(broken)));
});
test('approved-SKU worker uses saved fitment evidence and checks the selected product identity',async()=>{
  const calls=[],product=readProductDialog(parseHTML(productFixture).document);
  const locator={count:async()=>1,isVisible:async()=>true,fill:async v=>calls.push(['fill',v]),press:async v=>calls.push(['press',v]),
    click:async()=>calls.push(['click-sku']),waitFor:async()=>{},getByText:()=>locator,getByRole:()=>locator,or:()=>locator};
  const page={goto:async url=>calls.push(['goto',url]),url:()=> 'https://trade.gsfcarparts.com/',getByRole:()=>locator,evaluate:async()=>product};
  const item={kind:'oil_filter',sku:'23.265.00',searchTerm:'UFI23.265.00',brand:'UFI',description:'Oil Filter - Spin-on Filter',quantityMilli:1000,packQuantityMilli:1000};
  const result=await readProductBySku(page,item);assert.equal(result.unitNetPence,494);
  assert.deepEqual(calls,[['goto','https://trade.gsfcarparts.com'],['fill','UFI23.265.00'],['press','Enter'],['click-sku']]);
  const oil=await readProductBySku(page,{...item,kind:'oil',quantityMilli:4500,packQuantityMilli:5000});
  assert.equal(oil.packNetPence,494);assert.equal(oil.packQuantityMilli,5000);
  await assert.rejects(readProductBySku(page,{...item,brand:'WRONG'}),/REVIEW_REQUIRED/);
  assert.throws(()=>approvedRecipe({calibrationApproved:true,lookupMode:'approved-skus',recipes:[{...request,approved:true,reviewedAt:new Date(now).toISOString()}]},request,now),/REVIEW_REQUIRED/);
});
test('the requested trial policy adds 50% to filters and 30% to oil and uses £30/£60/£100 net labour',()=>{
  const trial=JSON.parse(readFileSync(new URL('../../workers/gsf/pricing-policy.example.json',import.meta.url),'utf8'));
  assert.equal(trial.markupBps,5000);assert.equal(trial.oilMarkupBps,3000);assert.deepEqual(trial.labourNetPence,{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':10000});
  const price=calculateServicePrice(result(),request,trial,now);
  assert.equal(price.partsNetPence,7664);assert.equal(price.labourNetPence,6000);assert.equal(price.totalPence,16500);
});
test('ten-car comparison rejects duplicates and missing registrations',()=>{
  const vehicles=Array.from({length:10},(_,i)=>({registration:'DEMO'+String(i).padStart(3,'0'),mileage:50000,range:'Mid Range'}));
  assert.equal(comparisonVehicles({vehicles}).length,10);
  assert.throws(()=>comparisonVehicles({vehicles:vehicles.slice(1)}));
  assert.throws(()=>comparisonVehicles({vehicles:vehicles.map((vehicle,i)=>i===9?vehicles[0]:vehicle)}));
  assert.throws(()=>comparisonVehicles({vehicles:vehicles.map((vehicle,i)=>i===9?{...vehicle,registration:''}:vehicle)}));
});
test('comparison prices all three scopes sequentially and marks missing costs without inventing a total',async()=>{
  const trial=JSON.parse(readFileSync(new URL('../../workers/gsf/pricing-policy.example.json',import.meta.url),'utf8'));
  const vehicles=[{registration:'DEMO000',mileage:50000,range:'Mid Range'},{registration:'DEMO001',mileage:50000,range:'Mid Range'}];
  let active=0,maxActive=0;const calls=[];
  const rows=await compareServices(vehicles,trial,async input=>{
    active++;maxActive=Math.max(maxActive,active);calls.push(input.service);await flush();active--;
    if(input.registration==='DEMO001'&&input.service==='Major Service')throw Error('REVIEW_REQUIRED');
    const data=result();return {...data,request:input,checkedAt:new Date().toISOString()};
  });
  assert.equal(maxActive,1);assert.equal(calls.length,6);
  assert.equal(rows[0].services['Full Service'].totalPence,16500);
  assert.equal(rows[1].services['Major Service'].status,'REVIEW_REQUIRED');
  assert.equal(rows[1].services['Major Service'].totalPence,undefined);
  assert.match(comparisonMarkdown(rows,trial),/Needs verification/);assert.match(comparisonCsv(rows),/165.00/);
  assert.doesNotMatch(comparisonMarkdown(rows,trial),/£0.00/);
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
      const costs={...result(),request:{...servicePriceRequest(input),service:'Major Service',mileage:null},checkedAt:new Date(timestamp).toISOString()};
      const res=response();await servicePriceHandler({env,now:()=>timestamp,queue:async()=>({status:'MATCHED',result:costs})})({method:'POST',body:input},res);
      return {ok:true,json:async()=>res.body};
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
test('failed live lookup restores the existing engine-band guide prices without creating signed quotes',()=>{
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
 const context={state:{form:{service_choice:'Full Service'}},servicePriceState:{status:'unavailable'},liveServiceQuote:()=>null};vm.createContext(context);
 for(const name of ['serviceChoicePrice','serviceGuideFallback','servicePriceLabel']){
  const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);
  vm.runInContext(html.slice(start,end),context);
 }
 const band={oil:85,full:155,major:210};
 for(const [service,price] of [['Oil & Filter Change','£85'],['Full Service','£155'],['Major Service','£210']])assert.equal(context.servicePriceLabel(service,band),price);
 assert.equal(context.serviceGuideFallback(),true);
 context.servicePriceState.status='disabled';assert.equal(context.servicePriceLabel('Full Service',band),'£155');
 context.servicePriceState.status='loading';assert.equal(context.servicePriceLabel('Full Service',band),'Retrieving live prices…');
 assert.match(html,/serviceGuideFallback\(\)&&band&&!band.individual\?'Guide price'/);
 assert.equal(context.liveServiceQuote(),null);
});

// Integration fixture only: deliberately synthetic vehicle, oil and prices.
// Exercises the real service lookup/reader/calculator chain, not a live quote.
test('shared supplier lookup carries exact oil pack cost through whole-litre service pricing',async()=>{
 const input={registration:'TEST123',service:'Interim Service',mileage:null,range:'Mid Range'};
 const current=new Date().toISOString();
 const rows=[{kind:'oil',sku:'TEST-OIL',brand:'TEST',description:'Synthetic oil fixture',quantityMilli:6700,packQuantityMilli:5000},
 {kind:'oil_filter',sku:'23.265.00',searchTerm:'UFI23.265.00',brand:'UFI',description:'Oil Filter - Spin-on Filter',quantityMilli:1000,packQuantityMilli:1000}];
 const recipe={...input,id:'fixture-only',vehicle:'SYNTHETIC VEHICLE',fuelType:'petrol',approved:true,reviewedAt:current,fitmentSource:'fixture only',oilSource:'fixture only',oilSpecification:'SYNTHETIC',requiredKinds:['oil','oil_filter'],items:rows.map(row=>({...row,vatBasis:'EX_VAT',vatEvidence:'fixture'}))};
 let term='',reads=0;
 const locator={count:async()=>1,isVisible:async()=>true,fill:async value=>{term=value;},press:async()=>{},click:async()=>{},waitFor:async()=>{},getByText:()=>locator,getByRole:()=>locator};
 const page={goto:async()=>{},url:()=> 'https://trade.gsfcarparts.com/',getByRole:()=>locator,evaluate:async reader=>{
  reads++;
  const oil=term==='TEST-OIL';
  const html=oil?productFixture.replaceAll('23.265.00','TEST-OIL').replaceAll('UFI','TEST').replaceAll('Oil Filter - Spin-on Filter','Synthetic oil fixture').replaceAll('£4.94','£29.99').replaceAll('£5.93','£35.99'):productFixture;
  return reader(parseHTML(html).document);
 }};
 const costs=await lookupService(page,input,{calibrationApproved:true,lookupMode:'approved-skus',recipes:[recipe]});
 assert.equal(reads,2);assert.equal(costs.items[0].packNetPence,2999);
 const trial=JSON.parse(readFileSync(new URL('../../workers/gsf/pricing-policy.example.json',import.meta.url),'utf8'));
 const price=calculateServicePrice(costs,input,trial);
 assert.equal(price.lines[0].quantityMilli,6700);assert.equal(price.lines[0].chargedQuantityMilli,7000);
 assert.equal(price.lines[0].costNetPence,4199);assert.equal(price.totalPence,11500);
 // Missing oil evidence blocks before the supplier is contacted.
 await assert.rejects(lookupService(page,input,{calibrationApproved:true,lookupMode:'approved-skus',recipes:[{...recipe,oilSource:''}]}),/REVIEW_REQUIRED/);
 assert.equal(reads,2);
});

test('oil markup is validated independently without changing filter markup',()=>{
 const mixed={...policy,markupBps:5000,oilMarkupBps:3000};
 const price=calculateServicePrice(result(),request,mixed,now);
 assert.equal(price.lines[0].sellNetPence,3510);
 assert.equal(price.lines[1].sellNetPence,741);
 for(const bad of [null,-1,30001,'3000'])assert.throws(()=>pricingPolicy({...mixed,oilMarkupBps:bad}));
});

test('observed Pulsar ex-VAT costs reproduce the three manual examples without becoming live evidence',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../../workers/gsf/nu67vse-observed-evidence.json',import.meta.url),'utf8'));
 assert.equal(evidence.approvedForPublication,false);assert.equal(evidence.oilProductSpecificationVerified,false);assert.equal(evidence.workerQuoteVerified,false);
 const trial=JSON.parse(readFileSync(new URL('../../workers/gsf/pricing-policy.example.json',import.meta.url),'utf8'));
 const expected={'Oil & Filter Change':13500,'Full Service':23000,'Major Service':27500};
 for(const [service,total] of Object.entries(expected)) {
  const input={registration:evidence.registration,service,mileage:null,range:'Mid Range'};
  const kinds=serviceRequiredKinds(service,'petrol');
  // Arithmetic replay only. These test flags must never be exported as live evidence.
  const data={request:input,recipeId:'manual-evidence-arithmetic-only',vehicle:evidence.vehicle,fuelType:'petrol',oilSpecification:evidence.preferredOilSpecification,fitmentVerified:true,scopeVerified:true,oilVerified:true,requiredKinds:kinds,checkedAt:new Date(now).toISOString(),items:evidence.items.filter(row=>kinds.includes(row.kind)).map(row=>({...row,unitNetPence:Math.ceil(row.observedPackNetPence*1000/row.packQuantityMilli),...(row.kind==='oil'?{packNetPence:row.observedPackNetPence}:{packQuantityMilli:undefined})}))};
  assert.equal(calculateServicePrice(data,input,trial,now).totalPence,total);
 }
});
test('reviewed direct product URL checks identity and avoids fragile search input naming',async()=>{
 let visits=0;
 const locator={count:async()=>1,isVisible:async()=>true,waitFor:async()=>{},getByRole:()=>locator};
 const page={goto:async()=>{visits++;},url:()=> 'https://trade.gsfcarparts.com/partdetails/UFI23.265.00',getByRole:()=>locator,evaluate:async()=>readProductDialog(parseHTML(productFixture).document)};
 const row={kind:'oil_filter',sku:'23.265.00',brand:'UFI',description:'Oil Filter - Spin-on Filter',quantityMilli:1000,packQuantityMilli:1000,productUrl:'https://trade.gsfcarparts.com/partdetails/UFI23.265.00'};
 assert.equal((await readProductBySku(page,row)).unitNetPence,494);
 await assert.rejects(readProductBySku(page,{...row,sku:'WRONG'}),/REVIEW_REQUIRED/);
 for(const productUrl of ['https://evil.test/partdetails/UFI23.265.00','https://trade.gsfcarparts.com/basket','https://trade.gsfcarparts.com/partdetails/UFI23.265.00?x=1'])await assert.rejects(readProductBySku(page,{...row,productUrl}),/SETTINGS_REQUIRED/);
 assert.equal(visits,2);
});

test('Honda oil evidence remains separate from Pulsar filters and mixed-vehicle prices are withdrawn',()=>{
 const pulsar=JSON.parse(readFileSync(new URL('../../workers/gsf/nu67vse-observed-evidence.json',import.meta.url),'utf8'));
 const honda=JSON.parse(readFileSync(new URL('../../workers/gsf/fv65jty-observed-oil.json',import.meta.url),'utf8'));
 assert.equal(pulsar.registration,'NU67VSE');assert.equal(pulsar.requiredOilQuantityMilli,4300);
 assert.equal(pulsar.replacementOilObservation,undefined);
 assert.equal(honda.registration,'FV65JTY');assert.equal(honda.fuelType,'diesel');assert.equal(honda.displayedOilQuantityMilli,4700);
 assert.equal(honda.observedPackNetPence,5935);assert.equal(honda.approvedForPublication,false);
 assert.equal(honda.provisionalGrossPence,undefined);assert.match(honda.withdrawalReason,/not a valid quote/);
 assert.equal(Math.ceil(honda.displayedOilQuantityMilli/1000),5);
});
