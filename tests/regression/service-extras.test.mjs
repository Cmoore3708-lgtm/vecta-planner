import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {cleanServiceCosts} from '../../lib/service-pricing.js';
import {servicePriceHandler} from '../../api/service-price.js';
import {bookingServicePrice} from '../../lib/booking-service-price.js';
import {bookingServiceExtra,serviceExtraSnapshot} from '../../lib/service-extras.js';
import {bookingServiceParts} from '../../lib/booking-service-parts.js';
import {verifyServicePrice} from '../../lib/service-price-token.js';
const now=Date.now(),secret='f'.repeat(64);
const request={registration:'TEST123',service:'Major Service',mileage:null,range:'Mid Range'};
const item=(kind,unitNetPence=1000,quantityMilli=1000)=>({kind,unitNetPence,quantityMilli,sku:'TEST-'+kind,brand:'Fixture',description:'Test '+kind,vatBasis:'EX_VAT',inStock:true});
const policy={version:'fixture',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':8000}};
function costs(fuel='diesel'){
 const items=[item('oil',1000,5000),item('oil_filter'),item('air_filter'),item('cabin_filter'),...(fuel==='diesel'?[item('fuel_filter',2000)]:[])];
 return {request,recipeId:'fixture',vehicle:'Test vehicle',fuelType:fuel,oilSpecification:'Test oil',requiredKinds:items.map(i=>i.kind),items,fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date(now).toISOString()};
}
async function offers(raw=costs()){
 const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await servicePriceHandler({now:()=>now,env:{GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_QUOTE_SECRET:secret,GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy)},queue:async()=>({status:'MATCHED',result:raw})})({method:'POST',body:{...request,service:'Full Service',allServices:true}},res);
 assert.equal(res.body.status,'MATCHED');return res.body.quotes.find(q=>q.request.service==='Full Service');
}
function body(quote,choice='replace',kind='fuel_filter'){
 return {registration:request.registration,service_choice:'Full Service',mileage_unknown:true,parts_range:'Mid Range',service_price_token:quote.token,service_extra_kind:kind,service_extra_choice:choice};
}
test('live diesel extra includes configured margin, incremental labour and VAT without leaking costs',async()=>{
 const q=await offers();assert.equal(q.serviceExtra.kind,'fuel_filter');assert.equal(q.serviceExtra.totalPence,6000);
 assert.equal(q.serviceExtra.netPence+q.serviceExtra.vatPence,q.serviceExtra.totalPence);
 assert.equal(verifyServicePrice(q.token,q.request,secret).serviceExtra.totalPence,6000);
 assert.ok(!JSON.stringify(q).includes('unitNetPence'));
});
test('replace includes the extra once; check-first keeps it conditional; none excludes it',async()=>{
 const q=await offers(),base=q.totalPence/100;
 const replace=bookingServicePrice(body(q),['Full Service'],secret);
 assert.equal(replace.approximateCost,base+60);assert.match(replace.snapshot,/Customer requests replacement/);
 assert.equal(replace.quote.items.filter(i=>i.kind==='fuel_filter').length,1);
 const check=bookingServicePrice(body(q,'check'),['Full Service'],secret);
 assert.equal(check.approximateCost,base);assert.match(check.snapshot,/replace only if due/);
 assert.ok(!check.quote.items.some(i=>i.kind==='fuel_filter'));
 assert.equal(bookingServicePrice(body(q,'none'),['Full Service'],secret).approximateCost,base);
 assert.equal(bookingServicePrice(body(q,'replace'),['Full Service','MOT'],secret).approximateCost,base+120);
});
test('changed kind, customer supplied prices and missing plug quotes never invent a price',async()=>{
 const q=await offers();const b={...body(q,'replace','spark_plug'),service_extra_price:1};
 const saved=bookingServicePrice(b,['Full Service'],secret);
 assert.equal(saved.approximateCost,q.totalPence/100);assert.match(saved.snapshot,/confirm the price before fitting/);
 const petrol=await offers(costs('petrol'));assert.equal(petrol.serviceExtra,null);
 assert.equal(bookingServicePrice(body(petrol,'replace','spark_plug'),['Full Service'],secret).approximateCost,petrol.totalPence/100);
});
test('only verified, explicitly counted spark-plug sets produce a live extra',async()=>{
 const raw=costs('petrol');raw.optionalParts=[{...item('spark_plug',1000,4000),fitmentVerified:true,quantityVerified:true}];
 const q=await offers(raw);assert.equal(q.serviceExtra.kind,'spark_plug');assert.equal(q.serviceExtra.items[0].quantityMilli,4000);assert.equal(q.serviceExtra.totalPence,10000);
 for(const patch of [{quantityVerified:false},{fitmentVerified:false},{quantityMilli:4500},{quantityMilli:17000},{unitNetPence:0},{inStock:false},{vatBasis:'UNKNOWN'}]){
  const invalid={...raw,optionalParts:[{...raw.optionalParts[0],...patch}]};
  assert.ok(cleanServiceCosts(invalid,request,now));assert.equal((await offers(invalid)).serviceExtra,null);
 }
 const booked=bookingServicePrice(body(q,'replace','spark_plug'),['Full Service'],secret);
 const parts=bookingServiceParts(booked.quote,[{result:raw}]);
 const plugs=parts.find(p=>p.id.endsWith('spark_plug'));assert.equal(plugs.cost_price,10);assert.equal(plugs.quantity,4);
});
test('no live quote still retains the decision and asks for approval of the price before fitting',()=>{
 const decision=bookingServiceExtra({service_choice:'Full Service',service_extra_kind:'fuel_filter',service_extra_choice:'check'});
 assert.match(serviceExtraSnapshot(decision,null),/replace only if due/);
 assert.match(serviceExtraSnapshot(decision,null),/Obtain price approval before replacement/);
 assert.equal(bookingServiceExtra({service_choice:'Oil & Filter Change',service_extra_choice:'replace'}),null);
 assert.throws(()=>bookingServiceExtra({service_choice:'Full Service',service_extra_choice:'invalid'}));
});
test('approved slim section switches diesel/petrol and ignores a choice from another registration',()=>{
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
 const {document}=parseHTML('<div id="root"></div>');
 const state={form:{job_types:['Service'],service_choice:'Full Service',registration:'TEST123',fuel_registration:'TEST123',fuel_type:'Diesel',service_extra_registration:'TEST123',service_extra_choice:'check',service_extra_kind:'fuel_filter'}};
 const root={state,document,liveServiceQuote:()=>null,render(){}};vm.createContext(root);
 const start=html.indexOf('function serviceExtraKind(){'),end=html.indexOf('function serviceOptionsHtml(){',start);
 vm.runInContext(html.slice(start,end),root);
 document.getElementById('root').innerHTML=root.serviceExtraHtml();
 assert.equal(document.querySelector('h4').textContent,'Fuel filter');
 assert.equal(document.querySelectorAll('select').length,1);assert.equal(document.querySelectorAll('input').length,0);
 assert.match(document.querySelector('.service-extra-price').textContent,/confirm the price before fitting/);
 assert.equal(root.serviceExtraSelection(),'check');
 state.form.fuel_type='Petrol';assert.equal(root.serviceExtraSelection(),'none');
 assert.match(root.serviceExtraHtml(),/Spark plugs/);assert.match(root.serviceExtraHtml(),/replace them/);
 state.form.registration='OTHER123';assert.equal(root.serviceExtraHtml(),'');assert.equal(root.serviceExtraSelection(),'none');
 state.form.registration='TEST123';state.form.fuel_type='Electricity';assert.equal(root.serviceExtraHtml(),'');
 state.form.fuel_type='Diesel';state.form.service_choice='Oil & Filter Change';assert.equal(root.serviceExtraHtml(),'');
});
test('the service picker keeps Interim and Full and places the extra outside the clickable Full button',()=>{
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
 const start=html.indexOf('function serviceOptionsHtml(){'),end=html.indexOf('\nlet tyreGuideState=',start);
 const root={state:{form:{job_types:['Service'],service_choice:'Full Service'}},serviceGuidePrices:()=>({oil:85,full:155}),serviceEngineSize:()=>1600,serviceGuideFallback:()=>true,servicePriceState:{status:'unavailable'},serviceVehicleHtml:()=>'<img alt="Your car">',serviceExtraHtml:()=>'<section data-extra></section>',confirmedEvServiceVehicle:()=>false,liveServiceQuote:()=>null,majorServiceFuelFilterNote:()=>'',servicePriceLabel:()=> '£155'};
 vm.createContext(root);vm.runInContext(html.slice(start,end),root);
 const {document}=parseHTML(root.serviceOptionsHtml());
 assert.equal(document.querySelectorAll('[data-service-choice]').length,2);
 assert.match(document.querySelector('[data-service-choice="Oil & Filter Change"]').textContent,/Interim Service/);
 assert.ok(document.querySelector('.service-full-with-extra>[data-extra]'));
 assert.equal(document.querySelector('[data-extra]').closest('button'),null);
 assert.ok(document.querySelector('img[alt="Your car"]'));
});
