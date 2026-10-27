import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {repairRequest,cleanRepairEvidence,calculateRepairQuote,repairPartsPrice,repairPartUrl} from '../../lib/repair-quote.js';
import {repairQuoteHandler} from '../../api/repair-quote.js';
import {repairReplayAvailable,repairReplayQuote} from '../../lib/repair-quote-replay.js';
import {repairWorkerHandler} from '../../api/repair-quote-worker.js';
import {parsePence,parseHours,reviewedMapping} from '../../workers/repair-quotes/catalogue.mjs';
const now=Date.parse('2026-10-25T09:00:00Z'),stamp=new Date(now).toISOString();
const request=repairRequest({registration:'AB12 CDE',work:'Supply and fit alternator'});
function fixture(){const part=(sku,costPence,inStock=true,corePence=0)=>({source:'GSF',registration:request.registration,variant:'Synthetic diesel 2.0 150A',fitmentConfirmed:true,vatBasis:'EX_VAT',sku,brand:'Synthetic',description:'Alternator',costPence,corePence,inStock,imageUrl:'https://example.com/part.png',checkedAt:stamp});return {request,variant:'Synthetic diesel 2.0 150A',fitmentEvidence:'Synthetic fixture only',catalogueComplete:true,checkedAt:stamp,parts:[part('NO-STOCK',5000,false),part('AVAILABLE',10001),part('EXPENSIVE',15000)],labour:{source:'HAYNES_PRO',registration:request.registration,variant:'Synthetic diesel 2.0 150A',operation:request.operation,operationId:'synthetic-123',operationLabel:'Alternator remove and refit',hoursMilli:1500,unit:'hours',scopeConfirmed:true,checkedAt:stamp}};}
function response(){return {code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
test('select cheapest stocked part; sliding markup and fractional labour at £50 without VAT',()=>{const q=calculateRepairQuote(fixture(),request,{now});assert.equal(q.part.sku,'AVAILABLE');assert.equal(q.partsPence,13501);assert.equal(q.labourPence,7500);assert.equal(q.netPence,21250);assert.equal(q.vatBasis,'EX_VAT');});
test('exchange deposit is excluded from the quote for now',()=>{const r=fixture();r.parts[1].corePence=3000;const q=calculateRepairQuote(r,request,{now});assert.equal(q.netPence,21250);assert.equal(q.payableNetPence,21250);assert.equal(q.corePence,0);assert.equal(q.surchargeExcluded,true);});
test('do not price multi-part or unsupported requests as one alternator',()=>{for(const work of ['alternator and belt','Supply and fit alternator and battery','diagnose alternator','fit starter motor'])assert.throws(()=>repairRequest({...request,work}),/UNSUPPORTED_OPERATION/);});
test('reject stale/wrong vehicle, uncertain VAT, partial catalogue and ambiguous labour',()=>{for(const mutate of [r=>r.parts[1].registration='WRONG',r=>r.parts[1].variant='other engine',r=>r.parts[1].vatBasis='INC_VAT',r=>r.catalogueComplete=false,r=>r.labour.unit='minutes',r=>r.labour.scopeConfirmed=false,r=>r.labour.hoursMilli=0,r=>r.labour.hoursMilli=NaN,r=>r.checkedAt='2020-01-01',r=>r.parts[1].costPence=-1]){const r=fixture();mutate(r);assert.throws(()=>calculateRepairQuote(r,request,{now}));}const r=fixture();r.parts.forEach(p=>p.inStock=false);assert.throws(()=>calculateRepairQuote(r,request,{now}),/OUT_OF_STOCK/);});
test('expiry uses oldest source; unsafe images stripped',()=>{const r=fixture();r.parts[1].checkedAt=new Date(now-240000).toISOString();r.parts[1].imageUrl='javascript:alert(1)';const q=calculateRepairQuote(r,request,{now});assert.equal(q.part.imageUrl,'');assert.equal(Date.parse(q.expiresAt),now+660000);});
test('strict currency and hours parsers; no unapproved PC calibration',()=>{assert.equal(parsePence('£1,234.56'),123456);assert.equal(parseHours('1.25','hours'),1250);for(const s of ['£15.00 £18.00','15','£0.001','RRP £15.00'])assert.throws(()=>parsePence(s));assert.throws(()=>parseHours('90','minutes'));assert.throws(()=>reviewedMapping({calibrationApproved:false},request));});
test('manager endpoint authenticates, blocks cross-origin and uses setup gate',async()=>{let calls=0;const queue=async()=>{calls++;return {status:'MATCHED',result:fixture()};};let h=repairQuoteHandler({env:{REPAIR_QUOTING_ENABLED:'true'},authenticate:async(_,r)=>{r.status(401).json({});return false;},queue,now:()=>now}),res=response();await h({method:'POST',body:request},res);assert.equal(res.code,401);assert.equal(calls,0);h=repairQuoteHandler({env:{REPAIR_QUOTING_ENABLED:'true'},authenticate:async()=>true,queue,now:()=>now});res=response();await h({method:'POST',headers:{origin:'https://evil.example',host:'workshop.example'},body:request},res);assert.equal(res.code,403);assert.equal(calls,0);res=response();await h({method:'POST',body:request},res);assert.equal(res.body.quote.netPence,21250);assert.equal(calls,1);h=repairQuoteHandler({env:{},authenticate:async()=>true,queue});res=response();await h({method:'POST',body:request},res);assert.equal(res.body.status,'SETUP_REQUIRED');assert.equal(calls,1);});
test('worker endpoint checks secret and validates evidence before saving',async()=>{const token='a'.repeat(64);let calls=0;const h=repairWorkerHandler({env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_QUOTE_WORKER_TOKEN:token},queue:async()=>{calls++;return {status:'SAVED'};},now:()=>now});let res=response();await h({method:'POST',headers:{},body:{action:'pull'}},res);assert.equal(res.code,401);assert.equal(calls,0);const body={action:'complete',id:'11111111-1111-4111-8111-111111111111',lease:'22222222-2222-4222-8222-222222222222',status:'MATCHED',request,result:fixture()};res=response();await h({method:'POST',headers:{authorization:'Bearer '+token},body},res);assert.equal(res.body.status,'SAVED');body.result.labour.registration='WRONG';res=response();await h({method:'POST',headers:{authorization:'Bearer '+token},body},res);assert.equal(res.code,400);assert.equal(calls,1);});
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function functionSource(name){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);assert.ok(start>=0);return html.slice(start,end<0?undefined:end);}
function editor(jobOverride){const {window,document}=parseHTML('<html><body><div id="jobModal" class="open"><section class="jobWorkSection"><textarea id="job_work_required">Supply and fit alternator</textarea></section><input id="job_registration" value="AB12 CDE"><input id="job_status" value="quote"><input id="job_vat_mode" value="ex_vat"><input id="job_estimated_hours"><input id="job_amount_quoted"><strong id="privatePricingTotal"></strong><div id="privatePricingRows"></div></div></body></html>');const ctx={window,document,console,MutationObserver:window.MutationObserver,fetch:async()=>({status:200,json:async()=>({status:'MATCHED',quote:calculateRepairQuote(fixture(),request,{now})})}),setTimeout:()=>1,clearTimeout:()=>{},AbortController,Date:class extends Date{static now(){return now;}},esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),bindJobPartsEditor:()=>{}};vm.createContext(ctx);for(const name of ['privatePricingRowHtml','gatherPrivatePricingItems','syncPrivatePricingTotal','bindPrivatePricing','privatePricingItemsFromNote','noteWithPrivatePricing','stripPrivatePricingFromNote'])vm.runInContext(functionSource(name),ctx);ctx.PRIVATE_PRICING_PREFIX='[[VECTA_PRIVATE_PRICING:';for(const name of ['privatePricingRowHtml','bindPrivatePricing','syncPrivatePricingTotal','privatePricingItemsFromNote'])window[name]=ctx[name];vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-repair-quote.js',import.meta.url),'utf8'),ctx);window.VectaRepairQuote.mount(jobOverride||{status:'quote'});return {ctx,document,window};}
test('editor preserves manual lines, adds net parts/labour once and persists private audit',async()=>{const {ctx,document}=editor(),rows=document.getElementById('privatePricingRows');rows.innerHTML=ctx.privatePricingRowHtml({description:'Existing work',price:20},0);document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));assert.match(document.querySelector('[data-rq-result]').textContent,/212.50/);document.querySelector('[data-rq-apply]').click();document.querySelector('[data-rq-apply]').click();const items=ctx.gatherPrivatePricingItems();assert.equal(items.length,4);assert.equal(items[0].description,'Existing work');assert.equal(document.getElementById('job_amount_quoted').value,'232.50');assert.equal(document.getElementById('job_estimated_hours').value,'1.5');const note=ctx.noteWithPrivatePricing('Customer note',items),saved=ctx.privatePricingItemsFromNote(note);assert.equal(saved[1].repair_quote.part.sku,'AVAILABLE');assert.equal(saved[2].repair_quote.labour.hoursMilli,1500);assert.equal(ctx.stripPrivatePricingFromNote(note),'Customer note');const amount=rows.children[1].querySelector('.privatePriceAmount');amount.value='160';amount.dispatchEvent(new ctx.window.Event('input'));assert.equal(rows.children[1].dataset.repairQuote,undefined);});
test('gross existing lines block application; registration edit invalidates result',async()=>{let e=editor();e.document.getElementById('privatePricingRows').innerHTML=e.ctx.privatePricingRowHtml({description:'Gross existing',price:120},0);e.document.getElementById('job_vat_mode').value='inc_vat';e.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));e.document.querySelector('[data-rq-apply]').click();assert.equal(e.document.getElementById('privatePricingRows').children.length,1);assert.match(e.document.querySelector('.rqStatus').textContent,/different VAT mode/);e=editor();e.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));e.document.getElementById('job_registration').value='XY99ZZZ';e.document.getElementById('job_registration').dispatchEvent(new e.window.Event('input'));assert.equal(e.document.querySelector('[data-rq-apply]'),null);});
test('cleaned worker evidence survives relay validation and quote calculation',()=>{const raw=fixture();const cleaned=cleanRepairEvidence(raw,request,{now});const twice=cleanRepairEvidence(cleaned,request,{now});const q=calculateRepairQuote(twice,request,{now});assert.equal(q.netPence,21250);});

