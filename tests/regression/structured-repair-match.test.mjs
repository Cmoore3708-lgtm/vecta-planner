import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchHaynesReplacement,parseHaynesReplacementRow} from '../../workers/repair-quotes/haynes-operation-match.mjs';
import {REPAIR_OPERATIONS,structuredRepairSelection} from '../../lib/repair-operation-catalogue.js';
const rows=JSON.parse(fs.readFileSync(new URL('../fixtures/repair-operation-rows.json',import.meta.url)));
const select=(partId,axle='',side='')=>({partId,axle,side,quantity:side==='both'?2:1});
const match=s=>matchHaynesReplacement({unitHoursConfirmed:true,jobs:rows[s.partId]},s);
test('generic matching identifies actual replacement rows without configured operation IDs',()=>{
 for(const [id,hours] of [['starter-motor',1600],['battery',300],['water-pump',1800],['thermostat',1100],['radiator',2100],['auxiliary-belt',300],['clutch-kit',5200],['oil-filter',200],['air-filter',100],['fuel-filter',700]])assert.equal(match(select(id)).hoursMilli,hours,id);
});
test('scope selects the complete axle/both-side operation, never a cheaper single-side or follow-up increment',()=>{
 for(const [selection,hours] of [[select('brake-pads','front'),600],[select('brake-pads','rear'),600],[select('brake-discs','front','left'),500],[select('brake-discs','front','both'),700],[select('brake-discs','rear','both'),900],[select('brake-caliper','front','both'),1300],[select('coil-spring','front','both'),1800],[select('shock-absorber','front','right'),1000],[select('track-rod-end','front','left'),700],[select('drive-shaft','rear','both'),1500]])assert.equal(match(selection).hoursMilli,hours,JSON.stringify(selection));
});
test('related components and empty results cannot become the requested fitting time',()=>{
 for(const selection of [select('alternator'),select('wheel-bearing','front','left'),select('cabin-filter')])assert.throws(()=>match(selection),/LABOUR_REVIEW_REQUIRED/);
 assert.equal(parseHaynesReplacementRow('Follow Up 1TEST00001WV0 Renew both brake discs +0.20 v'),null);
});
test('conflicting replacement times and missing units are rejected',()=>{
 const s=select('battery');assert.throws(()=>matchHaynesReplacement({jobs:rows.battery},s),/LABOUR_REVIEW_REQUIRED/);
 assert.throws(()=>matchHaynesReplacement({unitHoursConfirmed:true,jobs:['1TEST00001WV0 Renew the battery + 0.30','1TEST00002WV0 Renew the battery + 0.50']},s),/LABOUR_REVIEW_REQUIRED/);
});
test('standard request scopes reject unsupported positions and inconsistent quantities',()=>{
 assert.equal(REPAIR_OPERATIONS.length,21);assert.equal(structuredRepairSelection(select('brake-caliper','front','both')).quantity,2);
 for(const s of [{partId:'unknown',quantity:1},{...select('brake-discs','front','both'),quantity:1},{...select('battery'),axle:'front'},select('brake-pads')])assert.throws(()=>structuredRepairSelection(s));
});

