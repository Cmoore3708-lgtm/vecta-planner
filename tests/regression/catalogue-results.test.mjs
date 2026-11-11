import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readCatalogueResults,observedCategory,categoryMatches,categoryChoiceId,suggestedCategoryChoices,followExactCategorySuggestion} from '../../workers/repair-quotes/catalogue-results.mjs';
import {discoverRepairCategory} from '../../workers/repair-quotes/general-gsf.mjs';
import {readCatalogueSearchState} from '../../workers/repair-quotes/catalogue-search.mjs';
import {repairRequest,cleanRepairChoices} from '../../lib/repair-quote.js';
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1'});
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
function page(body,{destination='/parts/Radiator',enterDestination,links=[]}={}){
 let url='https://trade.gsfcarparts.com/',clicks=0,presses=0;const d=doc(body);
 const p={url:()=>url,goto:async v=>{url=v;},waitForTimeout:async()=>{},evaluate:async(fn,input)=>fn===readCatalogueSearchState?readCatalogueSearchState(d):readCatalogueResults(input,d),locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{presses++;if(enterDestination)url='https://trade.gsfcarparts.com'+enterDestination;},click:async()=>{clicks++;url='https://trade.gsfcarparts.com'+destination;},evaluateAll:async()=>links})};
 return {p,counts:()=>({clicks,presses})};
}
test('an exact non-link suggestion is followed only into its matching actual category',async()=>{
 const f=page('<div role="option">Radiator</div>');assert.equal((await followExactCategorySuggestion(f.p,'radiator')).category,'Radiator');assert.equal(f.counts().clicks,1);
 const wrong=page('<div role="option">Radiator</div>',{destination:'/partdetails/RAD1'});assert.equal((await followExactCategorySuggestion(wrong.p,'radiator')).category,'');
});
test('a successful direct category navigation after Enter does not require a redundant self-link',async()=>{
 const f=page('<h1>Search</h1>',{enterDestination:'/parts/Radiator'});assert.equal(await discoverRepairCategory(f.p,'radiator',{request}),'Radiator');assert.deepEqual(f.counts(),{clicks:0,presses:1});
});
test('different terminology is offered for selection and its choice is re-discovered live',async()=>{
 const f=page('<button role="option">Engine Radiator</button><button role="option">Radiator Fan</button>',{destination:'/parts/Engine%2520Radiator'});let result;
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request}),error=>{result=error.result;assert.equal(error.observed.pageType,'home');return error.code==='CHOICE_REQUIRED';});
 assert.equal(result.options.length,2);assert.equal(f.counts().clicks,0);
 const option=result.options[0],selected=repairRequest({...request,work:option.work,choices:{gsfCategory:option.categoryChoice}});
 assert.equal(cleanRepairChoices(result,request).options[0].categoryChoice,option.categoryChoice);
 assert.equal(await discoverRepairCategory(f.p,'engine radiator',{request:selected}),'Engine Radiator');assert.equal(f.counts().clicks,1);
});
test('a changed/missing selected suggestion is not silently replaced by another exact match',async()=>{
 const f=page('<button role="option">Radiator</button>');
 const result=await followExactCategorySuggestion(f.p,'radiator','a'.repeat(32));assert.equal(result.category,'');assert.equal(f.counts().clicks,0);
});
test('empty selectable results retain observed product labels for the next workshop report',async()=>{
 const f=page('<h1>Search results for radiator</h1><p>Radiator - aluminium</p><a href="/partdetails/RAD1">Radiator</a>');
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request}),error=>error.code==='CHOICE_REQUIRED'&&error.result.options.length===0&&error.observed.productLinks===1&&error.observed.matchingLabels.includes('Radiator - aluminium'));
});
test('a click into product details never presses an old search selector after navigation',async()=>{
 const f=page('<button role="option">Radiator</button>',{destination:'/partdetails/RAD1'});
 await assert.rejects(discoverRepairCategory(f.p,'radiator',{request}),error=>error.code==='CHOICE_REQUIRED'&&error.observed.pageType==='product');assert.equal(f.counts().presses,0);
});