test('marginal part markup matches agreed examples and exact alternator price',()=>{
 for(const [cost,price] of [[2000,3000],[5000,7500],[10000,13500],[15000,19500],[20000,25000],[40000,47000],[19474,24421]])assert.equal(repairPartsPrice(cost),price);
 for(const bad of [-1,NaN,Infinity,1.1,'100'])assert.throws(()=>repairPartsPrice(bad));
});
test('no selling-price drops at band boundaries or penny rounding transitions',()=>{
 let last=repairPartsPrice(0);for(let cost=1;cost<=100000;cost++){const next=repairPartsPrice(cost);assert.ok(next>last);last=next;}
 assert.equal(repairPartsPrice(4999),7499);assert.equal(repairPartsPrice(5001),7501);
 assert.equal(repairPartsPrice(14999),19499);assert.equal(repairPartsPrice(15001),19501);
});

test('labour rounds up to 30 minutes; exact half-hours stay unchanged',()=>{
 for(const [source,charged,price] of [[1,500,2500],[499,500,2500],[500,500,2500],[501,1000,5000],[1000,1000,5000],[1100,1500,7500],[1500,1500,7500],[1501,2000,10000],[2000,2000,10000]]){const r=fixture();r.labour.hoursMilli=source;const q=calculateRepairQuote(r,request,{now});assert.equal(q.labour.hoursMilli,source);assert.equal(q.chargedHoursMilli,charged);assert.equal(q.labourPence,price);}
});
test('internal panel shows cost and both time values; invoice and planner use rounded hours',async()=>{
 const e=editor();const raw=fixture();raw.labour.hoursMilli=1100;
 e.ctx.fetch=async()=>({status:200,json:async()=>({status:'MATCHED',quote:calculateRepairQuote(raw,request,{now})})});
 e.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));
 const panel=e.document.querySelector('[data-rq-result]');assert.equal(panel.querySelector('[data-rq-cost]').value,'100.01');assert.match(panel.textContent,/Parts cost priceSale priceLabour hoursLabour costFinal price \(inc VAT\)/);assert.match(panel.textContent,/Haynes time: 1.1 hours/);assert.match(panel.textContent,/Charged time: 1.5 hours/);
 e.document.querySelector('[data-rq-apply]').click();const items=e.ctx.gatherPrivatePricingItems();assert.match(items[1].description,/1.5 hours at £50/);assert.equal(items[1].price,75);assert.equal(items[1].repair_quote.labour.hoursMilli,1100);assert.equal(items[1].repair_quote.chargedHoursMilli,1500);assert.equal(e.document.getElementById('job_estimated_hours').value,'1.5');assert.ok(!items.some(i=>/cost price/i.test(i.description)));
});

