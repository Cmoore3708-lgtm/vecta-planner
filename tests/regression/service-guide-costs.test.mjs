import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimatedFilter,estimateMissingServiceCosts} from '../../lib/service-guide-costs.js';
import {cleanServiceCosts,cleanServiceQuoteCosts,calculateServicePrice,publicServicePrice} from '../../lib/service-pricing.js';
import {lookupLiveService} from '../../workers/gsf/live-service.mjs';
import {servicePriceHandler} from '../../api/service-price.js';
import {gsfWorkerHandler} from '../../api/gsf-worker.js';
import {bookingServicePrice} from '../../lib/booking-service-price.js';
import {bookingServiceParts} from '../../lib/booking-service-parts.js';
import {readServiceCostSnapshot} from '../../lib/service-price-token.js';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const now=Date.now(),secret='c'.repeat(64);
const request={registration:'CM14KEL',service:'Full Service',mileage:null,range:'Mid Range'};
const item=(kind,price,quantityMilli=1000)=>({kind,sku:'TEST-'+kind,brand:'Fixture',description:kind,quantityMilli,unitNetPence:price,vatBasis:'EX_VAT',inStock:true});
const raw=()=>({request,recipeId:'guide-test',vehicle:'Nissan Qashqai 1.5 (1497cc) Petrol',fuelType:'petrol',oilSpecification:'Fixture oil',requiredKinds:['oil','oil_filter','air_filter','cabin_filter'],items:[item('oil',1000,5100),item('oil_filter',630),estimatedFilter('air_filter'),item('cabin_filter',1410)],guidePrice:true,fitmentVerified:false,scopeVerified:true,oilVerified:true,checkedAt:new Date(now).toISOString()});
const policy={version:'test',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':8000}};
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('only missing filters are estimated; actual costs, oil rounding and markups are retained',()=>{
 const costs=estimateMissingServiceCosts(raw(),request,[],now),price=calculateServicePrice(costs,request,policy,now);
 assert.equal(price.lines.find(x=>x.kind==='air_filter').costNetPence,2378);
 assert.equal(price.lines.find(x=>x.kind==='oil_filter').costNetPence,630);
 assert.equal(price.lines[0].chargedQuantityMilli,6000);
 assert.equal(price.lines[0].sellNetPence,7800);
 const publicPrice=publicServicePrice(price);
 assert.equal(publicPrice.guidePrice,true);assert.equal(publicPrice.priceNotice,'Guide price — includes estimated parts costs.');
 assert.ok(publicPrice.items.find(x=>x.kind==='air_filter').estimated);
 assert.equal(JSON.stringify(publicPrice).includes('unitNetPence'),false);
 assert.throws(()=>cleanServiceCosts(costs,request,now));
 for(const patch of [{oilVerified:false},{scopeVerified:false},{checkedAt:new Date(now-3600000).toISOString()},{request:{...request,registration:'WRONG123'}}])assert.throws(()=>cleanServiceQuoteCosts({...costs,...patch},request,now));
});
function historical(reg,price,age=1000){const r=raw();return {...r,request:{...request,registration:reg},guidePrice:false,fitmentVerified:true,checkedAt:new Date(now-age).toISOString(),items:r.items.map(x=>x.estimated?item(x.kind,price):x)};}
test('recent identical-vehicle costs take priority; estimates and expired history cannot seed estimates',()=>{
 const h=historical('CM14KEL',1800),costs=estimateMissingServiceCosts(raw(),request,[historical('CM14KEL',1900,2000),h],now);
 assert.equal(costs.items[2].unitNetPence,1800);assert.equal(costs.items[2].estimateSource,'SAME_VEHICLE');
 assert.equal(estimateMissingServiceCosts(raw(),request,[raw(),historical('CM14KEL',100,31*86400000)],now).items[2].unitNetPence,2378);
});
test('similar-vehicle upper quartile uses distinct registrations and matching engine/fuel',()=>{
 const history=[historical('TEST001',1000),historical('TEST002',2000),historical('TEST003',3000),historical('TEST004',4000),historical('TEST001',9999,2000)];
 const costs=estimateMissingServiceCosts(raw(),request,history,now);
 assert.equal(costs.items[2].unitNetPence,3000);assert.equal(costs.items[2].estimateSource,'SIMILAR_VEHICLE');
 history[0].vehicle='Nissan Qashqai 2.0 (1998cc) Petrol';history[4].vehicle=history[0].vehicle;history[1].fuelType='diesel';
 assert.equal(estimateMissingServiceCosts(raw(),request,history,now).items[2].estimateSource,'ALLOWANCE');
});
test('worker retains a partial service when air filter is missing, but never guesses oil or vehicle identity',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../fixtures/gsf-service-catalogue.json',import.meta.url),'utf8')).rows.find(x=>x.registration==='FV65JTY');
 const input={...request,registration:'FV65JTY',service:'Full Service'};
 const options={now:()=>now,capture:async(_,reg,category)=>{if(category==='Air Filter')throw Error('REVIEW_REQUIRED');return structuredClone(fixture.categories.find(x=>x.category===category));},readFresh:async(_,s)=>({...item(s.kind,Math.ceil(s.expectedPricePence*1000/s.packQuantityMilli),s.quantityMilli),...(s.kind==='oil'?{packNetPence:s.expectedPricePence,packQuantityMilli:s.packQuantityMilli}:{})})};
 const costs=await lookupLiveService({},input,options);
 assert.equal(costs.guidePrice,true);assert.equal(costs.items.find(x=>x.kind==='air_filter').estimated,true);
 assert.equal(costs.items.find(x=>x.kind==='oil_filter').estimated,undefined);
 const missingCategory=await lookupLiveService({},input,{...options,capture:async(page,reg,category)=>category==='Air Filter'?{status:'CAPTURED_FOR_REVIEW',registration:reg,selectedRegistration:false}:options.capture(page,reg,category)});
 assert.equal(missingCategory.items.find(x=>x.kind==='air_filter').estimated,true);
 const noOil=await lookupLiveService({},input,{...options,readFresh:async(_,s)=>{if(s.kind==='oil')throw Error('REVIEW_REQUIRED');return options.readFresh(_,s);}});
 assert.equal(noOil.partial,true);assert.equal(noOil.oilVerified,false);assert.ok(noOil.items.some(x=>x.kind==='oil_filter'&&!x.estimated));assert.ok(!noOil.items.some(x=>x.kind==='oil'));
 assert.throws(()=>calculateServicePrice(noOil,input,policy,now),/INCOMPLETE/);
 await assert.rejects(lookupLiveService({},input,{...options,capture:async()=>({...fixture.categories[0],registration:'WRONG123'})}));
});
test('authenticated worker → batch API → signed booking preserves guides only for affected services',async()=>{
 const supplierRequest={...request,service:'Major Service'};
 let stored;const queue=async(action,payload)=>{if(action==='complete'){stored=payload.result;return {status:'SAVED'};}return {status:'MATCHED',result:stored};};
 const env={GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy),GSF_SERVICE_QUOTE_SECRET:secret,GSF_WORKER_TOKEN:secret};
 const worker=response();await gsfWorkerHandler({env,queue})({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'complete',id:'12345678-1234-1234-1234-123456789abc',lease:'12345678-1234-1234-1234-123456789abd',request:supplierRequest,status:'MATCHED',result:{...raw(),request:supplierRequest}}},worker);
 assert.equal(worker.body.status,'SAVED');
 const res=response();await servicePriceHandler({env,queue,history:async()=>[],now:()=>now})({method:'POST',body:{...request,allServices:true}},res);
 assert.equal(res.body.status,'MATCHED');
 const full=res.body.quotes.find(x=>x.request.service==='Full Service'),interim=res.body.quotes.find(x=>x.request.service==='Interim Service');
 assert.equal(full.guidePrice,true);assert.equal(interim.guidePrice,undefined);
 const booked=bookingServicePrice({registration:request.registration,service_choice:'Full Service',mileage_unknown:true,service_price_token:full.token},['Full Service'],secret);
 assert.match(booked.snapshot,/Service guide price:/);assert.doesNotMatch(booked.snapshot,/Service price agreed|confirm the final price/);
 const parts=bookingServiceParts(booked.quote,[{result:stored}],secret);
 assert.equal(parts.find(x=>x.description.includes('Estimated air filter')).cost_price,23.78);
 assert.equal(parts.find(x=>x.description.includes('TEST-oil_filter')).cost_price,6.3);
});
test('private cost snapshot retains the actual estimate used, even when the supplier queue has expired',async()=>{
 const source={...raw(),request:{...request,service:'Major Service'}};
 const env={GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy),GSF_SERVICE_QUOTE_SECRET:secret};
 const res=response();await servicePriceHandler({env,queue:async()=>({status:'MATCHED',result:source}),history:async()=>[historical('CM14KEL',1800)],now:()=>now})({method:'POST',body:{...request,allServices:true}},res);
 const quote=res.body.quotes.find(x=>x.request.service==='Full Service');
 const decodedPublic=JSON.parse(Buffer.from(quote.token.split('.')[0],'base64url').toString());
 assert.equal(JSON.stringify(decodedPublic).includes('unitNetPence'),false);
 const parts=bookingServiceParts(quote,[],secret),estimated=parts.find(x=>x.description.startsWith('ESTIMATED COST'));
 assert.equal(estimated.cost_price,18);assert.match(estimated.description,/£18.00 ex VAT/);
 assert.equal(parts.find(x=>x.description.includes('TEST-oil_filter')).cost_price,6.3);
 assert.throws(()=>readServiceCostSnapshot({...quote,request:{...quote.request,registration:'WRONG123'}},secret));
 assert.throws(()=>readServiceCostSnapshot(quote,'d'.repeat(64)));
 // Render and reopen the real owner job-card Parts editor using persisted metadata.
 const html=readFileSync('index.html','utf8'),ctx={decodeURIComponent,encodeURIComponent,uid:()=> 'part-id',esc:v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),jobPartsRangeDisplay:()=>'',select:()=>'',partsStatusFromJob:()=>'',PARTS_STATUS_VALUES:[]};
 vm.createContext(ctx);
 for(const name of ['jobParts','noteWithJobParts','jobPartsEditorHtml']){
  const start=html.indexOf('function '+name+'('),end=html.indexOf('\n',start);
  vm.runInContext(html.slice(start,end),ctx);
 }
 const job={customer_note:ctx.noteWithJobParts('Website booking — Guide price',parts)};
 const reopened=ctx.jobParts(job),{document}=parseHTML(ctx.jobPartsEditorHtml(job));
 assert.equal(reopened.find(x=>x.description.startsWith('ESTIMATED COST')).cost_price,18);
 const row=[...document.querySelectorAll('[data-job-part]')].find(x=>x.querySelector('[data-part-description]').value.startsWith('ESTIMATED COST'));
 assert.equal(row.querySelector('[data-part-cost-price]').value,'18');
 assert.equal(document.querySelectorAll('[data-part-cost-price]').length,4);
});

