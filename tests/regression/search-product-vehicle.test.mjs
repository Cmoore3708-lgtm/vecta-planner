import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {repairRequest,repairScope,cleanRepairChoices} from '../../lib/repair-quote.js';
import {lookupGeneralGSF,repairFitment,scopeForFitment,productVerificationCategory} from '../../workers/repair-quotes/general-gsf.mjs';
import {readCatalogueResults} from '../../workers/repair-quotes/catalogue-results.mjs';
import {readServiceCategory} from '../../workers/gsf/service-capture.mjs';
import {readSearchProductFitment} from '../../workers/repair-quotes/catalogue-products.mjs';
import {promptRepairChoice} from '../../workers/repair-quotes/checker-input.mjs';
import {lookupGeneralRepair} from '../../workers/repair-quotes/general-repair.mjs';
const r=repairRequest({registration:'AB12CDE',work:'Fit front ABS sensor',flow:'guided-v1'});
const label='Wheel Speed / ABS Sensor - Front/Rear LH';
const rows=['Front Axle LH','Rear Axle LH','Front Axle LH'].map(value=>({attribute:'Fitting Position',value}));
const doc=body=>parseHTML('<html><body>'+body+'</body></html>').document;
const related=()=>readCatalogueResults({query:'abs sensor'},doc('<main><h1>Search Results</h1><button>ABS / Traction Control Sensor</button><button>ABS Ring</button><button>Brake Pad Wear Sensor</button><button>Camshaft Sensor</button></main>'));

test('the reported modal can hide main while exposing valid LH fitment rows without a compatibility sentence',()=>{
 const d=doc('<main aria-hidden="true"><button>Clear</button><p>AB12CDE</p></main><section role="dialog"><h2>Part Details</h2><h5>'+label+'</h5><table>'+rows.map(row=>'<tr><td>'+row.attribute+'</td><td>'+row.value+'</td></tr>').join('')+'</table></section>');
 assert.equal(readServiceCategory({registration:r.registration,category:'search'},d).selectedRegistration,false);
 assert.deepEqual(readSearchProductFitment(d),{fitsSelectedVehicle:false,rows});
 const scope=repairScope.resolve('Fit front left abs sensor');
 assert.equal(scopeForFitment(rows,scope).work,scope.work);
 assert.equal(repairFitment(rows,scope,{allowAlternatives:true}),true);
 const crossed=[{attribute:'Fitting Position',value:'Front Axle RH'},{attribute:'Fitting Position',value:'Rear Axle LH'}];
 assert.equal(scopeForFitment(crossed,scope),null);
 assert.equal(scopeForFitment(rows,repairScope.resolve('Fit front right abs sensor')),null);
});

test('vehicle catalogue navigation uses one observed category matching all terms, without part-specific mappings',()=>{
 assert.equal(productVerificationCategory(related(),'abs sensor').label,'ABS / Traction Control Sensor');
 for(const part of ['radiator','door lock actuator','fuel pressure regulator','starter motor']){
  const results={controls:[{label:part,path:'/parts/123'},{label:part+' accessories',path:'/parts/124'}]};
  assert.equal(productVerificationCategory(results,part).label,part);
 }
 assert.equal(productVerificationCategory({controls:[{label:'Engine ABS Sensor',path:''},{label:'Wheel ABS Sensor',path:''}]},'abs sensor'),null);
 assert.equal(productVerificationCategory({controls:[{label:'ABS Ring',path:''},{label:'Camshaft Sensor',path:''}]},'abs sensor'),null);
});