import {analyseStructuredGSF,parseGSFOption} from '../../workers/repair-quotes/gsf-option-match.mjs';
import {readGSFSearchCards} from '../../workers/repair-quotes/structured-live-reader.mjs';
import {lookupRepair} from '../../workers/repair-quotes/catalogue.mjs';
import {repairRequest,calculateRepairQuote} from '../../lib/repair-quote.js';
import {parseHTML} from 'linkedom';
function card(price,description,brand='drivetec',groupDescription=description,stock='Local Branch'){
 return {text:'£'+price+' Silver '+description+' '+stock,selector:'test',images:[{src:'https://gsfappstorage.blob.core.windows.net/catalogue-assets/Brands/'+brand+'.svg'}],ancestors:[{text:groupDescription+' SKU: TEST123 In stock. Attributes Sort By Relevancy'}]};
}
function catalogue(cards){return {registration:'AB12CDE',identities:['AB12CDE'],cards,cardCount:cards.length,boundary:{loading:false,showMore:0,paginationControls:[],atBottom:true,groupSkus:['TEST123']}};}
test('GSF compares whole-job cost when one alternative is a pair and another is sold singly',()=>{
 const data=catalogue([card('108.59','Brake Disc - Front LH/RH; Vented; Coated - 315Mm','delphi'),card('113.65','Front Vented Brake Disc Pair Coated - 315Mm Diameter','drivetec','Brake Disc - Front LH/RH; Vented; Coated - 315Mm')]);
 const r=analyseStructuredGSF(data,select('brake-discs','front','both'));assert.equal(r.selected.brand,'drivetec');assert.equal(r.selected.totalCostPence,11365);assert.equal(r.selected.packsRequired,1);assert.equal(r.compatible[1].totalCostPence,21718);
});
test('GSF will not turn a partial catalogue, wrong position or conflicting dimensions into a quote',()=>{
 const data=catalogue([card('25.00','Brake Pad Set - Front LH/RH')]);data.boundary.showMore=1;assert.throws(()=>analyseStructuredGSF(data,select('brake-pads','front')),/REVIEW_REQUIRED/);
 data.boundary.showMore=0;assert.throws(()=>analyseStructuredGSF(data,select('brake-pads','rear')),/REVIEW_REQUIRED/);
 const sizes=catalogue([card('50.00','Brake Disc - Front LH/RH - 300mm'),card('60.00','Brake Disc - Front LH/RH - 315mm')]);assert.throws(()=>analyseStructuredGSF(sizes,select('brake-discs','front','both')),/REVIEW_REQUIRED/);
});
test('zero-price unavailable cards and RRP summaries cannot undercut a stocked alternative',()=>{
 const r=analyseStructuredGSF(catalogue([card('7.84','Oil Filter - Spin-On Filter'),{text:'£0.00 Bronze Out Of Stock'}, {text:'Stock Type Quantity RDC 2 £7.84 RRP: £18.51 Buy Now Add to basket 0'}]),select('oil-filter'));assert.equal(r.selected.totalCostPence,784);assert.equal(r.optionsChecked,2);
 assert.throws(()=>parseGSFOption(card('0.00','Oil Filter - Spin-On Filter')),/REVIEW_REQUIRED/);
});
test('independent SKU discovery requires a priced in-stock product card, not a category title',()=>{
 const {document}=parseHTML('<html><body><main><h1>Search Results for TEST123</h1><div><p>A8828</p><h5>Alternator - 150 Amp</h5><p>£194.74</p><p>In stock.</p><button>Add to basket</button></div></main></body></html>');
 assert.deepEqual(readGSFSearchCards(document),[{sku:'A8828',description:'Alternator - 150 Amp',costPence:19474}]);
});
test('structured lookup flows through the same evidence checks and quote calculator without vehicle-specific mappings',async()=>{
 const input={registration:'AB12CDE',selection:select('brake-pads','front')},request=repairRequest(input),stamp=new Date().toISOString();let calls=0;
 const structuredLookup=async(_,r)=>{calls++;assert.deepEqual(r,request);return {request:r,variant:'Synthetic vehicle',fitmentEvidence:'Fresh matching registration in both suppliers',catalogueComplete:true,checkedAt:stamp,parts:[{source:'GSF',registration:r.registration,variant:'Synthetic vehicle',fitmentConfirmed:true,vatBasis:'EX_VAT',sku:'TEST123',brand:'Synthetic',description:'Brake pads - Front',costPence:4501,inStock:true,checkedAt:stamp}],labour:{source:'HAYNES_PRO',registration:r.registration,variant:'Synthetic vehicle',operation:r.operation,operationId:'1TEST00001WV0',operationLabel:'Renew the front brake pads',hoursMilli:600,unit:'hours',scopeConfirmed:true,checkedAt:stamp}};};
 await assert.rejects(lookupRepair({},input,{}, {structuredLookup}),/SETTINGS_REQUIRED/);assert.equal(calls,0);
 const evidence=await lookupRepair({},input,{structuredQuotingEnabled:true},{structuredLookup});const quote=calculateRepairQuote(evidence,request);assert.equal(quote.chargedHoursMilli,1000);assert.equal(quote.labourPence,5000);assert.equal(quote.request.operation,'brake-pads-replacement');assert.equal(calls,1);
});