test('guide update preserves previously verified CM14 KEL oil capacity and binds it to the engine',async()=>{
 const {oilFillEvidence}=await import('../../workers/gsf/oil-capacity.mjs');
 const capture={selectedRegistration:true,registration:'CM14KEL',truncated:false,visibleText:'CM14KEL Clear Nissan Qashqai Hybrid HEV 1.5h 190 e-Power HEV CVT Auto Start/Stop Tekna 1.5 (1497cc) Petrol/Hybrid Electric CVT 5 doors Copy VIN'};
 assert.equal(oilFillEvidence(capture,'CM14KEL').requiredMl,5100);
 assert.equal(oilFillEvidence({...capture,registration:'OTHER123'},'CM14KEL'),null);
 assert.equal(oilFillEvidence({...capture,visibleText:capture.visibleText.replaceAll('1.5','1.3').replace('e-Power','DIG-T')},'CM14KEL'),null);
});

test('5L pack lookup waits for supplier hydration and keeps unavailable prices as pricing-only',async()=>{
 const {chooseServiceOilPack}=await import('../../workers/gsf/oil-pack-choice.mjs');
 const original={kind:'oil',sku:'FIXTURE1L',brand:'Fixture',description:'Fixture oil 0W-30 - 1L',packQuantityMilli:1000,packNetPence:1424,unitNetPence:1424,quantityMilli:8800,vatBasis:'EX_VAT',inStock:true};
 let reads=0,waits=0;
 const page={goto:async()=>{},url:()=> 'https://trade.gsfcarparts.com/partdetails/FIXTURE5L',waitForTimeout:async()=>{waits++;},evaluate:async()=>{if(++reads===1)throw Error('PRODUCT_DETAILS_NOT_OPEN');return {sku:'FIXTURE5L',brand:'Fixture',description:'Fixture oil 0W-30 - 5L',unitNetPence:4995,vatBasis:'EX_VAT',inStock:false,stock:[]};}};
 const oil=await chooseServiceOilPack(page,original);
 assert.equal(reads,2);assert.equal(waits,1);assert.equal(oil.packQuantityMilli,5000);assert.equal(oil.packNetPence,4995);assert.equal(oil.unitNetPence,999);assert.equal(oil.quantityMilli,8800);assert.equal(oil.pricingOnly,true);assert.equal(oil.inStock,false);
});
