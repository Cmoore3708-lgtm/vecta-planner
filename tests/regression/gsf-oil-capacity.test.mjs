import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueSelection,lookupLiveService} from '../../workers/gsf/live-service.mjs';
import {oilFillEvidence} from '../../workers/gsf/oil-capacity.mjs';
import {calculateServicePrice} from '../../lib/service-pricing.js';
const fixture=JSON.parse(readFileSync('tests/fixtures/gsf-g4wpc-service.json','utf8'));
const oil=()=>structuredClone(fixture.categories.find(c=>c.category==='Engine Oils (Applied)'));
test('G4WPC missing GSF fill uses the reviewed Haynes 8.8L including filter, independently of bottle sizes',()=>{
 const selected=catalogueSelection(oil(),'oil','G4WPC');assert.equal(selected.quantityMilli,8800);assert.equal(selected.packQuantityMilli,1000);assert.equal(selected.expectedPricePence,1424);assert.match(oilFillEvidence(oil(),'G4WPC').source,/including filter/);
});
test('oil capacities cannot be reused for another registration, engine or unconfirmed vehicle',()=>{
 for(const modify of [c=>c.registration='G5WPC',c=>c.selectedRegistration=false,c=>c.truncated=true,c=>c.visibleText=c.visibleText.replace('D350','D250'),c=>c.visibleText=c.visibleText.replace('2996cc','1999cc')]){const c=oil();modify(c);assert.throws(()=>catalogueSelection(c,'oil','G4WPC'),/REVIEW_REQUIRED/);}
 const unknown=oil();unknown.registration='G5WPC';unknown.visibleText=unknown.visibleText.replaceAll('G4WPC','G5WPC');assert.equal(oilFillEvidence(unknown,'G5WPC'),null);
});
test('existing GSF fill quantities remain available for vehicles without reviewed Haynes evidence',()=>{
 const c=oil();c.registration='G5WPC';c.visibleText='Progress 0 L / 4.7 L '+c.visibleText.replaceAll('G4WPC','G5WPC');assert.equal(oilFillEvidence(c,'G5WPC').requiredMl,4700);
});
test('all G4WPC combustion packages retain 8.8L required and charge 9L, with fresh product checks',async()=>{
 for(const service of ['Oil & Filter Change','Full Service','Major Service']){
  const chosen=new Map();let freshChecks=0;
  const page={url:()=> 'https://trade.gsfcarparts.com/partdetails/example',goto:async url=>{page.current=url.split('/').at(-1)},evaluate:async()=>{freshChecks++;const p=chosen.get(page.current);return {sku:p.searchTerm,brand:'Fixture brand',description:p.description.toLowerCase(),unitNetPence:p.expectedPricePence}}};
  const result=await lookupLiveService(page,{registration:'G4WPC',service,mileage:null,range:'Mid Range'},{capture:async(_,reg,category)=>{const c=structuredClone(fixture.categories.find(c=>c.category===category)),kind={'Engine Oils (Applied)':'oil','Oil Filter':'oil_filter','Air Filter':'air_filter','Cabin Filter':'cabin_filter','Fuel Filter':'fuel_filter'}[category],s=catalogueSelection(c,kind,reg);chosen.set(s.searchTerm,s);return c;}});
  assert.equal(freshChecks,result.items.length);assert.equal(result.items.find(i=>i.kind==='oil').quantityMilli,8800);
  const price=calculateServicePrice(result,result.request,JSON.parse(readFileSync('workers/gsf/pricing-policy.example.json','utf8')),Date.now());assert.equal(price.lines.find(i=>i.kind==='oil').chargedQuantityMilli,9000);
 }
});
