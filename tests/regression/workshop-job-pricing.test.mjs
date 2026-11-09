import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {workshopEstimate} from '../../lib/workshop-estimate-math.js';
import {workshopAllowances,offlineWorkshopPolicy} from '../../lib/workshop-estimate-defaults.js';
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
function ui(fetcher,initial=[],isNewJob=false){
 const {document,window}=parseHTML('<html><body><div id="editor"><input id="job_registration" value="TEST123"><input id="job_job_type" value="Interim Service"><input id="job_vat_mode" value="inc_vat"><input id="job_engine_size" value="1198"><div id="servicePricingAdvisor">Full Service estimate £140.00</div><section><div id="jobPartsEditor"></div></section><div id="privatePricingRows"></div></div></body></html>');
 let savedParts=initial,prices=[];
 const root={document,vectaOfflineServiceEstimate:request=>workshopEstimate(request,[],workshopAllowances,offlineWorkshopPolicy),VECTA_SERVICE_PRICING:{quote:()=>({price:140})},esc:String,jobTypeValues:v=>v.split(','),jobPartsRangeDisplay:()=>'',gatherJobPartsEditor:()=>savedParts,gatherPrivatePricingItems:()=>prices,jobPartsEditorHtml:j=>{savedParts=JSON.parse(decodeURIComponent(j.customer_note.match(/URI:(.*?)\]\]/)[1]));return '<div id="jobPartsEditor"></div>';},bindJobPartsEditor(){},privatePricingRowHtml:item=>'<div><input class="privatePriceDescription" value="'+item.description+'"><input class="privatePriceAmount"></div>',bindPrivatePricing(){},syncPrivatePricingTotal(){prices=Array.from(document.querySelectorAll('#privatePricingRows > div')).map(r=>({description:r.querySelector('.privatePriceDescription').value,price:Number(r.querySelector('.privatePriceAmount').value)}));}};
 const api={};for(const name of ['jobTypeValues','jobPartsRangeDisplay','gatherJobPartsEditor','gatherPrivatePricingItems','jobPartsEditorHtml','bindJobPartsEditor','privatePricingRowHtml','bindPrivatePricing','syncPrivatePricingTotal']){api[name]=root[name];delete root[name];}
 const createElement=document.createElement.bind(document);document.createElement=name=>{const node=createElement(name);if(name==='dialog'){node.showModal=()=>{};node.close=()=>{};}return node;};
 const ctx={window:root,document,fetch:fetcher,AbortController,AbortSignal,setTimeout,clearTimeout,Date,console};vm.runInNewContext(readFileSync('public/js/vecta-job-pricing.js','utf8'),ctx);
 for(const file of ['vecta-tyre-booking.js','vecta-tyre-positions.js'])vm.runInNewContext(readFileSync('public/js/'+file,'utf8'),ctx);
 root.VectaJobPricing.install({},api,isNewJob);return{root,document,api,parts:()=>savedParts,prices:()=>prices};
}
const tick=()=>new Promise(r=>setTimeout(r,20));
test('opening saved service cards never requests GSF, including restored plate input events',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const service of ['Interim Service','Full Service']){
  for(const label of ['GSF','estimate','manual','']){
   let requests=0;
   const parts=label?[{id:'saved-filter',description:'Oil filter',cost_price:7.25,ordered:true}]:[];
   const app=ui(()=>{requests++;return new Promise(()=>{});},structuredClone(parts));
   app.document.getElementById('job_job_type').value=service;
   const editor=app.document.getElementById('editor');
   const rows=app.document.getElementById('privatePricingRows');
   if(label)rows.innerHTML='<div><input class="privatePriceDescription" value="'+service+' — '+label+'"><input class="privatePriceAmount" value="175.00"></div>';
   for(let open=0;open<2;open++){
    // Each openJobModal replaces the form's nodes before installing pricing.
    editor.querySelector('.job-live-pricing').remove();
    editor.innerHTML=editor.innerHTML;
    app.root.VectaJobPricing.install({id:'booked-service',registration:'TEST123'},app.api,false);
    const reg=app.document.getElementById('job_registration');
    for(const plate of ['TEST123','','TEST 123']){
     reg.value=plate;reg.dispatchEvent(new app.document.defaultView.Event('input'));
     t.mock.timers.tick(750);
    }
    assert.equal(requests,0,service+' '+(label||'unpriced'));
    assert.deepEqual(app.parts(),parts);
    assert.equal(app.document.querySelector('.privatePriceAmount')?.value,label?'175.00':undefined);
    assert.equal(app.document.querySelector('.job-live-pricing.is-checking'),null);
   }
   app.document.querySelector('[data-service]').click();
   assert.equal(requests,1,'manual refresh starts one request');
  }
 }
});
test('entering a plate after selecting a service or starting a prefilled new job requests pricing once',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const isNewJob of [false,true]){
  let requests=0;
  const app=ui(()=>{requests++;return new Promise(()=>{});},[],isNewJob);
  const reg=app.document.getElementById('job_registration');
  reg.value='';reg.dispatchEvent(new app.document.defaultView.Event('input'));
  if(!isNewJob)app.root.VectaJobPricing.selected('Interim Service',true);
  assert.equal(requests,0);
  for(const plate of ['AB12','AB12CDE','AB12 CDE']){
   reg.value=plate;reg.dispatchEvent(new app.document.defaultView.Event('input'));
  }
  t.mock.timers.tick(750);
  assert.equal(requests,1);
  reg.dispatchEvent(new app.document.defaultView.Event('input'));
  t.mock.timers.tick(750);
  assert.equal(requests,1);
 }
});
test('closing and reopening a card during a pending lookup stops the previous poll',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let requests=0;
 const app=ui(async()=>{requests++;return {ok:true,json:async()=>({status:'PENDING'})};});
 app.document.querySelector('[data-service]').click();
 await new Promise(setImmediate);
 assert.equal(requests,1);
 const form=app.document.getElementById('editor');
 form.querySelector('.job-live-pricing').remove();
 form.innerHTML=form.innerHTML;
 app.root.VectaJobPricing.install({id:'reopened-service'},app.api,false);
 t.mock.timers.tick(2100);
 await new Promise(setImmediate);
 assert.equal(requests,1);
 assert.equal(app.document.querySelector('.job-live-pricing.is-checking'),null);
});
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