test('missing exchange surcharge does not block a quote',()=>{const raw=fixture();raw.parts.forEach(p=>delete p.corePence);const q=calculateRepairQuote(raw,request,{now});assert.equal(q.payableNetPence,q.netPence);assert.equal(q.surchargeExcluded,true);});

test('add parts uses sliding markup, rounds extra labour, totals VAT once and persists every line',async()=>{
 const e=editor();e.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));
 e.document.querySelector('[data-rq-add]').click();const rows=e.document.querySelector('[data-rq-items]');assert.equal(rows.children.length,2);
 const input=(selector,value)=>{const el=rows.children[1].querySelector(selector);el.value=value;el.dispatchEvent(new e.window.Event('input'));};
 input('[data-rq-description]','Drive belt');input('[data-rq-cost]','20');input('[data-rq-hours]','0.1');
 assert.equal(rows.children[1].querySelector('[data-rq-sale]').value,'30.00');assert.equal(rows.children[1].querySelector('[data-rq-labour]').textContent,'£25.00');assert.equal(rows.children[1].querySelector('[data-rq-final]').textContent,'£66.00');assert.equal(e.document.querySelector('[data-rq-total]').textContent,'£320.00');
 e.document.querySelector('[data-rq-apply]').click();const items=e.ctx.gatherPrivatePricingItems();assert.equal(items.length,5);assert.equal(e.document.getElementById('job_amount_quoted').value,'266.67');assert.equal(e.document.getElementById('job_vat_mode').value,'ex_vat');assert.equal(e.document.getElementById('job_estimated_hours').value,'2');assert.equal(items[0].repair_quote.items.length,2);assert.equal(items[0].repair_quote.grossPence,32000);
 e.document.querySelector('[data-rq-apply]').click();assert.equal(e.ctx.gatherPrivatePricingItems().length,5);
 rows.children[1].querySelector('[data-rq-remove]').click();assert.equal(e.document.querySelector('[data-rq-total]').textContent,'£255.00');e.document.querySelector('[data-rq-apply]').click();assert.equal(e.ctx.gatherPrivatePricingItems().length,3);
});
test('blank/invalid additional prices cannot be added; VAT allocation reconciles displayed rows',async()=>{
 const e=editor();e.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));e.document.querySelector('[data-rq-add]').click();assert.equal(e.document.querySelector('[data-rq-apply]').disabled,true);
 const row=e.document.querySelector('[data-rq-items]').children[1];for(const [sel,value] of [['[data-rq-description]','Small part'],['[data-rq-cost]','0.02'],['[data-rq-sale]','0.02']]){const el=row.querySelector(sel);el.value=value;el.dispatchEvent(new e.window.Event('input'));}
 assert.equal(e.document.querySelector('[data-rq-total]').textContent,'£255.00');assert.equal(row.querySelector('[data-rq-final]').textContent,'£0.03');
 row.querySelector('[data-rq-cost]').value='-1';row.querySelector('[data-rq-cost]').dispatchEvent(new e.window.Event('input'));assert.equal(e.document.querySelector('[data-rq-apply]').disabled,true);
});

