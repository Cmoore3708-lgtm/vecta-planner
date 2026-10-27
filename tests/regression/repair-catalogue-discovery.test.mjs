import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {DISCOVERY_PARTS,readDiscoveryPage,discoverGSFParts,discoverHaynesJobs,submitHaynesJobSearch,discoveryTerms,openGSFCategoryResult,expandHaynesSearchResults} from '../../workers/repair-quotes/catalogue-discovery.mjs';
test('one inspection covers the complete structured part menu without SKU mappings',()=>{
 assert.equal(DISCOVERY_PARTS.length,21);assert.equal(new Set(DISCOVERY_PARTS.map(p=>p.id)).size,21);
 for(const p of DISCOVERY_PARTS){assert.match(p.id,/^[a-z-]+$/);assert.ok(p.label);assert.equal(p.sku,undefined);}
});
test('bounded DOM capture scrubs VIN and emails and cannot approve prices',()=>{
 const {document}=parseHTML('<html><body><nav>account private@example.com</nav><main><p>FV65JTY</p><h2>Brake Pad Set</h2><p>VIN SHSRE6740FU123456 private@example.com</p><section><div>£35.00 DriveTec Brake Pad Set Local Branch</div></section><div hidden>£1.00 hidden Out Of Stock</div><input type="password" value="secret"><p>SKU: ABC123</p></main></body></html>');
 const r=readDiscoveryPage({registration:'FV65JTY',term:'Brake Pad Set'},document);
 assert.equal(r.pricingApproved,false);assert.equal(r.cardCount,1);assert.equal(r.identities.length,1);
 assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(JSON.stringify(r).includes('private@example.com'),false);assert.equal(JSON.stringify(r).includes('SHSRE6740FU123456'),false);
});
test('inspection searches all parts, uses no ordering controls and continues after one unavailable result',async()=>{
 const searches=[],pressed=[],captured=[];let term='';const parts=DISCOVERY_PARTS.slice(0,3);
 const page={getByPlaceholder:()=>({fill:async value=>{term=value;searches.push(value);if(value==='Starter motor')throw Error('unavailable');},press:async key=>pressed.push(key)}),getByText:()=>({count:async()=>0,waitFor:async()=>{}}),waitForTimeout:async()=>{},url:()=> 'https://trade.gsfcarparts.com/enhancedSearch/test',evaluate:async(fn,arg)=>{captured.push(arg);return {pricingApproved:false};}};
 const r=await discoverGSFParts(page,'FV65JTY',{parts,openCategory:async()=>({registrationSubmitted:true,observed:{selectedRegistration:true}})});assert.equal(r.length,3);assert.deepEqual(searches,parts.map(p=>p.label));assert.equal(r[1].status,'INSPECTION_UNAVAILABLE');assert.equal(r[2].status,'INSPECTED');assert.deepEqual(pressed,['Enter','Enter']);assert.equal(captured.length,2);
});
function searchFixture(kind='link',ambiguous=false){
 const clicked=[],reads=[],target={isVisible:async()=>true,click:async()=>clicked.push('Search')};
 const none={count:async()=>0},matches={count:async()=>ambiguous?2:1,nth:()=>target};
 const scope={locator:selector=>selector==='..'?scope:kind==='input'?matches:none,getByRole:()=>kind==='button'?matches:none,getByText:()=>kind==='link'?matches:none};
 const field={fill:async()=>{},locator:()=>scope};
 const page={getByText:()=>none,getByPlaceholder:()=>field,waitForTimeout:async()=>{},locator:()=>none,evaluate:async()=>{reads.push(clicked.length);return {pricingApproved:false,jobs:[]};}};
 return {page,field,clicked,reads};
}
test('Haynes inspection clicks a styled Search link before reading each result',async()=>{
 const f=searchFixture();const r=await discoverHaynesJobs(f.page,'FV65JTY',{parts:DISCOVERY_PARTS.slice(0,2)});
 assert.equal(r.length,2);assert.deepEqual(f.clicked,['Search','Search']);assert.deepEqual(f.reads,[1,2]);assert.equal(r[0].searchSubmitted,true);assert.equal(r[0].submittedBy,'text');
});
test('Haynes Search supports native buttons and input controls too',async()=>{
 for(const kind of ['button','input']){const f=searchFixture(kind);assert.equal(await submitHaynesJobSearch(f.page,f.field),kind);assert.equal(f.clicked.length,1);}
});
test('ambiguous or missing Search controls stop inspection without clicking unrelated controls',async()=>{
 for(const kind of ['missing','link']){const f=searchFixture(kind,kind==='link');const r=await discoverHaynesJobs(f.page,'FV65JTY',{parts:DISCOVERY_PARTS.slice(0,2)});assert.equal(r.length,1);assert.equal(f.clicked.length,0);assert.equal(f.reads.length,0);assert.match(r[0].detail,/HAYNES_SEARCH_CONTROL_/);}
});

test('standard supplier terms cover all parts and match Haynes job terminology',()=>{
 for(const p of DISCOVERY_PARTS){const t=discoveryTerms(p);assert.ok(t.gsfCategory);assert.ok(t.haynesSearch);assert.ok(t.haynesHeadings.length);}
 assert.equal(discoveryTerms({id:'water-pump'}).haynesSearch,'Coolant pump');
 assert.equal(discoveryTerms({id:'brake-pads'}).haynesSearch,'Brake pad');
});
test('GSF inspection selects the actual category then rechecks its vehicle filter',async()=>{
 const actions=[],item={isVisible:async()=>true,click:async()=>actions.push('category')};
 const page={getByRole:()=>({count:async()=>1,nth:()=>item}),getByText:()=>({count:async()=>0,waitFor:async()=>{}}),waitForURL:async predicate=>assert.equal(predicate(new URL('https://trade.gsfcarparts.com/parts/Brake%20Pads')),true),url:()=> 'https://trade.gsfcarparts.com/parts/Brake%20Pads'};
 const r=await openGSFCategoryResult(page,{id:'brake-pads'},'FV65JTY',{navigate:async(p,reg,options)=>{actions.push('vehicle');assert.equal(reg,'FV65JTY');assert.equal(options.categoryUrl,page.url());return {verified:true};}});assert.deepEqual(actions,['category','vehicle']);assert.equal(r.verified,true);
});
test('Haynes inspection opens named operation groups without using estimate controls',async()=>{
 const clicks=[],heading={isVisible:async()=>true,evaluate:async()=>false,click:async()=>clicks.push('Coolant pump')};
 const page={getByText:(label,{exact})=>{assert.equal(exact,true);assert.equal(label,'Coolant pump');return {count:async()=>1,nth:()=>heading};},waitForTimeout:async()=>{}};
 assert.deepEqual(await expandHaynesSearchResults(page,['Coolant pump']),['Coolant pump']);assert.deepEqual(clicks,['Coolant pump']);
});

import {inspectRepairCatalogue} from '../../workers/repair-quotes/catalogue-structure.mjs';
test('vehicle-filter readiness accepts a priced brake catalogue without pretending it is an alternator',()=>{
 const {document}=parseHTML('<html><body><main><p>FV65JTY</p><section><div><span>£35.00 Brake Pads Local Branch</span></div></section></main></body></html>');
 assert.equal(inspectRepairCatalogue({registration:'FV65JTY'},document).candidateCount,0);
 assert.equal(inspectRepairCatalogue({registration:'FV65JTY',anyPart:true},document).candidateCount,1);
});
