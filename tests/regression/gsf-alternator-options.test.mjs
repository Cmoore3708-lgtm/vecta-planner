import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseAlternatorOptions} from '../../workers/gsf/alternator-options.mjs';
// Values and labels observed in the 26 October workshop-PC capture. This fixture
// is not a new live supplier lookup and cannot establish fitment/completeness.
const rows=[['194.74','Silver','Alternator - 150 Amp','Local Branch','drivetec'],['215.32','Gold','Alternator - 150 Amp','RDC','lucas'],['361.63','Gold','Alternator','Branch Network','denso'],['191.12','Gold','Alternator - 150 Amp','Out Of Stock','elstock'],['156.74','Silver','Alternator - 150 Amp','Out Of Stock','wai'],['382.12','Silver','Alternator','Out Of Stock','autoelectro']];
const snapshot=()=>({candidateCount:rows.length,candidates:rows.map(([price,quality,description,stock,brand])=>({ancestors:[{depth:1,text:`£${price} ${quality} ${description} ${stock}`,images:[{src:`https://gsfappstorage.blob.core.windows.net/catalogue-assets/Brands/${brand}.svg`}]},{depth:5,text:'Alternator - 150 Amp SKU: DREA8828 In stock.',images:[{src:'https://gsfappstorage.blob.core.windows.net/catalogue-assets//ProductImages/WAI/21126N_B1.jpg'}]}]}))});
test('observed available alternator comparison excludes cheaper out-of-stock options',()=>{
 const result=analyseAlternatorOptions(snapshot());assert.equal(result.options.length,6);assert.equal(result.cheapestDisplayedAvailable.brand,'DriveTec');assert.equal(result.cheapestDisplayedAvailable.costPence,19474);assert.equal(result.options.filter(row=>row.displayedAvailable).length,3);
 assert.equal(result.displayedGroupSku,'DREA8828');assert.match(result.imageUrl,/21126N_B1/);assert.equal(result.catalogueComplete,false);assert.equal(result.fitmentConfirmed,false);assert.equal(result.verifiedPart,null);assert.ok(result.options.every(row=>!('sku' in row)));
});
test('unknown stock, missing brand, zero price and truncated diagnostic require review',()=>{
 for(const change of [s=>s.candidates[0].ancestors[0].text='£194.74 Silver Alternator - 150 Amp Maybe available',s=>s.candidates[0].ancestors[0].images=[],s=>s.candidates[0].ancestors[0].text='£0.00 Silver Alternator Local Branch',s=>s.candidateCount++]){const data=snapshot();change(data);assert.throws(()=>analyseAlternatorOptions(data),/REVIEW_REQUIRED/);}
});
test('expanded group accounts for four unavailable zero-price cards without treating them as free parts',()=>{
 const s=snapshot(),text=rows.map(([price,quality,description,stock])=>`£${price} ${quality} ${description} ${stock}`).join(' ')+(' £0.00 Bronze Out Of Stock'.repeat(4))+' Show Less';
 s.candidates[0].ancestors.push({depth:2,text,images:[]});
 const result=analyseAlternatorOptions(s);assert.equal(result.options.length,6);assert.equal(result.unpricedUnavailableCount,4);assert.equal(result.displayedOptionCount,10);assert.equal(result.expandedGroupOptionsCount,10);assert.equal(result.cheapestDisplayedAvailable.costPence,19474);assert.equal(result.catalogueComplete,false);
 for(const bad of [text.replace('£0.00 Bronze Out Of Stock','£0.00 Bronze Local Branch'),text.replace('£194.74','£194.75'),text.replace(' Show Less',' unknown card Show Less')]){s.candidates[0].ancestors.at(-1).text=bad;assert.throws(()=>analyseAlternatorOptions(s),/REVIEW_REQUIRED/);}
});
test('known brand text replaces a missing logo and reconciles branded unavailable cards',()=>{
 const s=snapshot();const auto=s.candidates[5].ancestors[0];auto.text=auto.text.replace('£382.12 Silver','£382.12 AUTOELECTRO Silver');auto.images=[];
 const text=s.candidates.map(c=>c.ancestors[0].text).join(' ')+' £0.00 Bronze Out Of Stock £0.00 NK Bronze Out Of Stock £0.00 Bronze Out Of Stock £0.00 AUTOELECTRO Bronze Out Of Stock Show Less';
 s.candidates[0].ancestors.push({depth:2,text,images:[]});
 const result=analyseAlternatorOptions(s);assert.equal(result.options[5].brand,'Autoelectro');assert.equal(result.displayedOptionCount,10);assert.equal(result.cheapestDisplayedAvailable.brand,'DriveTec');assert.equal(result.cheapestDisplayedAvailable.costPence,19474);
 auto.images=[{src:'https://gsfappstorage.blob.core.windows.net/catalogue-assets/Brands/lucas.svg'}];assert.throws(()=>analyseAlternatorOptions(s),/REVIEW_REQUIRED/);
 auto.images=[];auto.text=auto.text.replace('AUTOELECTRO','UNKNOWN');assert.throws(()=>analyseAlternatorOptions(s),/REVIEW_REQUIRED/);
});