test('saved multi-part breakdown reopens with cost, sale, source hours and VAT total intact',async()=>{
 const first=editor();first.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));first.document.querySelector('[data-rq-add]').click();const extra=first.document.querySelector('[data-rq-items]').children[1];for(const [sel,val] of [['[data-rq-description]','Belt'],['[data-rq-cost]','20']]){const input=extra.querySelector(sel);input.value=val;input.dispatchEvent(new first.window.Event('input'));}first.document.querySelector('[data-rq-apply]').click();const note=first.ctx.noteWithPrivatePricing('',first.ctx.gatherPrivatePricingItems());
 const next=editor({status:'quote',customer_note:note});assert.equal(next.document.querySelector('[data-rq-items]').children.length,2);assert.equal(next.document.querySelector('[data-rq-total]').textContent,'£290.00');assert.equal(next.document.querySelector('[data-rq-cost]').value,'100.01');
});
test('captured replay is restricted to reviewed test environments and never queries the live queue',async()=>{
 const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'amendment/repair-quote-lookup'};
 assert.equal(repairReplayAvailable(env),true);
 assert.equal(repairReplayAvailable({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'}),true);
 assert.equal(repairReplayAvailable({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'other'}),false);
 for(const change of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VECTA_TEST_SUPABASE_URL:'https://jywufozycuwuoshlulwl.supabase.co'}])assert.equal(repairReplayAvailable({...env,...change}),false);
 const handler=repairQuoteHandler({env,authenticate:async()=>true,queue:()=>{throw Error('Replay must not enqueue');},now:()=>now});
 let res=response();await handler({method:'POST',body:{registration:'FV65JTY',work:'Supply and fit alternator',previewReplay:true}},res);
 assert.equal(res.body.quote.previewOnly,true);assert.equal(res.body.quote.netPence,29583);assert.equal(res.body.quote.part.fitmentConfirmed,false);assert.equal(res.body.quote.part.checkedAt,'2026-10-26T10:39:38.602Z');
 assert.throws(()=>cleanRepairEvidence(res.body.quote,res.body.quote.request,{now}));
 res=response();await handler({method:'POST',body:{...request,previewReplay:true}},res);assert.equal(res.code,400);
 res=response();await repairQuoteHandler({env:{VERCEL_ENV:'production'},authenticate:async()=>true})({method:'POST',body:{previewReplay:true}},res);assert.equal(res.code,403);
});
test('captured PC test renders, adds a part and retains test identity on save/reopen',async()=>{
 const first=editor(),q=repairReplayQuote({registration:'FV65JTY',work:'Supply and fit alternator'},{now});
 first.document.getElementById('job_registration').value='FV65JTY';
 first.ctx.fetch=async(url,options)=>({status:200,json:async()=>options?.method==='POST'?{status:'MATCHED',quote:q}:{replayAvailable:true}});
 first.document.querySelector('[data-rq-replay]').click();await new Promise(r=>setImmediate(r));
 assert.match(first.document.querySelector('.rqStatus').textContent,/TEST REPLAY/);assert.equal(first.document.querySelector('[data-rq-total]').textContent,'£355.00');
 const link=first.document.querySelector('.rqPart a');assert.equal(link.getAttribute('href'),'https://trade.gsfcarparts.com/enhancedSearch/DREA8828');assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');assert.ok(link.querySelector('img'));assert.match(first.document.querySelector('.rqPart').textContent,/Check the selected vehicle/);
 first.document.querySelector('[data-rq-add]').click();const extra=first.document.querySelector('[data-rq-items]').children[1];
 for(const [sel,value] of [['[data-rq-description]','Drive belt'],['[data-rq-cost]','20'],['[data-rq-hours]','0.1']]){const el=extra.querySelector(sel);el.value=value;el.dispatchEvent(new first.window.Event('input'));}
 assert.equal(first.document.querySelector('[data-rq-total]').textContent,'£420.00');
 first.document.querySelector('[data-rq-apply]').click();const items=first.ctx.gatherPrivatePricingItems();assert.match(items[0].description,/^TEST REPLAY/);assert.equal(items[0].repair_quote.previewOnly,true);assert.equal(items[0].repair_quote.evidenceCapturedAt,q.part.checkedAt);assert.equal(first.document.getElementById('job_amount_quoted').value,'350.00');
 const note=first.ctx.noteWithPrivatePricing('',items),next=editor();next.document.getElementById('job_registration').value='FV65JTY';next.document.getElementById('vectaRepairQuote').remove();next.window.VectaRepairQuote.mount({status:'quote',customer_note:note});
 assert.equal(next.document.querySelector('[data-rq-total]').textContent,'£420.00');assert.match(next.document.querySelector('.rqStatus').textContent,/SAVED TEST REPLAY/);
 assert.equal(next.document.querySelector('.rqPart a').getAttribute('href'),link.getAttribute('href'));
});
test('GSF links only retain observed supplier product/search paths without session parameters',()=>{
 const good='https://trade.gsfcarparts.com/enhancedSearch/DREA8828';assert.equal(repairPartUrl(good),good);
 for(const bad of ['javascript:alert(1)','https://evil.example/partdetails/A8828','https://trade.gsfcarparts.com/basket','https://trade.gsfcarparts.com/parts/Alternator',good+'?token=secret','https://trade.gsfcarparts.com@evil.example/partdetails/A8828'])assert.equal(repairPartUrl(bad),'');
 const raw=fixture();raw.parts[1].gsfUrl=good;assert.equal(calculateRepairQuote(raw,request,{now}).part.gsfUrl,good);raw.parts[1].gsfUrl='javascript:alert(1)';assert.equal(calculateRepairQuote(raw,request,{now}).part.gsfUrl,'');
});

