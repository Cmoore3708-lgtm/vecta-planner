// Offline arithmetic and package check. All costs below are synthetic examples.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateServicePrice,SERVICES} from '../../lib/service-pricing.js';
const policy=JSON.parse(readFileSync(new URL('./pricing-policy.example.json',import.meta.url),'utf8'));
assert.equal(policy.markupBps,5000);
const part=(kind,cost,quantityMilli=1000)=>({kind,sku:'DEMO-'+kind,brand:'Example',description:kind,unitNetPence:cost,quantityMilli,vatBasis:'EX_VAT',inStock:true});
for(const [service,expected]of SERVICES.map((service,i)=>[service,[9600,17760,27960][i]])) {
  const request={registration:'DEMO001',service,mileage:null,range:'Mid Range'};
  const items=[part('oil',500,5000),part('oil_filter',500)];
  if(service!=='Oil & Filter Change')items.push(part('air_filter',1200),part('cabin_filter',1000));
  if(service==='Major Service')items.push(part('spark_plug',3000));
  const result={request,recipeId:'offline-example',vehicle:'Synthetic example only',oilSpecification:'Synthetic example only',
    requiredKinds:items.map(item=>item.kind),items,fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date().toISOString()};
  const price=calculateServicePrice(result,request,policy);
  assert.equal(price.totalPence,expected);
  console.log(service+': GBP '+(price.totalPence/100).toFixed(2)+' including VAT (synthetic costs).');
}
console.log('PASS: package imports, 50% markup, preset labour and VAT arithmetic. This is not a live GSF or vehicle-fitment test.');

