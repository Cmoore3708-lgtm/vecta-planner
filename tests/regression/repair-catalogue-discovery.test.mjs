import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {DISCOVERY_PARTS,readDiscoveryPage,discoverGSFParts,discoverHaynesJobs,submitHaynesJobSearch} from '../../workers/repair-quotes/catalogue-discovery.mjs';
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
 const page={getByPlaceholder:()=>({fill:async value=>{term=value;searches.push(value);if(value==='Starter motor')throw Error('unavailable');},press:async key=>pressed.push(key)}),getByText:()=>({count:async()=>0}),waitForTimeout:async()=>{},url:()=> 'https://trade.gsfcarparts.com/enhancedSearch/test',evaluate:async(fn,arg)=>{captured.push(arg);return {pricingApproved:false};}};
 const r=await discoverGSFParts(page,'FV65JTY',{parts});assert.equal(r.length,3);assert.deepEqual(searches,parts.map(p=>p.label));assert.equal(r[1].status,'INSPECTION_UNAVAILABLE');assert.equal(r[2].status,'INSPECTED');assert.deepEqual(pressed,['Enter','Enter']);assert.equal(captured.length,2);
});
function searchFixture(kind='link',ambiguous=false){
 const clicked=[],reads=[],target={isVisible:async()=>true,click:async()=>clicked.push('Search')};
 const none={count:async()=>0},matches={count:async()=>ambiguous?2:1,nth:()=>target};
 const scope={locator:selector=>selector==='..'?scope:kind==='input'?matches:none,getByRole:()=>kind==='button'?matches:none,getByText:()=>kind==='link'?matches:none};
 const field={fill:async()=>{},locator:()=>scope};
 const page={getByPlaceholder:()=>field,waitForTimeout:async()=>{},locator:()=>none,evaluate:async()=>{reads.push(clicked.length);return {pricingApproved:false,jobs:[]};}};
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
