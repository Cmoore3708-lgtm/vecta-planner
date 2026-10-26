import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serviceCoverage,serviceCoverageMarkdown} from '../../workers/gsf/service-readiness.mjs';
const now=Date.parse('2026-10-26T10:00:00Z');
const input={vehicles:Array.from({length:10},(_,i)=>({registration:'DEMO'+String(i).padStart(3,'0'),mileage:50000,range:'Mid Range'}))};
const part=kind=>({kind,sku:'TEST-'+kind,brand:'Test',description:'Test',searchTerm:'TEST-'+kind,quantityMilli:kind==='oil'?4500:1000,
  packQuantityMilli:kind==='oil'?5000:1000,vatBasis:'EX_VAT',vatEvidence:'Synthetic test evidence'});
const recipe=()=>({id:'synthetic-test',registration:'DEMO000',vehicle:'Synthetic test vehicle',service:'Oil & Filter Change',range:'Mid Range',
  approved:true,reviewedAt:new Date(now).toISOString(),minimumMileage:40000,maximumMileage:60000,allowUnknownMileage:false,
  oilSpecification:'Synthetic oil specification',oilSource:'Synthetic Haynes review',scopeSource:'Synthetic reviewed scope',fitmentSource:'Synthetic fitment review',
  requiredKinds:['oil','oil_filter'],items:[part('oil'),part('oil_filter')]});
const config=r=>({calibrationApproved:true,lookupMode:'approved-skus',recipes:[r]});
test('offline coverage checks all ten cars and thirty services without inventing prices',()=>{
  const report=serviceCoverage(input,null,now);
  assert.equal(report.vehicleCount,10);assert.equal(report.serviceCount,30);assert.equal(report.readyForLiveCheck,0);assert.equal(report.verifiedPrices,0);
  assert.equal(JSON.stringify(report).includes('totalPence'),false);
  const markdown=serviceCoverageMarkdown(report);assert.match(markdown,/0 of 30/);assert.match(markdown,/shared GSF worker/);
  assert.doesNotMatch(markdown,/£0\.00/);
});
test('reviewed evidence means ready for a live check, never a verified quote',()=>{
  const report=serviceCoverage(input,config(recipe()),now);
  assert.equal(report.readyForLiveCheck,1);assert.equal(report.verifiedPrices,0);
  assert.equal(report.rows[0].services['Oil & Filter Change'].status,'READY_FOR_LIVE_PRICE_CHECK');
  assert.equal(report.rows[0].services['Full Service'].status,'NEEDS_VERIFICATION');
});
test('coverage reports missing oil, fitment and stale review without blocking unknown mileage',()=>{
  for(const [patch,issue] of [[{oilSource:''},'OIL_SPECIFICATION_EVIDENCE_MISSING'],[{fitmentSource:''},'VEHICLE_FITMENT_EVIDENCE_MISSING'],
    [{reviewedAt:'2026-08-01'},'MAPPING_REVIEW_EXPIRED'],[{approved:false},'MAPPING_REVIEW_PENDING'],
    [{items:[part('oil_filter')]},'SERVICE_PARTS_INCOMPLETE']]) {
    const report=serviceCoverage(input,config({...recipe(),...patch}),now);
    assert.equal(report.readyForLiveCheck,0);assert.ok(report.rows[0].services['Oil & Filter Change'].issues.includes(issue));
  }
  const unknown={vehicles:input.vehicles.map(v=>({...v,mileage:null}))};
  assert.equal(serviceCoverage(unknown,config(recipe()),now).readyForLiveCheck,1);
  assert.equal(serviceCoverage(input,config({...recipe(),maximumMileage:49000}),now).readyForLiveCheck,1);
  assert.equal(serviceCoverage(unknown,config({...recipe(),scopeSource:''}),now).readyForLiveCheck,1);
});
test('major readiness requires known fuel type and a diesel fuel filter but rejects automatic petrol plugs',()=>{
  const major={...recipe(),service:'Major Service',fuelType:'diesel',requiredKinds:['oil','oil_filter','air_filter','cabin_filter','fuel_filter'],
    items:['oil','oil_filter','air_filter','cabin_filter','fuel_filter'].map(part)};
  assert.equal(serviceCoverage(input,config(major),now).readyForLiveCheck,1);
  assert.equal(serviceCoverage(input,config({...major,fuelType:''}),now).readyForLiveCheck,0);
  assert.equal(serviceCoverage(input,config({...major,items:major.items.filter(item=>item.kind!=='fuel_filter')}),now).readyForLiveCheck,0);
  const petrol={...major,fuelType:'petrol',requiredKinds:major.requiredKinds.filter(kind=>kind!=='fuel_filter'),items:major.items.filter(item=>item.kind!=='fuel_filter')};
  assert.equal(serviceCoverage(input,config(petrol),now).readyForLiveCheck,1);
  assert.equal(serviceCoverage(input,config({...petrol,items:[...petrol.items,part('spark_plug')],requiredKinds:[...petrol.requiredKinds,'spark_plug']}),now).readyForLiveCheck,0);
});
test('the staged comparison contains the ten previously selected Workshop Pro registrations',()=>{
  const selected=JSON.parse(readFileSync(new URL('../../workers/gsf/comparison-input.example.json',import.meta.url),'utf8'));
  assert.deepEqual(selected.vehicles.map(v=>v.registration).sort(),['NU67VSE','FV65JTY','NJ66GXH','LS10PET','KE65BPK','PA14GEO','KX58PNV','NA63UKO','PO11YFC','JH08URN'].sort());
  assert.ok(selected.vehicles.every(v=>v.mileage===null));
  assert.equal(serviceCoverage(selected,null,now).readyForLiveCheck,0);
});
