import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {parseHTML} from 'linkedom';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../../public/js/vecta-billing-integrity.js',import.meta.url),'utf8');
const wanted=['vectaGuardJobUpsert','upsertRemote','queueRemoteOperation','vectaLikelyNewOfflineJob','fleetEomBillingMonth','vectaFleetDuplicatePairs','vectaOpenFleetDuplicateReview'];
let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(!wanted.some(n=>m[1].includes('function '+n+'(')))continue;
 traverse(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(p){if(wanted.includes(p.node.id.name))source+=m[1].slice(p.node.start,p.node.end)+'\n';}});
}
const id='231f6b4f-bf43-4f38-9b88-4d106bd0df90';
function context(extra={}){
 const c={console,app:{settings:{}},navigator:{onLine:true},VECTA_AUDIT_PREVIEW:false,vectaPendingSync:()=>[],isUuid:()=>true,jobCompletionEvidence:j=>j.status==='completed',vectaStripKnownMissingColumns:(t,r)=>r,vectaJobHasFinancialValue:()=>false,vectaProtectJobSnapshot:async()=>true,fromRemote:r=>r,vectaUndoStamp:()=>'',vectaAdoptRemoteJob:()=>{},vectaSameRemoteJobField:(a,b)=>a===b,vectaJobIsDeletedForLists:j=>j.status==='deleted',financeIsRecognisedJob:j=>j.status==='completed',fleetCustomerForJob:()=> 'NMUK',...extra};vm.createContext(c);vm.runInContext(rules+'\n'+source,c);return c;
}
function probe(remote,history=[]){return {from:table=>({select:()=>({eq:()=>({limit:async()=>({data:remote?[remote]:[]})}),in:()=>({limit:async()=>({data:history})})})})};}
test('missing existing cards cannot be recreated; a genuine creation is explicit and checks server history',async()=>{
 const c=context({remoteClient:probe(null)});
 assert.equal((await c.vectaGuardJobUpsert({id},{})).allow,false);
 assert.equal((await c.vectaGuardJobUpsert({id},{jobWriteIntent:'create'})).allow,true);
 c.remoteClient=probe(null,[{id:'job_terminal:'+id}]);
 await assert.rejects(c.vectaGuardJobUpsert({id},{jobWriteIntent:'create'}),/previous server history/);
 c.remoteClient=probe({id,status:'deleted'});
 await assert.rejects(c.vectaGuardJobUpsert({id},{}),/deleted/);
});
test('existing writes use UPDATE and a vanished row fails without an insert, even if the preflight was skipped',async()=>{
 let updates=0,inserts=0;
 const c=context({remoteClient:{from:()=>({update:()=>{updates++;return {eq:()=>({select:async()=>({data:[]})})};},upsert:()=>{inserts++;throw Error('must not insert');}})}});
 await assert.rejects(c.upsertRemote('jobs',{id},{skipConflictGuard:true}),/no longer exists/);
 assert.equal(updates,1);assert.equal(inserts,0);
});
test('offline queue preserves creation intent on repeated saves; old timestamp heuristics cannot recreate jobs',()=>{
 let queue=[];const c=context({vectaPendingSync:()=>queue,vectaSavePendingSync:q=>{queue=q;}});
 c.queueRemoteOperation('upsert','jobs',{id},{jobWriteIntent:'create'});
 c.queueRemoteOperation('upsert','jobs',{id,status:'booked'},{jobWriteIntent:'update'});
 assert.equal(queue.length,1);assert.equal(queue[0].jobWriteIntent,'create');
 assert.equal(c.vectaLikelyNewOfflineJob(queue[0]),true);
 assert.equal(c.vectaLikelyNewOfflineJob({operation:'upsert',payload:{id,created_at:new Date().toISOString()},queued_at:new Date().toISOString()}),false);
});
function priced(id,date,rows){return {id,registration:'NK72 KTE',status:'completed',booking_date:date,job_type:'Major Service',amount_quoted:rows.reduce((s,r)=>s+r.price,0),customer_note:'[[VECTA_PRIVATE_PRICING:'+encodeURIComponent(JSON.stringify(rows))+']]'};}
test('different dates, wording and prices still expose partial overlaps while keeping additional items',()=>{
 const c=context();const a=priced('a','2026-08-19',[{description:'Major Service',price:170},{description:'Repair damaged fuel line',price:80}]);
 const b=priced('b','2026-08-21',[{description:'Major service including filters',price:140},{description:'Repair fuel line on engine',price:70},{description:'Supply new NOx sensor',price:290}]);
 const matches=c.VectaBillingIntegrity.overlaps(a,b);assert.equal(matches.length,2);assert.equal(b.amount_quoted,500);assert.equal(c.VectaBillingIntegrity.items(b).length,3);
 assert.equal(c.VectaBillingIntegrity.overlaps(a,{...b,booking_date:'2026-10-19'}).length,0);
 assert.equal(c.VectaBillingIntegrity.overlaps(a,{...b,registration:'OTHER'}).length,0);
});
test('recorded separate-work reason expires when either card or its price changes',()=>{
 const c=context();const a=priced('a','2026-08-19',[{description:'Major Service',price:170}]),b=priced('b','2026-08-20',[{description:'Major Service',price:140}]);
 const rows=[{job:a,customer:'NMUK'}];assert.equal(c.vectaFleetDuplicatePairs(rows,[a,b]).length,1);
 c.app.settings.fleetDuplicateReviews={'a:b':{signature:c.VectaBillingIntegrity.signature(a,b),reason:'Separate visits confirmed'}};
 assert.equal(c.vectaFleetDuplicatePairs(rows,[a,b]).length,0);
 assert.equal(c.vectaFleetDuplicatePairs(rows,[a,{...b,amount_quoted:150}]).length,1);
});
test('a saved fleet invoice pins billing month even if completion date or hold marker changes',()=>{
 const c=context({vectaActiveInvoices:()=>[{fleet_month:'2026-09',fleet_job_ids:[id]}],financeCompletedDate:()=> '2026-08-19'});
 assert.equal(c.fleetEomBillingMonth({id,customer_note:'[[EOM_BILL_MONTH:2026-10]]'}),'2026-09');
});
test('review UI keeps both item lists and extra work; an unconfirmed review cannot suppress the warning',async()=>{
 const {document}=parseHTML('<html><body><div id="jobModal"></div></body></html>');
 let opened='',warning='';
 const c=context({document,esc:value=>String(value||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'),niceDate:x=>x,money:x=>'£'+x,
 openJobModal:id=>{opened=id;},closeModals(){},prompt:()=> 'Separate work confirmed',persistMainSettings:async()=>false,alert:m=>{warning=m;}});
 const a=priced('a','2026-08-19',[{description:'Major Service',price:170}]),b=priced('b','2026-08-20',[{description:'Major Service',price:140},{description:'NOx sensor <extra>',price:290}]);
 const rows=[{job:a,customer:'NMUK'}],pairs=c.vectaFleetDuplicatePairs(rows,[a,b]);
 c.vectaOpenFleetDuplicateReview('NMUK','2026-08',rows,pairs);
 assert.equal(document.querySelectorAll('[data-review-job]').length,2);
 assert.match(document.getElementById('jobModal').textContent,/NOx sensor <extra>/);
 document.querySelector('[data-review-job="b"]').onclick();assert.equal(opened,'b');
 await document.querySelector('[data-separate-work]').onclick();
 assert.match(warning,/not saved/);assert.equal(c.vectaFleetDuplicatePairs(rows,[a,b]).length,1);
});
