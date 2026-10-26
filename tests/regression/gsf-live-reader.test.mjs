import test from 'node:test';
import assert from 'node:assert/strict';
import {readLiveGSFAlternator} from '../../workers/repair-quotes/gsf-live-reader.mjs';
import {cleanRepairEvidence,repairRequest} from '../../lib/repair-quote.js';
const request=repairRequest({registration:'FV65JTY',work:'Supply and fit alternator'}),stamp='2026-10-26T10:39:43.830Z';
const mapping={registration:request.registration,variant:'Reviewed synthetic variant',gsfIdentity:'FV65JTY Clear',gsfPart:{searchTerm:'DREA8828',sku:'A8828',brand:'DriveTec',description:'Alternator - 150 Amp'}};
function fixture(){
 const rows=[['194.74','Local Branch','drivetec'],['156.74','Out Of Stock','wai']];
 const snapshot={registration:request.registration,identities:[{text:'FV65JTY Clear'}],candidateCount:2,candidates:rows.map(([cost,stock,brand])=>({ancestors:[{depth:1,text:`£${cost} Silver Alternator - 150 Amp ${stock}`,images:[{src:`https://gsfappstorage.blob.core.windows.net/catalogue-assets/Brands/${brand}.svg`}]},{depth:2,text:'SKU: DREA8828',images:[]}]}))};
 const selected={sku:'A8828',brand:'DriveTec',description:'Alternator - 150 Amp',unitNetPence:19474,vatBasis:'EX_VAT',inStock:true,imageUrl:'https://example.com/part.jpg',gsfUrl:'https://trade.gsfcarparts.com/enhancedSearch/DREA8828',checkedAt:stamp,priceMatchesCatalogue:true};
 const nav={status:'AUTOMATIC_CATEGORY_REACHED',registrationSubmitted:true,observed:{selectedRegistration:true,categoryPathMatched:true}};
 const count={count:async()=>1,isVisible:async()=>true,innerText:async()=> '2'};
 let reads=0;
 return {snapshot,selected,nav,count,page:{locator:()=>count},options:{navigate:async()=>nav,expand:async()=>snapshot,verify:async()=>{reads++;return selected;},now:()=>Date.parse(stamp)},reads:()=>reads};
}
test('live reader supplies relay-valid evidence only after fresh vehicle, explicit count and selected SKU checks',async()=>{
 const f=fixture(),result=await readLiveGSFAlternator(f.page,request,mapping,{totalCount:'.reviewed-count'},f.options);
 assert.equal(result.alternativesChecked,2);assert.equal(result.parts[0].sku,'A8828');assert.equal(result.parts[0].costPence,19474);assert.equal(f.reads(),1);
 const evidence=cleanRepairEvidence({...result,request,variant:mapping.variant,fitmentEvidence:'Synthetic approved mapping',checkedAt:stamp,labour:{source:'HAYNES_PRO',registration:request.registration,variant:mapping.variant,operation:request.operation,operationId:'synthetic-job',operationLabel:'Renew alternator',hoursMilli:700,unit:'hours',scopeConfirmed:true,checkedAt:stamp}},request,{now:Date.parse(stamp)});
 assert.equal(evidence.parts[0].gsfUrl,f.selected.gsfUrl);
});
test('missing or ambiguous count, partial catalogue, wrong vehicle and unsubmitted registration stop before SKU verification',async()=>{
 for(const mutate of [f=>f.count.count=async()=>0,f=>f.count.count=async()=>2,f=>f.count.isVisible=async()=>false,f=>f.count.innerText=async()=> '3',f=>f.count.innerText=async()=> '2 products',f=>f.snapshot.candidateCount=3,f=>f.snapshot.identities.push({text:'FV65JTY Clear'}),f=>f.snapshot.identities[0].text='WRONG Clear',f=>f.snapshot.registration='WRONG',f=>f.nav.registrationSubmitted=false,f=>f.nav.observed.selectedRegistration=false]){
  const f=fixture();mutate(f);await assert.rejects(readLiveGSFAlternator(f.page,request,mapping,{totalCount:'.count'},f.options),/REVIEW_REQUIRED/);assert.equal(f.reads(),0);
 }
 const f=fixture();await assert.rejects(readLiveGSFAlternator(f.page,request,mapping,{},f.options),/SETTINGS_REQUIRED/);assert.equal(f.reads(),0);
});
test('changed cheapest part must be remapped and reviewed rather than substituting its SKU',async()=>{
 for(const change of [{unitNetPence:19000},{sku:'OTHER'},{brand:'Lucas'},{priceMatchesCatalogue:false}]){const f=fixture();Object.assign(f.selected,change);await assert.rejects(readLiveGSFAlternator(f.page,request,mapping,{totalCount:'.count'},f.options),/REVIEW_REQUIRED/);}
});
