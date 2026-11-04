import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {servicePriceHandler} from '../../api/service-price.js';
import {calculateServicePrice,publicServicePrice} from '../../lib/service-pricing.js';
import {workshopServiceResult,workshopPricingAuthorised} from '../../lib/workshop-job-pricing.js';
import {signServicePrice} from '../../lib/service-price-token.js';
const secret='a'.repeat(64),request={registration:'TEST123',service:'Interim Service',mileage:null,range:'Mid Range'};
const now=Date.now(),costs={request,recipeId:'fixture',vehicle:'Test vehicle',fuelType:'petrol',oilSpecification:'Test only',requiredKinds:['oil','oil_filter'],fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date(now).toISOString(),items:[
{kind:'oil',sku:'OIL',brand:'Test',description:'Oil 5L',quantityMilli:6700,unitNetPence:800,packNetPence:4000,packQuantityMilli:5000,vatBasis:'EX_VAT',inStock:true},
{kind:'oil_filter',sku:'FILTER',brand:'Test',description:'Oil filter',quantityMilli:1000,unitNetPence:500,vatBasis:'EX_VAT',inStock:true}]};
const policy={version:'fixture',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':10000}};
const quote=signServicePrice(publicServicePrice(calculateServicePrice(costs,request,policy,now)),secret,now,costs);
test('workshop service costs use encrypted signed snapshot and keep oil pack quantity',()=>{
 const result=workshopServiceResult({status:'MATCHED',quote},secret);
 assert.equal(result.parts[0].cost_price,40);assert.equal(result.parts[0].quantity,2);assert.equal(result.parts[1].cost_price,5);
});
test('unauthenticated workshop requests fail before queue access, public quote omits costs',async()=>{
 const old={...process.env};Object.assign(process.env,{VECTA_MAIN_USER:'fixture',VECTA_MAIN_PASSWORD:'fixture'});
 let queued=0;
 const handler=servicePriceHandler({env:{GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_QUOTE_SECRET:secret,GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy)},queue:async()=>{queued++;return{status:'MATCHED',result:costs};}});
 const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(data){this.body=data;return this;}});
 try{
  const privateRes=res();await handler({method:'POST',headers:{},body:{...request,workshop:true}},privateRes);assert.equal(privateRes.code,401);assert.equal(queued,0);
  const publicRes=res();await handler({method:'POST',headers:{},body:request},publicRes);assert.equal(publicRes.body.status,'MATCHED');assert.equal(publicRes.body.parts,undefined);
  const headers={authorization:'Basic '+Buffer.from('fixture:fixture').toString('base64'),host:'example.invalid','x-vecta-workshop':'1'};
  assert.equal(await workshopPricingAuthorised({headers}),true);
  assert.equal(await workshopPricingAuthorised({headers:{...headers,origin:'https://other.invalid'}}),false);
  const authorised=res();await handler({method:'POST',headers,body:{...request,workshop:true}},authorised);assert.equal(authorised.body.parts[1].cost_price,5);
 }finally{process.env=old;}
});
function ui(fetcher){
 const {document,window}=parseHTML('<html><body><div id="editor"><input id="job_registration" value="TEST123"><input id="job_job_type" value="Interim Service"><input id="job_vat_mode" value="inc_vat"><section><div id="jobPartsEditor"></div></section><div id="privatePricingRows"></div></div></body></html>');
 let savedParts=[],prices=[];
 const root={document,esc:String,jobTypeValues:v=>v.split(','),jobPartsRangeDisplay:()=>'',gatherJobPartsEditor:()=>savedParts,gatherPrivatePricingItems:()=>prices,jobPartsEditorHtml:j=>{savedParts=JSON.parse(decodeURIComponent(j.customer_note.match(/URI:(.*?)\]\]/)[1]));return '<div id="jobPartsEditor"></div>';},bindJobPartsEditor(){},privatePricingRowHtml:item=>'<div><input class="privatePriceDescription" value="'+item.description+'"><input class="privatePriceAmount"></div>',bindPrivatePricing(){},syncPrivatePricingTotal(){prices=Array.from(document.querySelectorAll('#privatePricingRows > div')).map(r=>({description:r.querySelector('.privatePriceDescription').value,price:Number(r.querySelector('.privatePriceAmount').value)}));}};
 const ctx={window:root,document,fetch:fetcher,AbortController,AbortSignal,setTimeout,clearTimeout,Date,console};vm.runInNewContext(readFileSync('public/js/vecta-job-pricing.js','utf8'),ctx);
 root.VectaJobPricing.install({});return{root,document,parts:()=>savedParts,prices:()=>prices};
}
const tick=()=>new Promise(r=>setTimeout(r,20));
test('service selection fills parts and retail amount; stale results cannot change another job',async()=>{
 const result=workshopServiceResult({status:'MATCHED',quote},secret);
 const app=ui(async()=>({ok:true,json:async()=>result}));app.root.VectaJobPricing.selected('Interim Service',true);await tick();
 assert.equal(app.parts()[1].cost_price,5);assert.equal(app.prices()[0].price,quote.totalPence/100);
 let resolve;const pending=ui(()=>new Promise(r=>{resolve=r;}));pending.root.VectaJobPricing.selected('Interim Service',true);
 pending.document.getElementById('editor').remove();resolve({ok:true,json:async()=>result});await tick();assert.equal(pending.parts().length,0);
});
test('ex VAT job lines convert retail price exactly once',async()=>{
 const app=ui(async()=>({ok:true,json:async()=>workshopServiceResult({status:'MATCHED',quote},secret)}));app.document.getElementById('job_vat_mode').value='ex_vat';
 app.root.VectaJobPricing.selected('Interim Service',true);await tick();assert.equal(app.prices()[0].price,Number((quote.totalPence/120).toFixed(2)));
});

test('tyre selection recovers private cost and rejects changed retail price',async()=>{
 const {attachTyreCosts}=await import('../../lib/tyre-cost-token.js');
 const {workshopTyreResult}=await import('../../lib/workshop-job-pricing.js');
 const choice={category:'budget',available:true,brand:'ACCELERA',model:'PHI',unitPence:6000,totalPence:12000};
 const guide=attachTyreCosts({size:'205/55R16',quantity:2,checkedAt:new Date().toISOString(),options:[{...choice,choices:[choice]}]},[{size:'205/55R16',brand:'ACCELERA',model:'PHI',unitPence:6000,costNetPence:2100,defaultStockMinimum:4}],secret);
 const selected={...guide.options[0].choices[0],size:guide.size,quantity:2};
 const body={tyre_size:guide.size,tyre_quantity:2,tyre_choice:'budget',tyre_brand:'ACCELERA',tyre_guide:selected};
 const result=workshopTyreResult(body,secret);assert.equal(result.totalPence,12000);assert.equal(result.parts[0].quantity,2);assert.equal(result.parts[0].cost_price,21);
 assert.throws(()=>workshopTyreResult({...body,tyre_guide:{...selected,unitPence:100}},secret),/MISMATCH/);
 assert.throws(()=>workshopTyreResult({...body,tyre_guide:{...selected,costToken:null}},secret));
});