import {verifyStructuredProduct,completeGSFCatalogue} from '../../workers/repair-quotes/structured-live-reader.mjs';
test('independent Part Details validation rejects changed prices, brands, SKUs and insufficient stock',async()=>{
 const choice={groupSku:'TEST123',costPence:5000,totalCostPence:10000,description:'Brake Disc - Front LH/RH',brand:'drivetec',packsRequired:2};
 function pageFor(change={}){
  let url='about:blank';const details={count:async()=>1,isVisible:async()=>true},sku={count:async()=>1,click:async()=>{}};
  return {goto:async value=>{url=value;},url:()=>url,waitForTimeout:async()=>{},getByRole:role=>role==='heading'?{waitFor:async()=>{}}:role==='main'?{getByText:()=>sku}:details,evaluate:async fn=>fn.name==='readGSFSearchCards'?[{sku:'REAL123',description:choice.description,costPence:5000}]:{sku:'REAL123',description:choice.description,brand:'DriveTec',unitNetPence:5000,stock:[{quantity:2}],...change}};
 }
 const good=await verifyStructuredProduct(pageFor(),choice);assert.equal(good.totalCostPence,10000);assert.equal(good.sku,'REAL123');
 for(const change of [{unitNetPence:5100},{brand:'Other'},{sku:'OTHER'},{stock:[{quantity:1}]}])await assert.rejects(verifyStructuredProduct(pageFor(change),choice),/REVIEW_REQUIRED/);
});
test('generic catalogue reading expands alternatives and waits for stable complete evidence',async()=>{
 let more=true,captures=0;const data=catalogue([card('50.00','Oil Filter')]);
 const page={url:()=> 'https://trade.gsfcarparts.com/parts/7',getByText:()=>({count:async()=>more?1:0,nth:()=>({isVisible:async()=>true,click:async()=>{more=false;}})}),locator:()=>({press:async key=>assert.equal(key,'End')}),waitForTimeout:async()=>{},evaluate:async fn=>fn.name==='readCatalogueBoundary'?data.boundary:(captures++,data)};
 const result=await completeGSFCatalogue(page,'AB12CDE','Oil Filter');assert.equal(result.boundary.showMore,0);assert.ok(captures>=4);
});
test('markup is applied per purchased pack and pack evidence must reconcile with the requested quantity',()=>{
 const input={registration:'AB12CDE',selection:select('brake-discs','front','both')},request=repairRequest(input),stamp=new Date().toISOString();
 const raw={request,variant:'Synthetic',fitmentEvidence:'Synthetic confirmed scope',catalogueComplete:true,checkedAt:stamp,parts:[{source:'GSF',registration:request.registration,variant:'Synthetic',fitmentConfirmed:true,vatBasis:'EX_VAT',sku:'TEST123',brand:'Synthetic',description:'Brake Disc - Front LH/RH',costPence:10000,unitCostPence:5000,packsRequired:2,unitsPerPack:1,inStock:true,checkedAt:stamp}],labour:{source:'HAYNES_PRO',registration:request.registration,variant:'Synthetic',operation:request.operation,operationId:'1TEST00001WV0',operationLabel:'Renew both front brake discs',hoursMilli:700,unit:'hours',scopeConfirmed:true,checkedAt:stamp}};
 assert.equal(calculateRepairQuote(raw,request).partsPence,15000);
 raw.parts[0].packsRequired=1;assert.throws(()=>calculateRepairQuote(raw,request),/REVIEW_REQUIRED/);
});

import {readCatalogueBoundary} from '../../workers/repair-quotes/structured-live-reader.mjs';
test('catalogue completeness recognises SKU labels split across separate DOM spans',()=>{
 const {document}=parseHTML('<html><body><main><p><span>SKU:</span><span>TEST123</span></p><p><span>Show More</span></p></main></body></html>');
 const b=readCatalogueBoundary(document);assert.deepEqual(b.groupSkus,['TEST123']);assert.equal(b.showMore,1);
});
