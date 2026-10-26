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