test('lookup is visibly busy, then main price box replaces the estimate and duplicate Oil',async()=>{
 let complete;const app=ui(()=>new Promise(resolve=>{complete=resolve;}),[{id:'manual-oil',description:'Oil',quantity:1,cost_price:null},{id:'brakes',description:'Brake pads',cost_price:30,quantity:1}]);
 app.root.VectaJobPricing.selected('Interim Service',true);
 assert.match(app.document.getElementById('servicePricingAdvisor').textContent,/Looking up oil and filter prices/);
 assert.doesNotMatch(app.document.getElementById('servicePricingAdvisor').textContent,/140/);
 complete({ok:true,json:async()=>workshopServiceResult({status:'MATCHED',quote},secret)});await tick();
 const main=app.document.getElementById('servicePricingAdvisor').textContent;
 assert.match(main,/Calculated from GSF/);assert.doesNotMatch(main,/estimate|Use this service price/);
 assert.equal(app.parts().filter(p=>p.description==='Oil').length,0);assert.equal(app.parts().filter(p=>p.id==='brakes').length,1);
 // Reopening a saved job keeps its calculated price, without another lookup.
 app.root.VectaJobPricing.install({},app.api);assert.match(app.document.getElementById('servicePricingAdvisor').textContent,/Calculated from GSF/);
});
test('unreachable supplier endpoint uses estimated costs for every required part in the final total',async()=>{
 const app=ui(async()=>({ok:true,json:async()=>({status:'OFFLINE'})}));app.document.getElementById('job_job_type').value='Full Service';
 app.root.VectaJobPricing.selected('Full Service',true);await tick();
 assert.equal(app.parts().length,4);assert.ok(app.parts().every(p=>p.cost_price>0&&p.description.startsWith('ESTIMATED COST £')));assert.equal(app.prices()[0].price,240);
 assert.match(app.document.getElementById('servicePricingAdvisor').textContent,/Full Service estimate/);assert.match(app.document.querySelector('.job-live-pricing').textContent,/Estimated costs: Engine oil, Oil filter, Air filter, Cabin filter/);
});
test('partial result retains known supplier costs and explicitly marks missing oil',async()=>{
 const partial=workshopEstimate(request,[{kind:'oil_filter',costNetPence:630,part:{id:'gsf-partial-oil_filter',description:'GSF filter',cost_price:6.3,quantity:1}}],workshopAllowances,offlineWorkshopPolicy);
 const app=ui(async()=>({ok:true,json:async()=>partial}));
 app.root.VectaJobPricing.selected('Interim Service',true);await tick();assert.equal(app.parts().find(p=>p.id==='gsf-partial-oil_filter').cost_price,6.3);
 assert.equal(app.parts().find(p=>p.id==='gsf-estimate-oil').cost_price,43.41);assert.match(app.document.querySelector('.job-live-pricing').textContent,/Estimated costs: Engine oil/);assert.equal(app.prices()[0].price,120);
});
test('manual edits during service lookup are kept until explicitly applied',async()=>{
 let complete;const app=ui(()=>new Promise(resolve=>{complete=resolve;}));app.root.VectaJobPricing.selected('Interim Service',true);
 app.parts().push({id:'mine',description:'Oil filter',quantity:1,cost_price:null});complete({ok:true,json:async()=>workshopServiceResult({status:'MATCHED',quote},secret)});await tick();
 assert.equal(app.prices().length,0);assert.equal(app.document.querySelector('[data-apply]').hidden,false);app.document.querySelector('[data-apply]').onclick();assert.equal(app.prices()[0].price,quote.totalPence/100);
});
test('adding an unrelated job type does not cancel an in-flight service quote',async()=>{
 let complete;const app=ui(()=>new Promise(resolve=>{complete=resolve;}));app.root.VectaJobPricing.selected('Interim Service',true);
 app.document.getElementById('job_job_type').value='Interim Service,MOT';app.root.VectaJobPricing.selected('MOT',true);
 complete({ok:true,json:async()=>workshopServiceResult({status:'MATCHED',quote},secret)});await tick();assert.equal(app.prices()[0].price,quote.totalPence/100);
});
test('tyre picker uses split size entry, three price cards and wheel selection; saves and restores wheels',async()=>{
 let sent;const app=ui(async(_,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({status:'MATCHED',parts:[{description:'Tyres · ACCELERA · '+sent.tyre_positions.join(', '),cost_price:21,quantity:sent.tyre_quantity}],totalPence:6000*sent.tyre_quantity})};});
 let emit,controller;app.root.VectaTyreBooking.createController=({onChange})=>{emit=onChange;controller={update(){},dispose(){}};return controller;};
 app.document.getElementById('job_job_type').value='Tyres';app.root.VectaJobPricing.selected('Tyres',true);
 assert.equal(app.document.querySelector('[data-tyres]'),null);let dialog=app.document.querySelector('dialog');assert.equal(dialog.querySelectorAll('[data-tyre-part]').length,3);assert.equal(dialog.querySelectorAll('.tyre-guide-card').length,3);
 for(const [i,v] of ['205','55','16'].entries()){const f=dialog.querySelectorAll('[data-tyre-part]')[i];f.value=v;f.oninput();}
 dialog.querySelector('[data-check]').onclick();
 const result=q=>({status:'matched',result:{size:'205/55R16',quantity:q,checkedAt:new Date().toISOString(),options:['budget','midrange','premium'].map(category=>({category,choices:[{category,brand:'ACCELERA',model:'PHI',unitPence:6000,totalPence:6000*q,costToken:'fixture'}]}))}});
 emit(result(1));dialog.querySelector('[data-category="budget"]').onclick();assert.equal(dialog.querySelector('[data-save]').disabled,true);
 dialog.querySelector('[data-tyre-position="Front driver"]').onclick();dialog.querySelector('[data-tyre-position="Rear passenger"]').onclick();emit(result(2));
 await dialog.querySelector('[data-save]').onclick();assert.deepEqual(sent.tyre_positions,['Rear passenger','Front driver']);assert.equal(sent.tyre_quantity,2);assert.equal(app.parts()[0].cost_price,21);assert.equal(app.prices()[0].price,120);assert.equal(app.document.querySelector('dialog'),null);
 app.root.VectaJobPricing.install({},app.api);app.root.VectaJobPricing.selected('Tyres',true);dialog=app.document.querySelector('dialog');assert.equal(dialog.querySelector('[data-tyre-part="width"]').value,'205');dialog.querySelector('[data-check]').onclick();emit(result(2));assert.equal(dialog.querySelector('[data-tyre-position="Front driver"]').getAttribute('aria-pressed'),'true');assert.equal(dialog.querySelector('[data-tyre-position="Rear passenger"]').getAttribute('aria-pressed'),'true');dialog.querySelector('[data-close]').onclick();
});
test('partial worker result reaches the job sheet and produces a signed public guide total',async()=>{
 const {gsfWorkerHandler}=await import('../../api/gsf-worker.js');
 const {cleanPartialServiceCosts,cleanServiceQuoteCosts}=await import('../../lib/service-pricing.js');
 const incomplete={...costs,partial:true,oilVerified:false,items:costs.items.filter(p=>p.kind!=='oil'),checkedAt:new Date().toISOString()};
 assert.equal(cleanPartialServiceCosts(incomplete,request).items.length,1);
 assert.throws(()=>cleanServiceQuoteCosts(incomplete,request),/INCOMPLETE/);
 for(const patch of [{scopeVerified:false},{fitmentVerified:false},{request:{...request,registration:'WRONG123'}},{items:[{...incomplete.items[0],unitNetPence:-1}]},{checkedAt:new Date(Date.now()-3600000).toISOString()}])assert.throws(()=>cleanPartialServiceCosts({...incomplete,...patch},request));
 let stored;const queue=async(action,payload)=>{if(action==='complete'){stored=payload.result;return{status:'SAVED'};}return{status:'MATCHED',result:stored};};
 const env={GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_QUOTE_SECRET:secret,GSF_WORKER_TOKEN:secret,GSF_SERVICE_PRICING_POLICY:JSON.stringify(policy)};
 const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
 const worker=response();await gsfWorkerHandler({env,queue})({method:'POST',headers:{authorization:'Bearer '+secret},body:{action:'complete',id:'12345678-1234-1234-1234-123456789abc',lease:'12345678-1234-1234-1234-123456789abd',request,status:'MATCHED',result:incomplete}},worker);assert.equal(worker.body.status,'SAVED');
 const old={...process.env};Object.assign(process.env,{VECTA_MAIN_USER:'fixture',VECTA_MAIN_PASSWORD:'fixture'});
 try{
  const headers={authorization:'Basic '+Buffer.from('fixture:fixture').toString('base64'),host:'example.invalid','x-vecta-workshop':'1'};
  const handler=servicePriceHandler({env,queue,history:async()=>[]}),privateRes=response();await handler({method:'POST',headers,body:{...request,workshop:true}},privateRes);
  assert.equal(privateRes.body.status,'ESTIMATED');assert.equal(privateRes.body.parts.find(p=>p.id==='gsf-partial-oil_filter').cost_price,5);assert.equal(privateRes.body.parts.find(p=>p.id==='gsf-estimate-oil').cost_price,43.41);assert.equal(privateRes.body.totalPence,11500);assert.deepEqual(privateRes.body.missingKinds,['oil']);assert.equal(privateRes.body.quote,undefined);
  const publicRes=response();await handler({method:'POST',headers:{},body:request},publicRes);assert.equal(publicRes.body.status,'MATCHED');assert.equal(publicRes.body.quote.guidePrice,true);assert.equal(publicRes.body.quote.totalPence,privateRes.body.totalPence);assert.equal(publicRes.body.parts,undefined);
 }finally{process.env=old;}
});
test('wheel selections survive real part encoding, editor inputs and save/reopen',()=>{
 const html=readFileSync('index.html','utf8'),context={uid:()=>'fixture',esc:v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),jobPartsRangeDisplay:()=>'',select:()=>'',partsStatusFromJob:()=>'',PARTS_STATUS_VALUES:[],decodeURIComponent,encodeURIComponent};
 context.window=context;vm.runInNewContext(readFileSync('public/js/vecta-job-pricing.js','utf8'),context);
 for(const name of ['jobParts','noteWithJobParts','jobPartDisplayName','jobPartRowHtml','jobPartsEditorHtml','gatherJobPartsEditor']){const begin=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',begin+1);vm.runInNewContext(html.slice(begin,end),context);}
 const selected={size:'205/55R16',category:'budget',brand:'ACCELERA',model:'PHI',positions:['Front driver','Rear passenger']};
 const note=context.noteWithJobParts('Keep my note',[{id:'tyre-205/55R16',description:'Tyres · Front driver, Rear passenger',quantity:2,cost_price:21,tyre_selection:selected}]);
 const {document}=parseHTML(context.jobPartsEditorHtml({customer_note:note}));context.document=document;
 const saved=context.noteWithJobParts('Keep my note',context.gatherJobPartsEditor()),reopened=context.jobParts({customer_note:saved});
 assert.deepEqual(JSON.parse(JSON.stringify(reopened[0].tyre_selection)),selected);assert.equal(reopened[0].quantity,2);assert.equal(reopened[0].cost_price,21);assert.match(saved,/Keep my note/);
});
test('4 November full-service example: £180 with every cost; £190 when only the cabin filter is estimated',async()=>{
 const {estimatedFilter}=await import('../../lib/service-guide-costs.js');
 const source={...request,service:'Full Service'},now=Date.now();
 const filter=(kind,net)=>({...costs.items[1],kind,sku:'TEST-'+kind,description:kind,unitNetPence:net});
 const captured={...costs,request:source,checkedAt:new Date(now).toISOString(),requiredKinds:['oil','oil_filter','air_filter','cabin_filter'],items:[{...costs.items[0],quantityMilli:3900,packNetPence:4341,unitNetPence:869},filter('oil_filter',630),filter('air_filter',965),filter('cabin_filter',1294)]};
 for(const missing of [false,true]){
  const result=missing?{...captured,guidePrice:true,items:[...captured.items.slice(0,3),estimatedFilter('cabin_filter')]}:captured;
  const signed=signServicePrice(publicServicePrice(calculateServicePrice(result,source,policy,now)),secret,now,result),payload=workshopServiceResult({status:'MATCHED',quote:signed},secret);
  const app=ui(async()=>({ok:true,json:async()=>payload}));app.document.getElementById('job_job_type').value='Full Service';app.root.VectaJobPricing.selected('Full Service',true);await tick();
  assert.equal(app.parts().length,4);assert.deepEqual(app.parts().map(p=>p.cost_price),[43.41,6.30,9.65,missing?19.34:12.94]);assert.equal(app.prices()[0].price,missing?190:180);
  const box=app.document.getElementById('servicePricingAdvisor').textContent;assert.ok(box.includes(missing?'£190.00':'£180.00'));assert.ok(!box.includes('£140.00'));
  if(missing){assert.match(app.parts()[3].description,/ESTIMATED COST £19.34/);assert.match(box,/estimate/);assert.match(app.document.querySelector('.job-live-pricing').textContent,/Missing GSF prices: Cabin filter/);}
 }
});

