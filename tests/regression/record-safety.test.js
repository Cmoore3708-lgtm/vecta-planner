import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../public/js/vecta-fleet-concurrency.js';
const {merge,save}=globalThis.VectaFleetConcurrency;
const base={vehicles:[{id:'v1',email:'old',model:'Car',updated_at:'2026-01-01'}],plans:[{id:'p1',due:'2026-01-01'}],customers:{Company:{email:'old'}},updated_at:'2026-01-01'};
const clone=structuredClone;
test('PC contact edit and iPad service completion both survive; clearing a field stays cleared',()=>{
 const pc=clone(base),ipad=clone(base);pc.vehicles[0].email='';pc.vehicles[0].updated_at='2026-10-01';ipad.plans[0].due='2027-01-01';ipad.vehicles[0].model='New model';ipad.vehicles[0].updated_at='2026-10-02';
 const result=merge(base,pc,ipad);assert.equal(result.vehicles[0].email,'');assert.equal(result.vehicles[0].model,'New model');assert.equal(result.plans[0].due,'2027-01-01');assert.equal(base.vehicles[0].email,'old');
});
test('concurrent edits to the same field, or delete versus edit, are rejected',()=>{
 const pc=clone(base),ipad=clone(base);pc.vehicles[0].email='pc';ipad.vehicles[0].email='ipad';assert.throws(()=>merge(base,pc,ipad),{code:'FLEET_CONFLICT'});
 pc.vehicles=[];assert.throws(()=>merge(base,pc,ipad),{code:'FLEET_CONFLICT'});
});
test('independent additions and deletions preserve other records',()=>{
 const pc=clone(base),ipad=clone(base);pc.plans=[];ipad.vehicles.push({id:'v2',email:'new'});const result=merge(base,pc,ipad);assert.equal(result.plans.length,0);assert.equal(result.vehicles.length,2);
});
function database(initial,race){
 let row=clone(initial),writes=0;
 return {get row(){return row},get writes(){return writes},from(){
  let mode='read',body,stamp;
  const q={select(){return q},eq(k,v){if(k==='updated_at')stamp=v;return q},is(k,v){stamp=v;return q},maybeSingle:async()=>({data:clone(row)}),update(v){mode='update';body=v;return q},insert(v){mode='insert';body=v;return q},then(resolve,reject){return (async()=>{
   writes++;if(race&&writes===1){row=race(clone(row));return {data:[]}};
   if(mode==='update'&&row.updated_at!==stamp)return {data:[]};
   row={id:'fleet',...body,updated_at:'revision-'+writes};return {data:[clone(row)]};
  })().then(resolve,reject)}};return q;
 }};
}
test('conditional save retries after a race and keeps the competing edit',async()=>{
 const desired=clone(base);desired.vehicles[0].email='pc';const db=database({id:'fleet',value:base,updated_at:'revision-0'},row=>{row.value.plans[0].due='2027-05-01';row.updated_at='revision-1';return row});
 const result=await save(db,{id:'fleet',base,desired});assert.equal(db.writes,2);assert.equal(result.value.vehicles[0].email,'pc');assert.equal(result.value.plans[0].due,'2027-05-01');
});
test('a conflicting save never writes or reports cloud confirmation',async()=>{
 const remote=clone(base);remote.vehicles[0].email='ipad';const desired=clone(base);desired.vehicles[0].email='pc';const db=database({id:'fleet',value:remote,updated_at:'r1'});
 await assert.rejects(save(db,{id:'fleet',base,desired}),{code:'FLEET_CONFLICT'});assert.equal(db.writes,0);
 await assert.rejects(save(db,{id:'fleet',base:null,desired}),/finish its cloud download/);
});
test('invoice lookup cannot claim a later visit or write completion state',()=>{
 const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');const code=html.slice(html.indexOf('function savedInvoiceForJobId('),html.indexOf('function invoiceNumericPart('));
 const job={id:'job1',registration:'AB12CDE',status:'booked'},invoice={id:'inv1',registration:'AB12CDE',invoice_date:'2027-01-01',customer_name:'Same customer'};
 const c={app:{jobs:[job]},vectaActiveInvoices:()=>[invoice],saveLocal:()=>{throw Error('unexpected write')},upsertRemote:()=>{throw Error('unexpected write')}};vm.createContext(c);vm.runInContext(code,c);
 assert.equal(c.savedInvoiceForJobId('job1'),null);assert.equal(job.status,'booked');invoice.job_id='job1';assert.equal(c.savedInvoiceForJobId('job1'),invoice);assert.equal(c.savedInvoiceForJobId('job1','inv1'),null);
});
function worker(){
 const stores=new Map();const c={Headers,Request,Response,URL,Date,Set,Promise,console,fetch:async()=>new Response('[{"id":"live"}]',{headers:{'content-type':'application/json'}}),caches:{async open(name){if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {put:async(req,res)=>m.set(typeof req==='string'?req:req.url,res.clone()),match:async req=>m.get(typeof req==='string'?req:req.url)?.clone()}}},self:{addEventListener(){}}};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../../public/service-worker.js',import.meta.url),'utf8'),c);return {c,run:code=>vm.runInContext(code,c)};
}
test('cached viewing is labelled stale while fresh-required reconciliation fails offline',async()=>{
 const w=worker();w.c.req=new Request('https://test.supabase.co/rest/v1/jobs?select=*');await w.run('fetchSupabaseWithLastKnownFallback(req)');w.c.fetch=async()=>{throw Error('offline')};
 const cached=await w.run('fetchSupabaseWithLastKnownFallback(req)');assert.equal(cached.headers.get('X-Vecta-Data-State'),'stale');assert.notEqual(cached.headers.get('X-Vecta-Cached-At'),'unknown');
 w.c.req=new Request(w.c.req,{headers:{'X-Vecta-Require-Fresh':'1'}});assert.equal((await w.run('fetchSupabaseWithLastKnownFallback(req)')).type,'error');
 assert.equal((await w.run('handleJobsHealthProbe(req)')).type,'error');
});
test('authorization failure never falls back to cached workshop data',async()=>{
 const w=worker();w.c.req=new Request('https://test.supabase.co/rest/v1/jobs');await w.run('fetchSupabaseWithLastKnownFallback(req)');w.c.fetch=async()=>new Response('Denied',{status:401});assert.equal((await w.run('fetchSupabaseWithLastKnownFallback(req)')).status,401);
});