// Synthetic supplier data; the uploaded report did not retain a SKU or price.
function browser({wrongVehicle=false,missingProduct=false,crossedPositions=false,otherSku=false,fullPage=false,restoreVehicle=false,extraGroups=0,productLabel=label}={}){
 let url='',state='home',hasVehicle=!restoreVehicle,selected=false;const events=[];
 const catalogueSku=otherSku?'SENSOR2':'SENSOR1';
 const part=sku=>({sku,brand:'Fixture',description:productLabel,unitNetPence:2000,costIncVatPence:2400,vatBasis:'EX_VAT',inStock:false,stock:[]});
 const page={url:()=>url,goto:async v=>{url=v;selected=false;state=v.includes('/partdetails/')?'final-product':v.includes('/enhancedSearch/')?'search':'home';events.push('goto:'+state);},waitForTimeout:async()=>{},keyboard:{press:async()=>{events.push('escape:'+state);if(state==='product')state='search';if(state==='attributes')state='category';}},
  locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{state='search';url='https://trade.gsfcarparts.com/enhancedSearch/abs%20sensor';},evaluateAll:async()=>[],click:async()=>{
   if(selector==='#product'){state='product';if(fullPage)url='https://trade.gsfcarparts.com/partdetails/SENSOR1';}
   else if(selector==='#attributes'){state='attributes';events.push('attributes');}
   else if(selector==='#option')selected=true;
   else {state='category';url='https://trade.gsfcarparts.com/parts/123';events.push('vehicle-category');}
  }}),evaluate:async(fn,input)=>{
   if(fn.name==='readCatalogueSearchState')return {fields:[{catalogue:true,selector:'#search'}]};
   if(fn.name==='readSearchProducts')return {busy:false,products:[{label:productLabel,sku:'',path:'',displayPricePence:2000,selector:'#product',cardSelector:'#card'}]};
   if(fn.name==='readCatalogueResults')return related();
   if(fn.name==='readProductDialog'){if(state==='product')return part('SENSOR1');if(state==='final-product')return part(catalogueSku);throw Error('PRODUCT_DETAILS_NOT_OPEN');}
   if(fn.name==='readSearchProductFitment')return {fitsSelectedVehicle:false,rows};
   if(fn.name==='readServiceCategory')return {status:'CAPTURED_FOR_REVIEW',selectedRegistration:state==='category'&&hasVehicle&&!wrongVehicle,registration:wrongVehicle?'WRONG':r.registration,visibleText:'Fixture vehicle'};
   if(fn.name==='readServiceAttributes')return {status:'ATTRIBUTES_CAPTURED',rows:crossedPositions?[{attribute:'Fitting Position',value:'Front Axle RH'},{attribute:'Fitting Position',value:'Rear Axle LH'}]:rows};
   if(fn.name==='readRepairGroups'){
    const group={selector:'#group',sku:'FIX'+catalogueSku,description:productLabel,attributesSelector:'#attributes',links:[],options:[{selector:'#option',description:missingProduct?'Different sensor':productLabel,brand:'Fixture',grade:'Gold',pricePence:2000,inStock:false,selected,selectionControlPresent:true}]};
    return {complete:true,groups:[group,...Array.from({length:extraGroups},(_,i)=>({...group,sku:'OTHER'+i}))]};
   }
   throw Error('Unexpected reader '+fn.name);
  }};
 return {page,events,deps:{selectVehicle:async()=>{events.push('select-vehicle:'+state);if(state==='category')hasVehicle=true;return {selectedRegistration:!wrongVehicle,registration:r.registration};}}};
}
async function choice(f,request){let result;await assert.rejects(lookupGeneralGSF(f.page,request,f.deps),e=>{result=e.result;return e.code==='CHOICE_REQUIRED';});return cleanRepairChoices(result,request);}
const first=async(request,result)=>promptRepairChoice({question:async()=>'1'},request,result,{log:()=>{}});

test('a product modal without a visible vehicle is verified against its vehicle catalogue before pricing and Haynes',async()=>{
 for(const fullPage of [false,true]){
  const f=browser({fullPage,restoreVehicle:true}),navigation=await choice(f,r),selected=await first(r,navigation);
  assert.equal(navigation.selectionKind,'product');assert.equal(selected.work,'Supply and fit front left abs sensor');
  const prices=await choice(f,selected);assert.equal(prices.stage,'GSF_PART');assert.equal(prices.options[0].costPence,2000);assert.equal(prices.options[0].inStock,false);
  assert.ok(f.events.includes('escape:product'));assert.ok(f.events.includes('vehicle-category'));assert.ok(f.events.includes('select-vehicle:category'));
  const final=await first(selected,prices);let haynesCalls=0;
  await assert.rejects(lookupGeneralRepair({gsfPage:f.page},final,{gsf:(p,req)=>lookupGeneralGSF(p,req,f.deps),haynes:async(_p,req,{selectedPart})=>{haynesCalls++;assert.equal(selectedPart.sku,'SENSOR1');assert.equal(selectedPart.fitmentConfirmed,true);throw Object.assign(Error('CHOICE_REQUIRED'),{code:'CHOICE_REQUIRED',result:{request:req,stage:'HAYNES_LABOUR',options:[]}});}}),e=>e.code==='CHOICE_REQUIRED'&&e.result.stage==='HAYNES_LABOUR');
  assert.equal(haynesCalls,1);
 }
});

test('wrong vehicle, conflicting positions and a missing product never bypass catalogue verification',async()=>{
 const valid=browser(),navigation=await choice(valid,r),selected=await first(r,navigation);
 for(const options of [{wrongVehicle:true},{missingProduct:true},{crossedPositions:true}]){
  const f=browser(options);let haynesCalls=0;
  await assert.rejects(lookupGeneralRepair({gsfPage:f.page},selected,{gsf:(p,req)=>lookupGeneralGSF(p,req,f.deps),haynes:async()=>{haynesCalls++;}}),e=>e.code==='REVIEW_REQUIRED');
  assert.equal(haynesCalls,0);
 }
 const other=browser({otherSku:true}),prices=await choice(other,selected),final=await first(selected,prices);
 await assert.rejects(lookupGeneralGSF(other.page,final,other.deps),e=>e.detail==='SEARCH_PRODUCT_NOT_LISTED_FOR_VEHICLE');
});

test('selected SKU verification skips unrelated attribute dialogs and offers missing positions before Haynes',async()=>{
 const request=repairRequest({...r,work:'Fit abs sensor'}),f=browser({extraGroups:45,productLabel:'ABS Sensor'});
 const navigation=await choice(f,request),selected=await first(request,navigation);
 const prices=await choice(f,selected);
 assert.equal(f.events.filter(e=>e==='attributes').length,1);
 assert.deepEqual(prices.options.map(o=>o.work),['Supply and fit front left abs sensor','Supply and fit rear left abs sensor']);
 const final=await first(selected,prices),evidence=await lookupGeneralGSF(f.page,final,f.deps);
 assert.equal(evidence.part.sku,'SENSOR1');assert.equal(evidence.part.choiceId,prices.options[0].id);
});
