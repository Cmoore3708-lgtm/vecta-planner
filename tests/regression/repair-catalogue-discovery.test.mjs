import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {DISCOVERY_PARTS,readDiscoveryPage,discoverGSFParts,discoverHaynesJobs} from '../../workers/repair-quotes/catalogue-discovery.mjs';
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
test('Haynes inspection only searches and reads jobs; never adds jobs to an estimate',async()=>{
 const clicked=[];const page={getByPlaceholder:name=>{assert.equal(name,'Search job');return {fill:async()=>{}};},getByRole:(role,{name})=>({click:async()=>clicked.push(name)}),waitForTimeout:async()=>{},locator:()=>({count:async()=>0}),evaluate:async()=>({pricingApproved:false,jobs:[]})};
 const r=await discoverHaynesJobs(page,'FV65JTY',{parts:DISCOVERY_PARTS.slice(0,2)});assert.equal(r.length,2);assert.deepEqual(clicked,['Search','Search']);
});
