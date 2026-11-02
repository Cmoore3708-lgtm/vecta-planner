import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {readEspGrid} from '../../workers/tyres/esp-dom.mjs';
import {parseEspProduct} from '../../workers/tyres/esp-normalise.mjs';
import {cleanTyreCatalogue} from '../../lib/tyre-relay-contract.js';
import {selectCatalogueGuides} from '../../workers/tyres/tiers.mjs';
import {attachTyreCosts,bookingTyreParts} from '../../lib/tyre-cost-token.js';
import book from '../../api/website-booking.js';
import {signServicePrice} from '../../lib/service-price-token.js';
import {publicServicePrice,calculateServicePrice} from '../../lib/service-pricing.js';
const secret='a'.repeat(64),size='205/55R16',quantity=2;
const settings={showSellout:true,vatIncluded:true,priceList:'Vecta',multiplier:1};
function catalogue(cost='£20.86'){
 const {document}=parseHTML(`<table id="OrderWindowGrid"><tr><th>Product</th><th>Default</th><th>Cost</th><th>Sellout</th></tr><tr><td>${size} COMFORSER CF510 91V</td><td>4</td><td>${cost}</td><td>£62.00</td></tr></table>`);
 return readEspGrid(document).products.map(row=>parseEspProduct(row));
}
function publicGuide(rows=catalogue(),checkedAt=new Date().toISOString()){
 const data=cleanTyreCatalogue({size,checkedAt,catalogue:rows,settings},size,Date.parse(checkedAt));
 return {status:'MATCHED',...attachTyreCosts(selectCatalogueGuides(data.catalogue,{size,quantity,settings,now:Date.parse(checkedAt)}),data.catalogue,secret)};
}
function selection(result=publicGuide()){
 const ctx={Date};vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-tyre-booking.js',import.meta.url),'utf8'),ctx);
 const guide=ctx.VectaTyreBooking.cleanResult(result,size,quantity);
 return {...guide.options[0].choices[0],size,quantity,checkedAt:guide.checkedAt};
}
function body(guide=selection()){return{job_types:['Tyres'],tyre_size:size,tyre_quantity:quantity,tyre_choice:'Budget',tyre_brand:'COMFORSER',tyre_positions:['Front left','Front right'],tyre_guide:guide};}
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('supplier grid → private relay → public selection → booking cost keeps unit cost and quantity separate',()=>{
 const result=publicGuide();assert.equal(result.options[0].unitPence,6200);assert.equal(result.options[0].totalPence,12400);
 assert.doesNotMatch(JSON.stringify(result),/costNetPence|20\.86/);
 const parts=bookingTyreParts(body(),['Tyres'],secret);
 assert.equal(parts[0].cost_price,20.86);assert.equal(parts[0].quantity,2);assert.match(parts[0].description,/205\/55R16 COMFORSER CF510 91V.*Front left, Front right/);assert.equal(parts[0].ordered,false);
});
test('missing, malformed and conflicting trade costs remain unavailable, never derived from retail',()=>{
 for(const cost of ['', 'N/A', '£0.00','£-1.00'])assert.equal(bookingTyreParts(body(selection(publicGuide(catalogue(cost)))),['Tyres'],secret)[0].cost_price,null);
 const rows=catalogue();rows.push({...rows[0],costNetPence:9999});
 const part=bookingTyreParts(body(selection(publicGuide(rows))),['Tyres'],secret)[0];assert.equal(part.cost_price,null);assert.match(part.description,/Supplier cost unavailable/);
 const legacy=body();delete legacy.tyre_guide.costToken;legacy.tyre_guide.costNetPence=1;legacy.gsf_parts=[{cost_price:.01}];assert.equal(bookingTyreParts(legacy,['Tyres'],secret)[0].cost_price,null);
 assert.deepEqual(bookingTyreParts(body(),['MOT'],secret),[]);
});
test('altered ciphertext, size, brand, model, quantity, tier and expired receipts are rejected',()=>{
 for(const field of ['size','brand','model','quantity','category','unitPence']){const b=body();b.tyre_guide[field]='changed';assert.throws(()=>bookingTyreParts(b,['Tyres'],secret),field);}
 for(const field of ['tyre_size','tyre_quantity','tyre_choice','tyre_brand']){const b=body();b[field]='changed';assert.throws(()=>bookingTyreParts(b,['Tyres'],secret),field);}
 const b=body();b.tyre_guide.costToken=(b.tyre_guide.costToken[0]==='x'?'y':'x')+b.tyre_guide.costToken.slice(1);assert.throws(()=>bookingTyreParts(b,['Tyres'],secret));
 assert.throws(()=>bookingTyreParts(body(),['Tyres'],secret,Date.now()+31*60000));
});
test('booking API → saved request → actual Workshop Pro job card → save and reopen retains tyre costs',async()=>{
 const oldEnv={...process.env},oldFetch=globalThis.fetch;
 Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'workflow-test',VERCEL_PROJECT_PRODUCTION_URL:'workflow.invalid',VITE_SUPABASE_URL:'https://workflow.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',GSF_SERVICE_QUOTE_SECRET:secret});
 let stored,writes=0;
 try{
  globalThis.fetch=async(url,opts={})=>{assert.equal(new URL(url).hostname,'workflow.invalid');let rows=[];if(new URL(url).pathname.endsWith('/website_booking_requests')&&opts.method==='POST'){stored=JSON.parse(opts.body);writes++;rows=[stored];}return{ok:true,status:200,json:async()=>rows};};
  const b={...body(),request_id:'12345678-1234-4123-8123-123456789abc',customer_name:'Synthetic',email:'test@example.invalid',phone:'000',registration:'TEST123',vehicle:'Synthetic',work_required:'Fit two tyres',appointment_date:'2050-01-04'};
  const res=response();await book({method:'POST',body:b},res);assert.equal(res.code,201);assert.equal(writes,1);assert.equal(stored.gsf_parts[0].cost_price,20.86);assert.doesNotMatch(JSON.stringify(res.body),/20\.86|cost_price|costToken/);
  const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  function extract(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let end=html.indexOf('\nfunction ',start+1),next=html.indexOf('\nasync function ',start+1);if(next>=0&&(end<0||next<end))end=next;return(name==='createJobFromWebsiteRequest'?'async ':'')+html.slice(start,end);}
  let draft;const ctx={app:{websiteRequests:[stored],jobs:[]},remoteClient:null,websiteRequestCreateBusy:{},uid:()=>'test-job',vectaJobIsDeletedForLists:()=>false,normReg:x=>x,normaliseJobTypeKey:x=>String(x).toLowerCase(),isRetiredMajorService:()=>false,jobTypeStorageValue:types=>types.join(', '),jobTypeValues:j=>[j.job_type],templateDataForType:()=>({}),openWebsiteRequestJobCard:(_,j)=>{draft=j;},selectedIso:()=> '2050-01-04',esc:String,jobPartsRangeDisplay:()=>'',select:()=>'',partsStatusFromJob:()=>'',PARTS_STATUS_VALUES:[],Date,decodeURIComponent,encodeURIComponent};
  vm.createContext(ctx);for(const name of ['websiteRequestNote','isWebsiteBookingJob','applyWebsiteDefaultService','jobParts','noteWithJobParts','jobPartsEditorHtml','createJobFromWebsiteRequest'])vm.runInContext(extract(name),ctx);
  await ctx.createJobFromWebsiteRequest(stored.id);assert.ok(draft);
  const reopened=JSON.parse(JSON.stringify(draft)),parts=ctx.jobParts(reopened);assert.equal(parts[0].cost_price,20.86);assert.equal(parts[0].quantity,2);
  const {document}=parseHTML(ctx.jobPartsEditorHtml(reopened));assert.equal(document.querySelector('[data-part-cost-price]').getAttribute('value'),'20.86');
  const request={registration:'TEST123',service:'Oil & Filter Change',mileage:null,range:'Mid Range'};
  const costs={request,recipeId:'synthetic',vehicle:'Synthetic',fuelType:'petrol',oilSpecification:'Synthetic',requiredKinds:['oil','oil_filter'],fitmentVerified:true,scopeVerified:true,oilVerified:true,checkedAt:new Date().toISOString(),items:[{kind:'oil',sku:'OIL',brand:'Synthetic',description:'Oil',quantityMilli:4000,unitNetPence:1000,vatBasis:'EX_VAT',inStock:true},{kind:'oil_filter',sku:'FILTER',brand:'Synthetic',description:'Oil filter',quantityMilli:1000,unitNetPence:500,vatBasis:'EX_VAT',inStock:true}]};
  const policy={version:'synthetic',markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Oil & Filter Change':3000,'Full Service':6000,'Major Service':10000}};
  const quote=signServicePrice(publicServicePrice(calculateServicePrice(costs,request,policy)),secret,Date.now(),costs);
  const combined={...b,request_id:'22345678-1234-4123-8123-123456789abc',job_types:['Oil & Filter Change','Tyres'],service_choice:request.service,parts_range:'Mid Range',mileage_unknown:true,service_price_token:quote.token};
  const mixed=response();await book({method:'POST',body:combined},mixed);assert.equal(mixed.code,201);assert.equal(stored.gsf_parts.length,3);assert.equal(stored.gsf_parts.at(-1).cost_price,20.86);assert.equal(stored.gsf_parts[1].cost_price,5);
  b.tyre_quantity=4;const rejected=response();await book({method:'POST',body:b},rejected);assert.equal(rejected.code,409);assert.equal(writes,2);
 }finally{globalThis.fetch=oldFetch;process.env=oldEnv;}
});
