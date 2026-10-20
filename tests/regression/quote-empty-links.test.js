import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=new Set(['upsertRemote','syncSavedJobBundleInBackground']);let source='';
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(![...names].some(name=>match[1].includes('function '+name+'(')))continue;
 traverse(parse(match[1],{sourceType:'script'}),{FunctionDeclaration(path){if(names.has(path.node.id.name))source+=match[1].slice(path.node.start,path.node.end)+'\n';}});
}
const id='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
function setup(){
 const writes=[],rows=new Map();let failNext=false;
 const ctx={VECTA_AUDIT_PREVIEW:false,navigator:{onLine:true},window:{},app:{jobs:[]},console:{warn(){},error(){}},
 isUuid:value=>/^[0-9a-f-]{36}$/i.test(value),vectaGuardJobUpsert:async()=>({allow:true}),
 vectaPendingSync:()=>[],vectaStripKnownMissingColumns:(_t,row)=>row,schemaColumnFromError:()=>null,shouldQueueRemoteFailure:()=>false,
 vectaJobHasFinancialValue:()=>false,jobCompletionEvidence:()=>false,persistMainSettings:async()=>true,
 rememberJobCustomer:async()=>{throw Error('A quote must not create a customer record');},
 saveLocal(){},updateConnectivityUI(){},scheduleCloudRefresh(){},setTimeout(){},
 remoteClient:{from(table){return {upsert(data){writes.push({table,data:JSON.parse(JSON.stringify(data))});return {select:async()=>{
  if(failNext){failNext=false;return {error:{message:'Temporary server rejection'}};}
  if(['customer_id','vehicle_id'].some(k=>data[k]===''||typeof data[k]==='string'&&!data[k].trim()))return {error:{message:'invalid input syntax for type uuid: ""'}};
  if(['customer_id','vehicle_id'].some(k=>data[k]&& !/^[0-9a-f-]{36}$/i.test(data[k])))return {error:{message:'invalid input syntax for type uuid'}};
  rows.set(data.id,JSON.parse(JSON.stringify(data)));return {data:[rows.get(data.id)],error:null};
 }};}};}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,writes,rows,rejectNext:()=>{failNext=true;}};
}
function quote(overrides={}){return {id,status:'quote',registration:'SW64NDN',customer_id:'',vehicle_id:'',customer_name:'Customer',customer_phone:'',work_required:'Rear wheel bearing',customer_note:'Priced quote',amount_quoted:250,technician:'Unallocated',booking_date:null,archived:false,...overrides};}
test('a new quote with empty optional UUID links is confirmed without creating master records',async()=>{
 const {ctx,writes,rows}=setup(),job=quote(),before=JSON.stringify(job);ctx.app.jobs=[job];
 assert.equal(await ctx.syncSavedJobBundleInBackground({...job},null,null),true);
 assert.equal(writes.length,1);assert.equal(writes[0].table,'jobs');
 assert.equal(writes[0].data.customer_id,null);assert.equal(writes[0].data.vehicle_id,null);
 assert.equal(rows.get(id).customer_name,'Customer');assert.equal(rows.get(id).work_required,'Rear wheel bearing');
 assert.equal(rows.get(id).amount_quoted,250);assert.equal(rows.get(id).status,'quote');
 assert.equal(JSON.stringify(job),before);
});
test('valid existing links are retained; whitespace-only links become NULL',async()=>{
 const {ctx,writes}=setup();await ctx.upsertRemote('jobs',quote({customer_id:customer,vehicle_id:'  '}),{silent:true,jobWriteIntent:'create'});
 assert.equal(writes[0].data.customer_id,customer);assert.equal(writes[0].data.vehicle_id,null);
});
test('a failed quote save remains retryable under the same ID without duplicate records',async()=>{
 const {ctx,rejectNext,rows,writes}=setup(),job=quote();ctx.app.jobs=[job];rejectNext();
 assert.equal(await ctx.syncSavedJobBundleInBackground({...job},null,null),false);assert.equal(rows.size,0);
 assert.equal(await ctx.syncSavedJobBundleInBackground({...job},null,null),true);assert.equal(rows.size,1);
 assert.equal(writes[0].data.id,writes[1].data.id);
});
test('invalid non-empty IDs still fail instead of silently dropping a customer link',async()=>{
 const {ctx,rows}=setup();await assert.rejects(()=>ctx.upsertRemote('jobs',quote({customer_id:'not-a-uuid'}),{silent:true,jobWriteIntent:'create'}),e=>/uuid/.test(e.message));assert.equal(rows.size,0);
});
