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

// Replays the failure boundary: 50 broad search products, but just two
// vehicle-catalogue groups. Global products must never reach the choice list.
function browser({wrongVehicle=false,missingProduct=false,crossedPositions=false,changedSku=false}={}){
 let url='',state='home',active=0,selected=-1;const events=[];
 const groups=['left','right'].map((side,i)=>({selector:'#group'+i,sku:'FIXSENSOR'+i,description:'ABS Sensor',attributesSelector:'#attributes'+i,links:[],options:[{selector:'#option'+i,description:'ABS Sensor',brand:'Fixture',grade:'Gold',pricePence:2000+i*500,inStock:false,selectionControlPresent:true}]}));
 const page={url:()=>url,goto:async value=>{url=value;selected=-1;state=value.includes('/partdetails/')?'product':'home';if(state==='product')active=value.endsWith('FIXSENSOR1')?1:0;},waitForTimeout:async()=>{},keyboard:{press:async()=>{state='category';}},
  locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{events.push('search');state='search';url='https://trade.gsfcarparts.com/enhancedSearch/abs%20sensor';},evaluateAll:async()=>[],click:async()=>{
   if(selector.startsWith('#attributes')){active=Number(selector.slice(-1));events.push('attributes:'+active);}
   else if(selector.startsWith('#option')){selected=Number(selector.slice(-1));events.push('select:'+selected);}
   else{state='category';url='https://trade.gsfcarparts.com/parts/123';events.push('vehicle-category');}
  }}),evaluate:async(fn,input)=>{
   if(fn.name==='readCatalogueSearchState')return {fields:[{catalogue:true,selector:'#search'}]};
   if(fn.name==='readSearchProducts'){events.push('global-products');return {products:Array.from({length:50},(_,i)=>({sku:'GLOBAL'+i,label:'ABS Sensor',displayPricePence:1000+i}))};}
   if(fn.name==='readCatalogueResults')return related();
   if(fn.name==='readServiceCategory')return {status:'CAPTURED_FOR_REVIEW',selectedRegistration:state==='category'&&!wrongVehicle,registration:wrongVehicle?'WRONG':r.registration,visibleText:'Fixture vehicle'};
   if(fn.name==='readRepairGroups')return {complete:!missingProduct,groups:missingProduct?[]:groups.map((g,i)=>({...g,options:g.options.map(o=>({...o,selected:i===selected}))}))};
   if(fn.name==='readServiceAttributes')return {status:'ATTRIBUTES_CAPTURED',rows:crossedPositions?[{attribute:'Fitting Position',value:'Rear Axle Right'}]:[{attribute:'Fitting Position',value:'Front Axle '+(active===0?'Left':'Right')}]};
   if(fn.name==='readProductDialog'){
    assert.equal(state,'product');const o=groups[active].options[0];
    return {sku:changedSku?'OTHER':'SENSOR'+active,brand:o.brand,description:o.description,unitNetPence:o.pricePence,costIncVatPence:Math.round(o.pricePence*1.2),vatBasis:'EX_VAT',inStock:false,stock:[]};
   }
   throw Error('Unexpected reader '+fn.name);
  }};
 return {page,events,deps:{selectVehicle:async()=>{events.push('vehicle-ready');return {selectedRegistration:true,registration:r.registration};}}};
}
async function choice(f,request){let result;await assert.rejects(lookupGeneralGSF(f.page,request,f.deps),e=>{result=e.result;return e.code==='CHOICE_REQUIRED';});return cleanRepairChoices(result,request);}
const first=async(request,result)=>promptRepairChoice({question:async()=>'1'},request,result,{log:()=>{}});

test('50 global sensors produce no product choices; only the two vehicle groups are offered before Haynes',async()=>{
 const f=browser(),navigation=await choice(f,r);
 assert.equal(navigation.selectionKind,'wording');assert.deepEqual(navigation.options.map(o=>o.label),['ABS / Traction Control Sensor']);
 const request=await first(r,navigation),parts=await choice(f,request);
 assert.equal(parts.stage,'GSF_PART');assert.equal(parts.options.length,2);
 assert.deepEqual(parts.options.map(o=>o.costPence),[2000,2500]);
 assert.deepEqual(parts.options.map(o=>repairScope.resolve(o.work).side),['left','right']);
 assert.ok(parts.options.every(o=>o.inStock===false));assert.ok(!JSON.stringify(parts).includes('GLOBAL'));
 assert.ok(!f.events.includes('global-products'));assert.ok(f.events.indexOf('vehicle-ready')<f.events.indexOf('search'));
 assert.ok(f.events.indexOf('vehicle-category')<f.events.indexOf('attributes:0'));
 const final=await first(request,parts);let haynesCalls=0;
 await assert.rejects(lookupGeneralRepair({gsfPage:f.page},final,{gsf:(p,req)=>lookupGeneralGSF(p,req,f.deps),haynes:async(_p,req,{selectedPart})=>{
  haynesCalls++;assert.equal(selectedPart.sku,'SENSOR0');assert.equal(selectedPart.fitmentConfirmed,true);
  throw Object.assign(Error('CHOICE_REQUIRED'),{code:'CHOICE_REQUIRED',result:{request:req,stage:'HAYNES_LABOUR',options:[]}});
 }}),e=>e.code==='CHOICE_REQUIRED'&&e.result.stage==='HAYNES_LABOUR');
 assert.equal(haynesCalls,1);
});

test('wrong vehicle, missing catalogue and conflicting positions never reach Haynes or fall back to global products',async()=>{
 const valid=browser(),navigation=await choice(valid,r),request=await first(r,navigation);
 for(const options of [{wrongVehicle:true},{missingProduct:true},{crossedPositions:true}]){
  const f=browser(options);let haynesCalls=0;
  await assert.rejects(lookupGeneralRepair({gsfPage:f.page},request,{gsf:(p,req)=>lookupGeneralGSF(p,req,f.deps),haynes:async()=>{haynesCalls++;}}),e=>e.code==='REVIEW_REQUIRED'||e.code==='CHOICE_REQUIRED'&&e.result.stage==='GSF_PART'&&e.result.options.length===0);
  assert.equal(haynesCalls,0);assert.ok(!f.events.includes('global-products'));
 }
});

test('the chosen vehicle-catalogue part is re-read and a different manufacturer SKU is rejected',async()=>{
 const f=browser(),navigation=await choice(f,r),request=await first(r,navigation),parts=await choice(f,request),final=await first(request,parts);
 assert.equal((await lookupGeneralGSF(f.page,final,f.deps)).part.sku,'SENSOR0');
 const changed=browser({changedSku:true});
 await assert.rejects(lookupGeneralGSF(changed.page,final,changed.deps),e=>e.detail==='SELECTED_PRODUCT_CHANGED');
});
