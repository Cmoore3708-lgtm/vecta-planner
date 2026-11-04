import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {readServiceKit,captureServiceKit,readKitProduct} from '../../workers/gsf/service-kit.mjs';
import {lookupLiveService} from '../../workers/gsf/live-service.mjs';

// Reconstructed from the photographed kit's visible columns; this fixture is
// not a claim that the live supplier DOM has been captured and calibrated.
const row=(description,sku,price='45.10',quantity=1)=>`<article><img alt="Part"><p>${description}</p><div><img alt="Brand"><p>${sku}</p><button>Change Brand</button></div><label>Quantity<input value="${quantity}"></label><span>5</span><span>Boldon</span><div><p>£${price}</p><p>RRP: £103.36</p></div></article>`;
const kitDoc=body=>parseHTML('<main><h1>Quick Kit - Service Kit</h1>'+body+'</main>').document;
const oilRow=()=>row('5L - DriveTec Fo Fully Synthetic Motor Oil 0w-20 - 5l','DRODT0205FO');
const filterRow=()=>row('FRAM Oil Filter - Insert','FRACH11442ECO','8.37');
const request={registration:'H16CKK',service:'Full Service',range:'Mid Range',mileage:null};
test('kit reads each unit cost separately from RRP and treats the oil bottle as a pack',()=>{
 const result=readServiceKit(kitDoc(oilRow()+filterRow()));
 assert.equal(result.status,'CAPTURED_FOR_REVIEW');assert.equal(result.items.length,2);
 assert.deepEqual(result.items.map(x=>[x.kind,x.expectedPricePence,x.packQuantityMilli]),[['oil',4510,5000],['oil_filter',837,1000]]);
 assert.equal(result.items[0].quantityMilli,undefined,'a 5L bottle does not establish engine capacity');
});
test('ambiguous kit prices, altered quantities, duplicate categories and hidden cards cannot become costs',()=>{
 for(const html of [oilRow().replace('value="1"','value="2"'),oilRow().replace('<p>£45.10</p>','<p>£45.10</p><p>£39.99</p>'),oilRow()+oilRow(),'<div hidden>'+oilRow()+'</div>',oilRow().replace('DRODT0205FO','')])assert.equal(readServiceKit(kitDoc(html)).items.length,0);
 const hiddenRrp=kitDoc(oilRow().replace('<p>RRP: £103.36</p>','<div>RRP: <span>£103.36</span></div>'));
 assert.equal(readServiceKit(hiddenRrp).items[0].expectedPricePence,4510);
 assert.equal(readServiceKit(parseHTML('<main>'+oilRow()+'</main>').document).status,'NEEDS_REVIEW');
});
const vehicle=reg=>({status:'CAPTURED_FOR_REVIEW',registration:reg,selectedRegistration:true,truncated:false,visibleText:`${reg} Clear Nissan Qashqai 1.3 (1332cc) Petrol/Hybrid Electric CVT 5 doors Copy VIN`});
function navigation({changed=false}={}){
 let current='',submitted=false,returned=false;const actions=[];
 const field={waitFor:async()=>{},count:async()=>1,fill:async reg=>actions.push('fill '+reg)};
 const page={goto:async url=>{current=url;actions.push('home');},url:()=>current,getByPlaceholder:()=>field,waitForTimeout:async()=>{},
  getByRole:(role,{name})=>name==='Clear'?{count:async()=>0}:name==='Search VRM Button'?{click:async()=>{submitted=true;actions.push('search');}}:name==='TradeHub'?{click:async()=>{current='https://trade.gsfcarparts.com/';returned=true;actions.push('verify-home');}}:assert.fail('Unexpected control: '+name),
  getByText:name=>{assert.equal(name,'Service Kit');return {count:async()=>1,isVisible:async()=>true,click:async()=>{current='https://trade.gsfcarparts.com/kit/2';actions.push('kit');}};},
  evaluate:async fn=>fn===readServiceKit?readServiceKit(kitDoc(oilRow()+filterRow())):{...vehicle(request.registration),selectedRegistration:submitted,...(changed&&returned?{visibleText:vehicle(request.registration).visibleText.replace('1.3','1.5')}:{} )}};
 return {page,actions};
}
test('kit navigation binds rows to the selected registration before and after capture without basket actions',async()=>{
 const {page,actions}=navigation();const result=await captureServiceKit(page,request,{attempts:5});
 assert.equal(result.items.length,2);assert.equal(result.registration,'H16CKK');
 assert.deepEqual(actions,['home','fill H16CKK','search','kit','verify-home']);
 await assert.rejects(captureServiceKit(navigation({changed:true}).page,request,{attempts:5}),error=>error.diagnosticReason==='KIT_VEHICLE_CHANGED');
});
const oilProduct={sku:'DT0205FO',brand:'DriveTec',description:'Fo Fully Synthetic Motor Oil 0W-20 - 5L',unitNetPence:4510,vatBasis:'EX_VAT',inStock:true};
function productPage(product=oilProduct){let current='https://trade.gsfcarparts.com/';return {url:()=>current,goto:async url=>{current=url;},evaluate:async()=>product,waitForTimeout:async()=>{}};}
const oilCapture=()=>({...vehicle('H16CKK'),visibleText:vehicle('H16CKK').visibleText+' Progress 0 L / 5.4 L'});
test('kit oil uses independently confirmed fill and rechecks description, price and VAT in product details',async()=>{
 const selected=readServiceKit(kitDoc(oilRow())).items[0];
 const result=await readKitProduct(productPage(),selected,request,{capture:async()=>oilCapture()});
 assert.equal(result.quantityMilli,5400);assert.equal(result.packQuantityMilli,5000);assert.equal(result.packNetPence,4510);assert.equal(result.unitNetPence,902);
 for(const wrong of [{...oilProduct,sku:'OTHER'},{...oilProduct,unitNetPence:10336},{...oilProduct,description:'Different oil 5L'},{...oilProduct,vatBasis:'INC_VAT'}])await assert.rejects(readKitProduct(productPage(wrong),selected,request,{capture:async()=>oilCapture()}),/REVIEW_REQUIRED/);
 await assert.rejects(readKitProduct(productPage(),selected,request,{capture:async()=>vehicle('H16CKK')}),error=>error.diagnosticReason==='OIL_FILL_UNCONFIRMED');
});
test('Interim and Full select only their required kit items; missing or rejected kit items retain category fallback',async()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/gsf-g4wpc-service.json','utf8'));
 for(const service of ['Interim Service','Full Service']){
  const used=[];const req={...request,registration:'G4WPC',service};
  const kit={registration:'G4WPC',vehicleCapture:fixture.categories[0],items:['oil','oil_filter','air_filter','cabin_filter','fuel_filter'].map(kind=>({kind,searchTerm:kind}))};
  const result=await lookupLiveService({},req,{captureKit:async()=>kit,capture:async()=>assert.fail('Complete verified kit should not need category prices'),readKit:async(_,row)=>{used.push(row.kind);return {kind:row.kind,sku:'SKU1',brand:'Brand',description:'Confirmed '+row.kind,unitNetPence:1000,quantityMilli:row.kind==='oil'?8800:1000,vatBasis:'EX_VAT',inStock:true};},chooseOilPack:async(_,p)=>p});
  assert.deepEqual(used,service==='Interim Service'?['oil','oil_filter']:['oil','oil_filter','air_filter','cabin_filter']);assert.equal(result.items.length,used.length);
 }
 let fallback=0;
 const req={...request,registration:'G4WPC',service:'Interim Service'};
 const result=await lookupLiveService({},req,{captureKit:async()=>{throw Error('REVIEW_REQUIRED');},capture:async(_,reg,category)=>{fallback++;return fixture.categories.find(x=>x.category===category);},readFresh:async(_,selected)=>({kind:selected.kind,sku:'SKU1',brand:'Brand',description:selected.description,quantityMilli:selected.quantityMilli,unitNetPence:1000,vatBasis:'EX_VAT',inStock:true}),chooseOilPack:async(_,p)=>p});
 assert.equal(result.items.length,2);assert.equal(fallback,2);
 const categories=[];
 const partial=await lookupLiveService({},req,{captureKit:async()=>({registration:'G4WPC',vehicleCapture:fixture.categories[0],items:[{kind:'oil_filter'}]}),capture:async(_,reg,category)=>{categories.push(category);return fixture.categories.find(x=>x.category===category);},readKit:async()=>{throw Error('REVIEW_REQUIRED');},readFresh:async(_,selected)=>({kind:selected.kind,sku:'SKU1',brand:'Brand',description:selected.description,quantityMilli:selected.quantityMilli,unitNetPence:1000,vatBasis:'EX_VAT',inStock:true}),chooseOilPack:async(_,p)=>p});
 assert.deepEqual(categories,['Engine Oils (Applied)','Oil Filter']);assert.equal(partial.guidePrice,undefined);
});
