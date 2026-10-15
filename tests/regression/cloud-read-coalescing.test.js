import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(fetchRows,{pageSize=2,maxRows=20}={}){
 const context={AbortController,setTimeout,clearTimeout,WeakMap,Map,Set,JSON};
 vm.runInNewContext(fs.readFileSync('public/js/vecta-cloud-reads.js','utf8'),context);
 let state={version:0,writing:false},current;
 const calls=[];
 const client={from(table){const q={table};return {
  select(columns){assert.equal(columns,'*');return this;},
  order(column,options){assert.equal(column,'id');assert.equal(options.ascending,true);return this;},
  limit(n){q.limit=n;return this;},gt(column,id){assert.equal(column,'id');q.after=id;return this;},
  abortSignal(signal){calls.push(q);return fetchRows(q,signal);}
 };}};current=client;
 const read=context.VectaCloudReads.createReader({getClient:()=>current,getReadState:()=>state,pageSize,maxRows});
 return {read,calls,setState(value){state=value;},changeClient(){current={from:client.from};}};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('concurrent refreshes share pages but own their data; later refreshes do not use cached results',async()=>{
 const gate=deferred();const c=setup(async()=>{await gate.promise;return {data:[{id:'1',nested:{value:'original'}}]};});
 const first=c.read('jobs'),second=c.read('jobs');assert.equal(c.calls.length,1);gate.resolve();
 const [a,b]=await Promise.all([first,second]);a[0].nested.value='edited';assert.equal(b[0].nested.value,'original');
 await c.read('jobs');assert.equal(c.calls.length,2);
});

test('a write boundary, active write, different table, timeout or client never reuses an older read',async()=>{
 const gate=deferred();const c=setup(async()=>{await gate.promise;return {data:[]};});
 const calls=[c.read('jobs')];c.setState({version:1,writing:false});calls.push(c.read('jobs'));
 c.setState({version:2,writing:true});calls.push(c.read('jobs'),c.read('jobs'));
 c.setState({version:3,writing:false});calls.push(c.read('tasks'),c.read('jobs',5000));
 c.changeClient();calls.push(c.read('jobs'));assert.equal(c.calls.length,7);gate.resolve();await Promise.all(calls);
});

test('stable id cursor does not skip records when an earlier row is deleted between pages',async()=>{
 const rows=[{id:'1'},{id:'2'},{id:'3'},{id:'4'}];
 const c=setup(async({after,limit})=>{if(after)rows.splice(0,1);return {data:rows.filter(r=>!after||r.id>after).slice(0,limit)};});
 const result=await c.read('jobs');assert.deepEqual(result.map(r=>r.id),['1','2','3','4']);assert.deepEqual(c.calls.map(q=>q.after),[undefined,'2','4']);
});

test('later-page error never returns a partial collection, and the next refresh can retry',async()=>{
 let fail=true;const c=setup(async({after})=>after?(fail?{error:Error('offline')}:{data:[]}):{data:[{id:'1'},{id:'2'}]});
 await assert.rejects(c.read('invoices'),/offline/);fail=false;assert.equal((await c.read('invoices')).length,2);
});

test('timeout aborts the actual query and clears the in-flight entry',async()=>{
 let fail=true;const c=setup(async(_,signal)=>fail?new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})):{data:[]});
 await assert.rejects(c.read('jobs',10),/timed out|aborted/);fail=false;assert.deepEqual(await c.read('jobs',10),[]);
});

test('duplicate identities, malformed data and excessive rows fail before reconciliation',async()=>{
 for(const fetchRows of [async()=>({data:[{id:'1'},{id:'1'}]}),async()=>({data:null}),async()=>({data:[{id:null}]})]){
  const c=setup(fetchRows);await assert.rejects(c.read('jobs'),/Invalid cloud/);
 }
 const c=setup(async()=>({data:[{id:'1'},{id:'2'}]}),{maxRows:1});await assert.rejects(c.read('jobs'),/Safety limit/);
});

test('SDK write tracking invalidates reads on success and failure',async()=>{
 let options;const gate=deferred();let fail=false;
 const root={addEventListener(){},supabase:{createClient(_u,_k,o){options=o;return {}; }},fetch:async()=>{await gate.promise;if(fail)throw Error('offline');return new Response('[]');}};
 vm.runInNewContext(fs.readFileSync('public/js/vecta-workshop-access.js','utf8'),{window:root,Headers,AbortSignal,setTimeout,clearTimeout});
 root.VectaWorkshopAccess.createClient('https://example.test','test');
 const write=options.global.fetch('https://example.test/rest/v1/jobs',{method:'PATCH'});
 assert.equal(root.VectaWorkshopAccess.readState().writing,true);assert.equal(root.VectaWorkshopAccess.readState().version,1);
 gate.resolve();await write;assert.equal(root.VectaWorkshopAccess.readState().writing,false);assert.equal(root.VectaWorkshopAccess.readState().version,2);
 fail=true;await assert.rejects(options.global.fetch('https://example.test/rest/v1/jobs',{method:'POST'}),/offline/);assert.equal(root.VectaWorkshopAccess.readState().version,4);assert.equal(root.VectaWorkshopAccess.readState().writing,false);
});
