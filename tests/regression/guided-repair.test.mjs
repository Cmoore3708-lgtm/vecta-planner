import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {PGlite} from '@electric-sql/pglite';
import {repairRequest,repairScope,cleanRepairChoices,cleanRepairEvidence,calculateRepairQuote} from '../../lib/repair-quote.js';
import {repairQuoteHandler} from '../../api/repair-quote.js';
import {repairWorkerHandler} from '../../api/repair-quote-worker.js';
import {lookupGeneralRepair} from '../../workers/repair-quotes/general-repair.mjs';
import {createRepairBridge} from '../../workers/repair-quotes/shared-bridge.mjs';
import {requireChoice,choiceId} from '../../workers/repair-quotes/choice-result.mjs';
import {scopeForFitment,gsfPartChoices,catalogueCategoryOptions,lookupGeneralGSF} from '../../workers/repair-quotes/general-gsf.mjs';
import {haynesLabourOptions,readRepairMenus} from '../../workers/repair-quotes/guided-haynes.mjs';
import {readAlternatorTime} from '../../workers/repair-quotes/repair-time-reader.mjs';
const now=Date.now(),stamp=new Date(now).toISOString(),partId='a'.repeat(32),labourId='b'.repeat(32);
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit front left wishbone',flow:'guided-v1'});
const option={id:partId,label:'Track control arm',detail:'Front axle · Left',costPence:5000,work:request.work};
const selection=(r=request,stage='GSF_PART',options=[option])=>({request:r,stage,options,checkedAt:stamp});
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});

