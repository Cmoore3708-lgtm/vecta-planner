import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readCatalogueResults,observedCategory,categoryMatches,labelledDestinationCategory,categoryChoiceId,suggestedCategoryChoices,followExactCategorySuggestion} from '../../workers/repair-quotes/catalogue-results.mjs';
import {discoverRepairCategory,catalogueCategoryOptions,matchingCatalogueCategories} from '../../workers/repair-quotes/general-gsf.mjs';
import {readCatalogueSearchState} from '../../workers/repair-quotes/catalogue-search.mjs';
import {readServiceCategory} from '../../workers/gsf/service-capture.mjs';
import {repairRequest,repairScope,cleanRepairChoices} from '../../lib/repair-quote.js';
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1'});
const selectVehicle=async(_page,registration)=>({registration,selectedRegistration:true});
const doc=body=>parseHTML('<html><body><input type="search" placeholder="Search parts or categories" value="PRIVATE INPUT">'+body+'</body></html>').document;
test('only observed GSF category paths are accepted, with no inferred category URL',()=>{
 assert.equal(observedCategory('https://trade.gsfcarparts.com/parts/Engine%2520Radiator?tracking=secret'),'Engine Radiator');
 for(const url of ['https://evil.example/parts/Radiator','https://trade.gsfcarparts.com/partdetails/RAD1','https://trade.gsfcarparts.com/parts/Engine/Radiator','https://user:password@trade.gsfcarparts.com/parts/Radiator'])assert.equal(observedCategory(url),'');
 assert.equal(categoryMatches('Radiator','radiators'),true);assert.equal(categoryMatches('Radiator Fan','radiator'),false);
});
test('visible suggestion controls and product-result diagnostics exclude hidden/account/purchase controls',()=>{
 const d=doc('<h1>Search results for radiator</h1><div role="listbox"><button role="option">Engine Radiator</button><button role="option">Radiator Fan</button></div><button>Add radiator to basket</button><button type="submit">Radiator</button><button hidden>Radiator</button><a href="https://evil.example/parts/Radiator">Radiator</a><a href="/partdetails/RAD1?token=secret">Radiator</a><input type="password" value="PASSWORD"><p>Account private@example.com</p><span style="display:none">radiator secret hidden</span>');
 const r=readCatalogueResults({query:'radiator'},d);assert.deepEqual(r.controls.map(c=>c.label),['Engine Radiator','Radiator Fan']);assert.equal(r.productLinks,1);assert.equal(r.categoryLinks,0);
 assert.ok(r.headings[0].includes('radiator'));assert.doesNotMatch(JSON.stringify(r),/PRIVATE INPUT|PASSWORD|private@example|token=|secret hidden/);
 const choices=suggestedCategoryChoices(r,request);assert.equal(choices.length,2);assert.equal(choices[0].categoryChoice,choices[0].id);assert.match(choices[0].work,/Engine Radiator/);
});
test('duplicate controls are not offered as if they were unambiguous options',()=>{
 const r=readCatalogueResults({query:'radiator'},doc('<button role="option">Radiator</button><button role="option">Radiator</button>'));
 assert.deepEqual(suggestedCategoryChoices(r,request),[]);
});
function page(body,{destination='/parts/Radiator',enterDestination,links=[],initialUrl='https://trade.gsfcarparts.com/'}={}){
 let url=initialUrl,clicks=0,presses=0;const d=doc(body);
 const p={url:()=>url,goto:async v=>{url=v;},waitForTimeout:async()=>{},evaluate:async(fn,input)=>fn===readCatalogueSearchState?readCatalogueSearchState(d):fn===readServiceCategory?{registration:input.registration,selectedRegistration:true}:readCatalogueResults(input,d),locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{assert.ok(!url.includes('/partdetails/'),'Do not reuse a search selector after opening product details');presses++;if(enterDestination)url='https://trade.gsfcarparts.com'+enterDestination;},click:async()=>{clicks++;url='https://trade.gsfcarparts.com'+destination;},evaluateAll:async()=>links})};
 return {p,counts:()=>({clicks,presses})};
}
test('an exact non-link suggestion is followed only into its matching actual category',async()=>{
 const f=page('<div role="option">Radiator</div>');assert.equal((await followExactCategorySuggestion(f.p,'radiator')).category,'Radiator');assert.equal(f.counts().clicks,1);
 const wrong=page('<div role="option">Radiator</div>',{destination:'/partdetails/RAD1'});assert.equal((await followExactCategorySuggestion(wrong.p,'radiator')).category,'');
});
test('a successful direct category navigation after Enter does not require a redundant self-link',async()=>{
 const f=page('<h1>Search</h1>',{enterDestination:'/parts/Radiator'});assert.equal(await discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),'Radiator');assert.deepEqual(f.counts(),{clicks:0,presses:1});
});
test('different terminology is offered for selection and its choice is re-discovered live',async()=>{
 const f=page('<button role="option">Engine Radiator</button><button role="option">Radiator Fan</button>',{destination:'/parts/Engine%2520Radiator'});let result;
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),error=>{result=error.result;assert.equal(error.observed.pageType,'home');return error.code==='CHOICE_REQUIRED';});
 assert.equal(result.options.length,2);assert.equal(f.counts().clicks,0);
 const option=result.options[0],selected=repairRequest({...request,work:option.work,choices:{gsfCategory:option.categoryChoice}});
 assert.equal(cleanRepairChoices(result,request).options[0].categoryChoice,option.categoryChoice);
 assert.equal(await discoverRepairCategory(f.p,'engine radiator',{request:selected,selectVehicle}),'Engine Radiator');assert.equal(f.counts().clicks,1);
});
test('a changed/missing selected suggestion is not silently replaced by another exact match',async()=>{
 const f=page('<button role="option">Radiator</button>');
 const result=await followExactCategorySuggestion(f.p,'radiator','a'.repeat(32));assert.equal(result.category,'');assert.equal(f.counts().clicks,0);
});
test('empty selectable results retain observed product labels for the next workshop report',async()=>{
 const f=page('<h1>Search results for radiator</h1><p>Radiator - aluminium</p><a href="/partdetails/RAD1">Radiator</a>');
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),error=>error.code==='CHOICE_REQUIRED'&&error.result.options.length===0&&error.observed.productLinks===1&&error.observed.matchingLabels.includes('Radiator - aluminium'));
});
test('a click into product details never presses an old search selector after navigation',async()=>{
 const f=page('<button role="option">Radiator</button>',{destination:'/partdetails/RAD1'});
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),error=>error.code==='CHOICE_REQUIRED'&&error.observed.pageType==='product');assert.equal(f.counts().presses,1);
});
test('an empty category page reports its actual category and vehicle context without query parameters',async()=>{
 const f=page('<main><h1>Select a vehicle</h1><p>Please wait</p><div role="progressbar"></div></main><input type="password" hidden value="secret">',{enterDestination:'/parts/All?session=secret'});
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),error=>{
  assert.equal(error.observed.observedCategory,'All');assert.equal(error.observed.vehicleConfirmedBeforeSearch,true);assert.equal(error.observed.vehicleConfirmedAfterSearch,true);
  assert.deepEqual(error.observed.pageState.mainHeadings,['Select a vehicle']);assert.equal(error.observed.pageState.vehiclePrompt,true);assert.equal(error.observed.pageState.loadingMessage,true);assert.equal(error.observed.pageState.busy,true);
  assert.doesNotMatch(JSON.stringify(error.observed),/secret|session=/);return error.code==='CHOICE_REQUIRED';
 });
});
test('an actual related destination is offered for confirmation even with no category links or matching page text',async()=>{
 const f=page('<main></main>',{enterDestination:'/parts/Engine%2520Radiator?session=secret'});
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),error=>{
  assert.equal(error.result.options.length,1);assert.equal(error.result.options[0].label,'Engine Radiator');assert.equal(error.result.options[0].work,'Supply and fit Engine Radiator');
  assert.equal(error.observed.observedCategory,'Engine Radiator');assert.doesNotMatch(JSON.stringify(error.observed),/secret|session=/);return error.code==='CHOICE_REQUIRED';
 });
 assert.equal(f.counts().clicks,0);
});
test('the exact observed suggestion may navigate to a numeric GSF category ID',async()=>{
 // Same route shape and label as the v4 workshop report; no local part map.
 const f=page('<button role="option">Radiator</button>',{destination:'/parts/848'});
 assert.equal(await discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),'848');assert.deepEqual(f.counts(),{clicks:1,presses:1});
 for(const [part,id] of [['Fuel Pressure Regulator','29001'],['Door Lock Actuator','29002'],['Air Conditioning Compressor','29003']]){
  const row=page('<button role="option">'+part+'</button>',{destination:'/parts/'+id});
  const r=repairRequest({registration:request.registration,work:'Supply and fit '+part,flow:'guided-v1'});
  assert.equal(await discoverRepairCategory(row.p,part.toLowerCase(),{request:r,selectVehicle}),id);
 }
});
test('numeric direct-navigation routes require an observed matching main-content label',async()=>{
 const good=page('<main><span>Radiator</span></main>',{enterDestination:'/parts/848'});
 assert.equal(await discoverRepairCategory(good.p,'radiator',{request,selectVehicle}),'848');assert.deepEqual(good.counts(),{clicks:0,presses:1});
 for(const body of ['<main></main>','<header><span>Radiator</span></header><main></main>','<main><form><span>Radiator</span></form></main>','<main><button role="option">Radiator</button></main>','<main><span hidden>Radiator</span></main>','<main><span>Radiator Fan</span></main>']){
  const results=readCatalogueResults({query:'radiator'},doc(body));
  assert.equal(labelledDestinationCategory('https://trade.gsfcarparts.com/parts/848','https://trade.gsfcarparts.com/','radiator',results),'',body);
 }
 const results=readCatalogueResults({query:'radiator'},doc('<main><span>Radiator</span></main>'));
 const inputs=readCatalogueResults({query:'radiator'},doc('<main><div><form><textarea>Radiator PRIVATE_TEXT</textarea></form></div><span>Radiator</span></main>'));
 assert.deepEqual(inputs.mainMatchingLabels,['Radiator']);
 assert.equal(labelledDestinationCategory('https://trade.gsfcarparts.com/parts/848','https://trade.gsfcarparts.com/parts/848','radiator',results),'');
 assert.equal(labelledDestinationCategory('https://evil.example/parts/848','https://trade.gsfcarparts.com/','radiator',results),'');
 assert.equal(labelledDestinationCategory('https://trade.gsfcarparts.com/parts/848','https://trade.gsfcarparts.com/','radiator',{...results,pageState:{...results.pageState,busy:true}}),'');
});
test('reselecting the same numeric category needs the clicked label and matching page content',async()=>{
 const good=page('<button role="option">Radiator</button><main><span>Radiator</span></main>',{destination:'/parts/848',initialUrl:'https://trade.gsfcarparts.com/parts/848'});
 assert.equal((await followExactCategorySuggestion(good.p,'radiator')).category,'848');assert.equal(good.counts().clicks,1);
 const stale=page('<button role="option">Radiator</button><main><span>Radiator Fan</span></main>',{destination:'/parts/848',initialUrl:'https://trade.gsfcarparts.com/parts/848'});
 assert.equal((await followExactCategorySuggestion(stale.p,'radiator')).category,'');
});
test('numeric category alternatives retain supplier wording, position and quantity for the next request',()=>{
 const r=repairRequest({registration:request.registration,work:'Supply and fit 2 front wishbones',flow:'guided-v1'});
 const options=catalogueCategoryOptions([{href:'/parts/913',text:'Control Arm'},{href:'/parts/914',text:'Wishbone'},{href:'/parts/915',text:'915'}],'wishbone',repairScope.resolve(r.work));
 assert.equal(options.length,2);
 const choice=options.find(o=>o.label==='Control Arm');assert.equal(choice.work,'Supply and fit 2 front Control Arm');
 const next=repairRequest({...r,work:choice.work,operation:undefined,quantity:undefined});assert.equal(next.quantity,2);assert.equal(repairScope.resolve(next.work).query,'control arm');
 assert.deepEqual(matchingCatalogueCategories([{href:'/parts/913',text:'Control Arm'}],'control arm'),['913']);
});
test('a numeric destination with related wording is offered, not silently accepted as the requested part',async()=>{
 const f=page('<main><span>Engine Radiator</span></main>',{enterDestination:'/parts/849'});
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request,selectVehicle}),error=>{
  assert.equal(error.result.options.length,1);assert.equal(error.result.options[0].label,'Engine Radiator');assert.equal(error.result.options[0].work,'Supply and fit Engine Radiator');return error.code==='CHOICE_REQUIRED';
 });
});