test('unticking Tyres clears its unplaced parts and closes the picker without another lookup',()=>{
 const app=ui(()=>{throw Error('Removing tyres must not fetch prices');},[
  {id:'tyre-205/55R16',description:'Tyres',tyre_selection:{size:'205/55R16',positions:[]},cost_price:21},
  {id:'brake-pads',description:'Brake pads',cost_price:30,ordered:true}
 ]);
 app.document.getElementById('job_job_type').value='Tyres';app.root.VectaJobPricing.selected('Tyres',true);
 assert.ok(app.document.querySelector('dialog'));
 assert.equal(app.root.VectaJobPricing.removeTyres(),true);
 app.root.VectaJobPricing.selected('Tyres',false);
 assert.equal(app.document.querySelector('dialog'),null);
 assert.deepEqual(app.parts().map(p=>p.id),['brake-pads']);
});
test('unticking ordered or received tyres retains parts and explains the block without opening the picker',()=>{
 for(const status of ['ordered','arrived']){
  const tyre={id:'tyre-205/55R16',description:'Tyres',cost_price:21,[status]:true};
  const app=ui(()=>{throw Error('No lookup expected');},[tyre]);let message='';app.root.alert=text=>{message=text;};
  assert.equal(app.root.VectaJobPricing.removeTyres(),false);
  assert.equal(app.parts()[0],tyre);assert.equal(app.document.querySelector('dialog'),null);assert.match(message,/already ordered or received/);
 }
});
test('removing an unpriced tyre selection does not open a picker',()=>{
 const app=ui(()=>{throw Error('No lookup expected');});
 assert.equal(app.root.VectaJobPricing.removeTyres(),true);app.root.VectaJobPricing.selected('Tyres',false);
 assert.equal(app.document.querySelector('dialog'),null);assert.equal(app.parts().length,0);
});