test('initial activation scope rejects other registrations before any queue operation',async()=>{
 let calls=0;const h=repairQuoteHandler({env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_QUOTE_ALLOWED_REGISTRATIONS:'FV65JTY'},authenticate:async()=>true,queue:async()=>{calls++;return {status:'PENDING'};}});
 let res=response();await h({method:'POST',body:request},res);assert.equal(res.body.status,'SETTINGS_REQUIRED');assert.equal(calls,0);
 res=response();await h({method:'POST',body:{registration:'FV65 JTY',work:'Supply and fit alternator'}},res);assert.equal(res.body.status,'PENDING');assert.equal(calls,1);
});


test('structured alternator request does not require a typed instruction',async()=>{
 const e=editor();e.document.querySelectorAll('select').forEach(s=>Object.defineProperty(s,'value',{value:'',writable:true}));e.document.getElementById('job_work_required').value='';let payload;
 e.ctx.fetch=async(url,options)=>{payload=JSON.parse(options.body);return {status:200,json:async()=>({status:'UNAVAILABLE'})};};
 const category=e.document.querySelector('[data-rq-category]');category.value='0';category.onchange();
 const part=e.document.querySelector('[data-rq-part]');part.value='alternator';part.onchange();
 e.document.querySelector('[data-rq-find]').click();await new Promise(r=>setImmediate(r));
 assert.equal(payload.work,'Supply and fit alternator');assert.equal(payload.selection.partId,'alternator');assert.equal(payload.selection.quantity,1);
 assert.equal(e.document.getElementById('job_work_required').value,'Supply and fit alternator');
});
test('structured brake choice requires position and sends the selected repair scope',async()=>{
 const e=editor();e.document.querySelectorAll('select').forEach(s=>Object.defineProperty(s,'value',{value:'',writable:true}));let calls=0,payload;e.ctx.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);return {status:200,json:async()=>({status:'UNAVAILABLE'})};};
 const category=e.document.querySelector('[data-rq-category]');category.value='1';category.onchange();
 const part=e.document.querySelector('[data-rq-part]');part.value='brake-pads';part.onchange();
 e.document.querySelector('[data-rq-find]').click();assert.match(e.document.querySelector('.rqStatus').textContent,/Complete the position/);
 const axle=e.document.querySelector('[data-rq-axle]');axle.value='front';axle.onchange();
 e.document.querySelector('[data-rq-find]').click();assert.equal(calls,1);assert.equal(payload.selection.partId,'brake-pads');assert.equal(payload.selection.axle,'front');
 assert.match(e.document.querySelector('[data-rq-supplier]').href,/enhancedSearch\/front%20Brake%20pads$/);
});
test('structured selections cannot price a different part or quantity as one alternator',()=>{
 const selection={partId:'alternator',quantity:1,axle:'',side:''};assert.equal(repairRequest({...request,selection}).operation,'alternator-replacement');
 for(const change of [{partId:'brake-pads'},{quantity:2},{quantity:1.5},{axle:'front'},{side:'left'}])assert.throws(()=>repairRequest({...request,selection:{...selection,...change}}));
});
