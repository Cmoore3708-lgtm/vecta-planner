import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8'),functions=new Map();
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=/.test(match[1])||!match[2].includes('async function vectaCreateDailyBackup('))continue;
 const source=match[2],ast=parse(source,{sourceType:'unambiguous'});
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&!functions.has(node.id.name))functions.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}};visit(ast.program);
}
function load(context,names){vm.createContext(context);for(const name of names){assert.ok(functions.has(name),name);vm.runInContext(functions.get(name),context);}return context;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function backupContext(extra={}){return load({vectaLocalRecoveryReady:true,vectaBackupInFlight:null,vectaBackupRequested:false,vectaBackupForce:false,vectaBackupSource:'',navigator:{onLine:false},vectaCloudReachable:false,localStorage:{setItem(){}},vectaBackupJobCount:s=>s.record_counts.jobs,vectaListBackups:()=>{throw Error('Normal saves must not read historical backups');},...extra},['vectaCreateDailyBackup']);}
test('burst saves write once, then capture the newest state arriving during the write',async()=>{
 let state=1,release;const writes=[];
 const c=backupContext({vectaBackupPayload:()=>({record_counts:{jobs:1},created_at:String(state),app:{jobs:[{id:'j',amount:state}]}}),vectaStoreBackup:async s=>{writes.push(s);if(writes.length===1)await new Promise(r=>release=r);}});
 const promises=[c.vectaCreateDailyBackup(false,'first')];state=2;promises.push(c.vectaCreateDailyBackup(false,'second'));await tick();
 assert.equal(writes.length,1);assert.equal(writes[0].app.jobs[0].amount,2);
 for(state=3;state<=40;state++)promises.push(c.vectaCreateDailyBackup(false,'overlap'));state=40;
 release();await Promise.all(promises);
 assert.equal(writes.length,2);assert.equal(writes[1].app.jobs[0].amount,40);assert.equal(c.vectaBackupInFlight,null);
});
test('failed backup can retry and an empty automatic snapshot cannot replace usable history',async()=>{
 let fail=true,writes=0;const good={record_counts:{jobs:4},app:{jobs:[{id:'preserve'}]}};
 const c=backupContext({vectaBackupPayload:()=>({record_counts:{jobs:1},created_at:'now'}),vectaStoreBackup:async()=>{if(fail)throw Error('quota');writes++;}});
 await assert.rejects(c.vectaCreateDailyBackup(false),/quota/);assert.equal(c.vectaBackupInFlight,null);
 fail=false;await c.vectaCreateDailyBackup(false);assert.equal(writes,1);
 c.vectaBackupPayload=()=>({record_counts:{jobs:0}});c.vectaListBackups=async()=>[good];
 assert.equal(await c.vectaCreateDailyBackup(false),good);assert.equal(writes,1);
});
test('retention deletes only old daily keys without deserialising snapshot bodies',async()=>{
 const keys=Array.from({length:35},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0')),deleted=[];let closed=0;
 const c=load({VECTA_BACKUP_STORE:'snapshots',VECTA_BACKUP_RETENTION:30,vectaOpenBackupDb:async()=>({close(){closed++;},transaction(){const tx={objectStore(){return {getAll(){throw Error('Read full snapshots');},getAllKeys(){const req={};queueMicrotask(()=>{req.result=keys;req.onsuccess();tx.oncomplete();});return req;},delete:key=>deleted.push(key)}}};return tx;}})},['vectaPruneBackups']);
 await c.vectaPruneBackups();assert.deepEqual(deleted,keys.slice(0,5).reverse());assert.equal(closed,1);
});
test('backup health/download read one snapshot and leave the IndexedDB schema unchanged',async()=>{
 const rows=[{id:'2026-10-03',created_at:'2026-10-03'},{id:'2026-10-02',created_at:'2026-10-02'}];let reads=0;
 const db={close(){},transaction(){
  const tx={objectStore(){return {openCursor(_range,direction){
   assert.equal(direction,'prev');let index=0;const req={};
   const emit=()=>queueMicrotask(()=>{
    let continued=false;
    req.result=index<rows.length?{get value(){reads++;return rows[index]},continue(){continued=true;index++;emit();}}:null;
    req.onsuccess();if(!continued)queueMicrotask(()=>tx.oncomplete());
   });emit();return req;
  }}}};return tx;
 }};
 const c=load({VECTA_BACKUP_STORE:'snapshots',console,vectaOpenBackupDb:async()=>db},['vectaListBackups']);
 const result=await c.vectaListBackups(1);assert.equal(result.length,1);assert.equal(reads,1);
 assert.match(functions.get('vectaDownloadLatestBackup'),/vectaListBackups\(1\)/);
 assert.match(functions.get('vectaOpenBackupDb'),/indexedDB\.open\(VECTA_BACKUP_DB,1\)/);
});
function paperwork(rows,local=[]){
 const calls=[],state={failBatch:0};let batches=0;
 const client={from(table){assert.equal(table,'workshop_settings');const q={selection:'',pattern:'',after:null,ids:null,max:500,select(s){this.selection=s;return this;},like(_key,p){this.pattern=p;return this;},order(){return this;},limit(n){this.max=n;return this;},gt(_key,v){this.after=v;return this;},in(_key,ids){this.ids=ids;return this;},then(resolve,reject){calls.push({...this});let data;
   if(this.ids){batches++;if(state.failBatch===batches)return Promise.resolve({error:Error('Interrupted batch')}).then(resolve,reject);data=rows.filter(r=>this.ids.includes(r.id));}
   else data=rows.filter(r=>r.id.startsWith(this.pattern.slice(0,-1))&&(this.after===null||r.id>this.after)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,this.max).map(({id,updated_at})=>({id,updated_at}));
   return Promise.resolve({data:structuredClone(data)}).then(resolve,reject);
 }};return q;}};
 const c=load({remoteClient:client,app:{serviceRecords:structuredClone(local)},vectaWithTimeout:p=>p,normaliseCompletedJobState:r=>r,jobCompletionEvidence:()=>false},['fromRemote','mergeRemoteRows','vectaRefreshPaperworkFromCloud']);
 return {c,calls,state};
}
const sheet=(n,stamp='2026-11-03')=>({id:'service:'+String(n).padStart(4,'0'),updated_at:stamp,value:{html:'<p>Saved checks '+n+'</p>',registration:'TEST',job_id:'job-'+n,mileage:40000}});
test('unchanged paperwork transfers metadata only, while changes and missing sheets load full content',async()=>{
 const rows=[sheet(1),sheet(2),sheet(3)],{c,calls}=paperwork(rows);
 await c.vectaRefreshPaperworkFromCloud();assert.equal(c.app.serviceRecords.length,3);assert.equal(c.app.serviceRecords[0].mileage,40000);
 calls.length=0;await c.vectaRefreshPaperworkFromCloud();assert.equal(calls.filter(q=>q.ids).length,0);assert.ok(calls.every(q=>q.selection==='id,updated_at'));
 rows[1]=sheet(2,'2026-11-04');c.app.serviceRecords=c.app.serviceRecords.filter(r=>r.id!==rows[2].id);calls.length=0;
 await c.vectaRefreshPaperworkFromCloud();assert.deepEqual(Array.from(calls.find(q=>q.ids).ids),[rows[1].id,rows[2].id]);assert.equal(c.app.serviceRecords.length,3);
});
test('paperwork index paginates beyond a thousand records and failed content batches cannot merge partial results',async()=>{
 const rows=Array.from({length:1001},(_,n)=>sheet(n)),{c,calls}=paperwork(rows,rows.map(r=>({...r.value,id:r.id,updated_at:r.updated_at})));
 await c.vectaRefreshPaperworkFromCloud();assert.equal(calls.filter(q=>q.pattern==='service:%').length,3);assert.equal(calls.filter(q=>q.ids).length,0);
 const broken=paperwork(Array.from({length:51},(_,n)=>sheet(n)),[{id:'service:old',html:'offline',updated_at:'2026-11-04'}]);broken.state.failBatch=2;
 await assert.rejects(broken.c.vectaRefreshPaperworkFromCloud(),/Interrupted batch/);assert.equal(broken.c.app.serviceRecords.length,1);assert.equal(broken.c.app.serviceRecords[0].html,'offline');
 broken.state.failBatch=0;await broken.c.vectaRefreshPaperworkFromCloud();assert.equal(broken.c.app.serviceRecords.length,52);
});
test('newer local paperwork and cached records missing from cloud survive refresh',async()=>{
 const r=sheet(1),{c}=paperwork([r],[{...r.value,id:r.id,html:'local unsaved checks',updated_at:'2026-11-05'},{id:'service:history',html:'historical original',updated_at:'2026-10-01'}]);
 await c.vectaRefreshPaperworkFromCloud();assert.equal(c.app.serviceRecords.find(s=>s.id===r.id).html,'local unsaved checks');assert.equal(c.app.serviceRecords.find(s=>s.id==='service:history').html,'historical original');
});