test('guided requests cannot submit prices, bypass the part step or reorder the normalised request',()=>{
 assert.deepEqual(request.choices,{});
 assert.throws(()=>repairRequest({...request,choices:{labour:labourId}}),/INVALID_REQUEST/);
 assert.throws(()=>repairRequest({...request,choices:{part:partId,costPence:1}}),/INVALID_REQUEST/);
 assert.throws(()=>repairRequest({...request,choices:{part:'https://untrusted.example/'}}),/INVALID_REQUEST/);
 const r=repairRequest({...request,choices:{part:partId,labour:labourId,menus:['Suspension']}});
 const reordered={...r,choices:{menus:['Suspension'],labour:labourId,part:partId}};
 assert.deepEqual(repairRequest(reordered),r);
});
test('choice relay rejects wrong vehicle, stale results, duplicates and labour without a part',()=>{
 assert.deepEqual(cleanRepairChoices(selection(),request,{now}),selection());
 for(const raw of [{...selection(),checkedAt:'2020-01-01'},{...selection(),request:{...request,registration:'WRONG'}},selection(request,'GSF_PART',[option,option]),selection(request,'HAYNES_LABOUR',[])])assert.throws(()=>cleanRepairChoices(raw,request,{now}));
 const raw={...selection(),extra:'discard',options:[{...option,html:'discard',url:'https://evil.example/'}]};
 assert.equal(cleanRepairChoices(raw,request,{now}).options[0].url,undefined);
});
test('GSF ambiguity stops before Haynes, and subsequent Haynes choices retain the selected part',async()=>{
 let calls=0;const part={description:'Track control arm',brand:'Fixture',sku:'ARM1',costPence:5000};
 await assert.rejects(lookupGeneralRepair({},request,{gsf:async()=>requireChoice(request,'GSF_PART',[option],{now:()=>now}),haynes:async()=>{calls++;}}),e=>e.code==='CHOICE_REQUIRED'&&e.result.stage==='GSF_PART');
 assert.equal(calls,0);
 const r=repairRequest({...request,choices:{part:partId}});
 await assert.rejects(lookupGeneralRepair({},r,{gsf:async()=>({part}),haynes:async(_,received,opts)=>{calls++;assert.equal(opts.selectedPart,part);requireChoice(received,'HAYNES_LABOUR',[],{now:()=>now});}}),e=>e.code==='CHOICE_REQUIRED'&&e.result.selectedPart===part);
 assert.equal(calls,1);
});
test('observed categories offer different terminology without fabricated categories or links',()=>{
 const options=catalogueCategoryOptions([{href:'/parts/Control%2520Arm',text:'Control Arm'},{href:'https://evil.example/parts/Wishbone',text:'Wishbone'},{href:'/checkout',text:'Wishbone'}],'wishbone',repairScope.resolve(request.work));
 assert.equal(options.length,1);assert.match(options[0].work,/front left Control Arm/);
 assert.equal(options[0].label,'Control Arm');
});
test('part choices retain distinct fitment variants and detect supplier price changes',()=>{
 const scope=repairScope.resolve(request.work),rows=[{attribute:'Fitting Position',value:'Front Axle Left'}];
 assert.equal(scopeForFitment(rows,scope).work,scope.work);
 assert.equal(scopeForFitment([{attribute:'Fitting Position',value:'Rear Axle Left'}],scope),null);
 assert.equal(scopeForFitment(rows,repairScope.resolve('Replace wishbone')).work,scope.work);
 const candidate={group:{sku:'GROUP1',description:'Control Arm'},option:{description:'Control Arm',brand:'Brand',grade:'Silver',pricePence:5000},rows,scope};
 const opts=gsfPartChoices([candidate,{...candidate,group:{...candidate.group,sku:'GROUP2'}}],request,'Control Arm');
 assert.notEqual(opts[0].id,opts[1].id);
 assert.notEqual(opts[0].id,gsfPartChoices([{...candidate,option:{...candidate.option,pricePence:5001}}],request,'Control Arm')[0].id);
});
test('Haynes offers multiple actual operations, rejects wrong axle and changed times invalidate selections',()=>{
 const {document}=parseHTML('<html><body><p>TOTAL TIME (H)</p><ul><li><span>Renew front left track control arm</span> <span>1BR1234567</span> <span>0.70</span></li><li><span>Renew rear left track control arm</span> <span>1BR1234568</span> <span>1.20</span></li><li><span>Renew front left suspension arm with ball joint</span> <span>1BR1234569</span> <span>0.90</span></li></ul></body></html>');
 const captures=readAlternatorTime({operationPattern:'\\bRenew\\b',allowMultiple:true},document);
 assert.equal(captures.length,3);
 const options=haynesLabourOptions(captures,request,'control arm');assert.equal(options.length,2);
 assert.ok(options.every(o=>!o.label.includes('rear')));
 assert.notEqual(options[0].id,haynesLabourOptions([{...captures[0],hoursMilli:800}],request,'control arm')[0].id);
 assert.throws(()=>haynesLabourOptions([...captures,{...captures[0],hoursMilli:800}],request,'arm'),/LABOUR_REVIEW_REQUIRED/);
 assert.throws(()=>haynesLabourOptions([{...captures[0],registrationVisible:'WRONG'}],request,'arm'),/LABOUR_REVIEW_REQUIRED/);
});
test('Haynes repair group options exclude account, purchase, estimate and hidden controls',()=>{
 const {document}=parseHTML('<html><body><nav><li><a>Account</a></li></nav><ul><li><span>Suspension</span></li><li><span hidden>Secret heading</span></li><li><span>Add to estimate</span></li><li><span>Logout</span></li><li><span>Print</span></li><li><span>Buy now</span></li><li><span>Renew the arm</span></li></ul></body></html>');
 assert.deepEqual(readRepairMenus(document).map(m=>m.label),['Suspension']);
});
test('a quantity in an engine specification cannot imply the number of parts being fitted',()=>{
 const r=repairRequest({registration:request.registration,work:'Supply and fit 2 front wishbones',flow:'guided-v1'});
 const row={operationId:'1BR1234567',operationText:'Renew front wishbone on 2.0 diesel',hoursMilli:700};
 assert.equal(haynesLabourOptions([row],r,'wishbone').length,0);
 assert.equal(haynesLabourOptions([{...row,operationText:'Renew both front wishbones'}],r,'wishbone').length,1);
});
test('guided evidence requires both exact choices and preserves the confirmed terminology through pricing',()=>{
 const r=repairRequest({...request,choices:{part:partId,labour:labourId}}),variant='Fixture vehicle';
 const raw={request:r,scope:repairScope.resolve(r.work),variant,fitmentEvidence:'Observed registration and front left attributes',catalogueComplete:true,checkedAt:stamp,parts:[{source:'GSF',registration:r.registration,variant,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:'ARM1',brand:'Fixture',description:'Track control arm',costPence:5000,inStock:true,checkedAt:stamp,choiceId:partId}],labour:{source:'HAYNES_PRO',registration:r.registration,variant,operation:r.operation,operationId:'1BR1234567',operationLabel:'Renew front left suspension arm',hoursMilli:700,unit:'hours',scopeConfirmed:true,checkedAt:stamp,choiceId:labourId}};
 const cleaned=cleanRepairEvidence(raw,r,{now});assert.deepEqual(cleanRepairEvidence(cleaned,r,{now}),cleaned);
 assert.equal(calculateRepairQuote(cleaned,r,{now}).part.sku,'ARM1');
 for(const mutate of [v=>v.parts[0].choiceId='c'.repeat(32),v=>v.labour.choiceId='c'.repeat(32),v=>v.parts.push({...v.parts[0],costPence:1})]){const bad=structuredClone(raw);mutate(bad);assert.throws(()=>cleanRepairEvidence(bad,r,{now}));}
});
test('GSF first offers choices and then opens the explicitly chosen option, including a dearer one',async()=>{
 const scope=repairScope.resolve(request.work),rows=[{attribute:'Fitting Position',value:'Front Axle Left'}];let clicked='',url='https://trade.gsfcarparts.com';
 const group={selector:'#group',sku:'GROUP1',description:'Control Arm',attributesSelector:'#attrs',links:['/partdetails/FIXARM1'],options:[{selector:'#cheap',description:'Control Arm',brand:'Fixture',grade:'Silver',pricePence:5000,inStock:true},{selector:'#dearer',description:'Control Arm',brand:'Fixture',grade:'Gold',pricePence:6000,inStock:true}]};
 const page={goto:async value=>{url=value;},url:()=>url,keyboard:{press:async()=>{}},waitForTimeout:async()=>{},getByRole:()=>({count:async()=>1,fill:async()=>{},press:async()=>{}}),getByText:()=>({count:async()=>0}),locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},press:async()=>{},click:async()=>{clicked=selector;},evaluateAll:async()=>[{href:'/parts/Wishbone',text:'Wishbone'}]}),evaluate:async(fn)=>({readCatalogueSearchState:{fields:[{catalogue:true,selector:'#search'}]},readRepairGroups:{complete:true,groups:[group]},readServiceAttributes:{status:'ATTRIBUTES_CAPTURED',rows},readServiceCategory:{selectedRegistration:true,registration:request.registration},readProductDialog:{unitNetPence:6000,description:'Control Arm',brand:'Fixture',sku:'ARM1',inStock:true,stock:[{quantity:2}],vatBasis:'EX_VAT'}}[fn.name])};
 const deps={now:()=>now,capture:async()=>({status:'CAPTURED_FOR_REVIEW',registration:request.registration,selectedRegistration:true,visibleText:'Fixture vehicle'})};
 let options;await assert.rejects(lookupGeneralGSF(page,request,deps),e=>{options=e.result.options;return e.code==='CHOICE_REQUIRED';});
 assert.equal(options.length,2);assert.equal(clicked,'#attrs');
 const selected=repairRequest({...request,choices:{part:options[1].id}}),part=await lookupGeneralGSF(page,selected,deps);
 assert.equal(clicked,'#dearer');assert.equal(part.part.costPence,6000);assert.equal(part.part.choiceId,options[1].id);
});
test('both API routes retain choice payloads but never treat them as a final quote',async()=>{
 const r=response();await repairQuoteHandler({env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_GENERAL_PRICING_ENABLED:'true'},authenticate:async()=>true,queue:async()=>({status:'CHOICE_REQUIRED',result:selection()}),now:()=>now})({method:'POST',body:request},r);
 assert.equal(r.body.status,'CHOICE_REQUIRED');assert.equal(r.body.quote,undefined);assert.equal(r.body.choices.options[0].costPence,5000);
 let complete;const token='a'.repeat(64),res=response();await repairWorkerHandler({env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_QUOTE_WORKER_TOKEN:token},now:()=>now,queue:async(a,p)=>{complete={a,p};return {status:'SAVED'};}})({method:'POST',headers:{authorization:'Bearer '+token},body:{action:'complete',id:'11111111-1111-1111-1111-111111111111',lease:'22222222-2222-2222-2222-222222222222',request,status:'CHOICE_REQUIRED',result:selection()}},res);
 assert.equal(res.body.status,'SAVED');assert.equal(complete.p.result.stage,'GSF_PART');
});
test('worker bridge delivers choice pauses, closes its pages and advertises protocol 3',async()=>{
 let completed,closed=0;const page=()=>({close:async()=>{closed++;}}),bridge=createRepairBridge({origin:'https://fixture.vercel.app',token:'a'.repeat(64),configPath:'/tmp/no-guided-repair-config',gsfContext:{newPage:async()=>page()},openHaynesContext:async()=>({newPage:async()=>page(),close:async()=>{}}),lookup:async()=>requireChoice(request,'GSF_PART',[option],{now:()=>now}),rpc:async body=>{if(body.action==='pull'){assert.equal(body.repairProtocol,3);return {status:'JOB',request,id:'job',lease:'lease'};}completed=body;return {status:'SAVED'};}});
 assert.equal(await bridge.tick(),'CHOICE_REQUIRED');assert.equal(completed.result.options[0].id,partId);assert.equal(closed,2);await bridge.close();
});
test('database choice round trip isolates old workers, preserves cached options and separates selected requests',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table public.gsf_service_jobs(status text,lease uuid,deadline timestamptz);');
  for(const path of ['docs/sql/repair-quote-queue.sql','supabase/migrations/20261111064559_catalogue_repair_pricing.sql','supabase/migrations/20261111073607_guided_repair_choices.sql'])await db.exec(fs.readFileSync(path,'utf8'));
  const rpc=async(action,payload)=>(await db.query('select public.vecta_repair_quote_queue($1,$2::jsonb) as value',[action,JSON.stringify(payload)])).rows[0].value,job={request,actor:'a'.repeat(64)};
  await rpc('pull',{repairProtocol:2});assert.equal((await rpc('enqueue',job)).status,'SETTINGS_REQUIRED');
  await rpc('pull',{repairProtocol:3});assert.equal((await rpc('enqueue',job)).status,'PENDING');assert.equal((await rpc('pull',{repairProtocol:2})).status,'IDLE');
  const task=await rpc('pull',{repairProtocol:3}),body={...task,request,status:'CHOICE_REQUIRED',result:selection()};
  assert.equal((await rpc('complete',body)).status,'SAVED');assert.equal((await rpc('complete',body)).status,'SAVED');
  const cached=await rpc('enqueue',job);assert.equal(cached.status,'CHOICE_REQUIRED');assert.deepEqual(cached.result.options,[option]);
  assert.equal((await rpc('enqueue',{...job,request:repairRequest({...request,choices:{part:partId}})})).status,'PENDING');
  assert.equal((await db.query("select has_table_privilege('anon','public.vecta_repair_quote_jobs','select') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});

function editor(reply){
 const {window,document}=parseHTML('<html><body><div id="jobModal" class="open"><section class="jobWorkSection"><textarea id="job_work_required">Supply and fit front left wishbone</textarea></section><input id="job_registration" value="AB12CDE"><input id="job_status" value="quote"><div id="privatePricingRows"></div></div></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return Array.from(this.options).find(o=>o.selected)?.value||this.options[0]?.value||'';},set(value){Array.from(this.options).forEach(o=>o.selected=o.value===value);}});
 const sent=[],context={window,document,MutationObserver:window.MutationObserver,fetch:async(url,opts)=>{if(!opts)return {json:async()=>({})};const body=JSON.parse(opts.body);sent.push(body);return {status:200,json:async()=>reply(body,sent.length)};},setTimeout:()=>1,clearTimeout(){},AbortController,Date:class extends Date{static now(){return now;}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/vecta-repair-quote.js','utf8'),context);window.VectaRepairQuote.mount({status:'quote'});
 const flush=()=>new Promise(r=>setImmediate(r)),click=async selector=>{document.querySelector(selector).click();await flush();},choose=i=>{const input=document.querySelectorAll('[name="rqSupplierChoice"]')[i];input.checked=true;input.onchange();};
 return {window,document,sent,click,choose,flush};
}
test('editor requires a tick at each stage, keeps the part during Haynes refinement and clears it on edit',async()=>{
 const e=editor((r,n)=>n===1?{status:'CHOICE_REQUIRED',choices:selection(r)}:{status:'CHOICE_REQUIRED',choices:{...selection(r,'HAYNES_LABOUR',[{id:labourId,label:'Renew control arm',detail:'Observed operation',hoursMilli:700}]),selectedPart:{description:'Control arm',brand:'Fixture',sku:'ARM1',costPence:5000}}});
 await e.click('[data-rq-find]');assert.equal(e.sent.length,1);assert.equal(e.document.querySelector('[data-rq-choose]').disabled,true);assert.equal(e.document.querySelector('[data-rq-apply]'),null);
 e.choose(0);assert.equal(e.sent.length,1);await e.click('[data-rq-choose]');assert.equal(e.sent[1].choices.part,partId);assert.equal(e.sent[1].choices.labour,undefined);
 assert.match(e.document.querySelector('[data-rq-result]').textContent,/GSF part selected/);
 e.document.querySelector('[data-rq-refine]').value='suspension arm';await e.click('[data-rq-search-again]');assert.equal(e.sent[2].choices.part,partId);assert.equal(e.sent[2].choices.labourSearch,'suspension arm');
 e.choose(0);await e.click('[data-rq-choose]');assert.equal(e.sent[3].choices.labour,labourId);
 e.document.querySelector('#job_registration').value='OTHER';e.document.querySelector('#job_registration').dispatchEvent(new e.window.Event('input'));assert.equal(e.document.querySelector('[data-rq-result]').textContent,'');
 await e.click('[data-rq-find]');assert.deepEqual(e.sent.at(-1).choices,{});
});
test('supplier labels render as text and changing the GSF part discards labour choices',async()=>{
 const e=editor(r=>({status:'CHOICE_REQUIRED',choices:{...selection(r,'HAYNES_LABOUR',[{id:labourId,label:'<img src=x onerror=alert(1)>',detail:'<script>bad()</script>',hoursMilli:700}]),selectedPart:{description:'<img src=x>',brand:'Fixture',sku:'ARM1',costPence:5000}}}));
 await e.click('[data-rq-find]');assert.equal(e.document.querySelector('[data-rq-result] img'),null);assert.equal(e.document.querySelector('[data-rq-result] script'),null);
 await e.click('[data-rq-change-part]');assert.deepEqual(e.sent.at(-1).choices,{});
});
test('the selected GSF suggestion survives part selection and Haynes search refinement',async()=>{
 const category='c'.repeat(32);
 const e=editor((r,n)=>n===1?{status:'CHOICE_REQUIRED',choices:selection(r,'GSF_CATEGORY',[{id:category,categoryChoice:category,label:'Control arm',detail:'GSF suggestion',work:'Supply and fit front left control arm'}])}:n===2?{status:'CHOICE_REQUIRED',choices:selection(r,'GSF_PART',[{...option,work:r.work}])}:{status:'CHOICE_REQUIRED',choices:{...selection(r,'HAYNES_LABOUR',[{id:labourId,label:'Renew control arm',detail:'Observed operation',hoursMilli:700}]),selectedPart:{description:'Control arm',brand:'Fixture',sku:'ARM1',costPence:5000}}});
 await e.click('[data-rq-find]');e.choose(0);await e.click('[data-rq-choose]');assert.equal(e.sent[1].choices.gsfCategory,category);
 e.choose(0);await e.click('[data-rq-choose]');assert.equal(e.sent[2].choices.gsfCategory,category);assert.equal(e.sent[2].choices.part,partId);
 e.document.querySelector('[data-rq-refine]').value='suspension arm';await e.click('[data-rq-search-again]');assert.equal(e.sent[3].choices.gsfCategory,category);
 await e.click('[data-rq-change-part]');assert.deepEqual(e.sent.at(-1).choices,{gsfCategory:category});
});
