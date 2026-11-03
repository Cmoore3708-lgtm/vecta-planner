import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {parse} from '@babel/parser';
const code=fs.readFileSync(new URL('../../public/js/vecta-paperwork-cache.js',import.meta.url),'utf8');
const context=vm.createContext({crypto:webcrypto,TextEncoder,setTimeout,clearTimeout});vm.runInContext(code,context);const api=context.VectaPaperworkCache;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const deadline=Date.now()+5000;while(!check()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(check(),'asynchronous write did not start');}
function adapter(options={}){const bodies=new Map(),writes=[];return {bodies,writes,readBodies:async hashes=>new Map(hashes.filter(h=>bodies.has(h)).map(h=>[h,bodies.get(h)])),writeBodies:async rows=>{writes.push(rows);await options.beforeWrite?.();for(const row of rows)bodies.set(row.hash,row.html);}};}
const sheet=(id='service:TEST:job',html='<div data-job-id="job"><span class="ssCheck checked"></span></div>')=>({id,html,registration:'TEST',job_id:'job',sheet_type:'service',service_date:'2026-05-19',mileage:55118,updated_at:'2026-11-03T12:00:00Z'});
test('HTML leaves the main state only after a committed write; canonical copies share one body',async()=>{
 let release;const disk=adapter({beforeWrite:()=>new Promise(r=>release=r)}),cache=api.create(disk),records=[sheet(),sheet('service:TEST')];
 const task=cache.persist(records);await until(()=>!!release);assert.equal(cache.compact(records)[0].html,records[0].html);
 release();await task;const compact=cache.compact(records);assert.equal(compact[0].html,undefined);assert.match(compact[0].vecta_paperwork_ref,/^[a-f0-9]{64}$/);assert.equal(disk.bodies.size,1);assert.equal(disk.writes[0].length,1);
 assert.equal(compact[0].service_date,'2026-05-19');assert.equal(compact[0].mileage,55118);assert.equal(records[0].html.length>0,true);
 const reopened=api.create(disk),full=await reopened.hydrate(compact);assert.equal(full[0].html,records[0].html);assert.equal(full[1].html,records[1].html);
});
test('quota and hashing failures preserve the full legacy payload and remain retryable',async()=>{
 const disk=adapter(),records=[sheet()];let fail=true;
 const cache=api.create({...disk,writeBodies:async rows=>{if(fail)throw Error('QuotaExceededError');return disk.writeBodies(rows);}});
 await assert.rejects(cache.persist(records),/Quota/);assert.equal(cache.compact(records)[0].html,records[0].html);
 fail=false;await cache.persist(records);assert.equal(cache.compact(records)[0].html,undefined);
 const bad=api.create({...disk,digest:async()=>{throw Error('Crypto unavailable');}});await assert.rejects(bad.persist(records),/Crypto/);assert.equal(bad.compact(records)[0].html,records[0].html);
});
test('rapid edits, metadata-only edits and an edit reverted during a write preserve the latest body',async()=>{
 const disk=adapter(),cache=api.create(disk),record=sheet();await cache.persist([record]);const first=record.html;
 let release,started=0;const original=disk.writeBodies; // Use a fresh writer to hold the next changed revision.
 const held=api.create({...disk,writeBodies:async rows=>{started++;await new Promise(r=>release=r);return original(rows);}});
 record.html='changed checks';const task=held.persist([record]);await until(()=>started===1);record.html=first;const next=held.persist([record]);release();await until(()=>started===2);release();await Promise.all([task,next]);
 assert.equal((await held.hydrate(held.compact([record])))[0].html,first);
 const count=disk.writes.length;record.service_date='2026-05-20';await held.persist([record]);assert.equal(disk.writes.length,count);assert.equal(held.compact([record])[0].service_date,'2026-05-20');
});
test('missing or corrupt content cannot become a blank sheet; exact backups recover it and are re-persisted',async()=>{
 const record=sheet(),hash=await api.bodyHash(record.html),metadata={...record,vecta_paperwork_ref:hash};delete metadata.html;
 const disk=adapter(),cache=api.create(disk);await assert.rejects(cache.hydrate([metadata]),/unavailable/);
 disk.bodies.set(hash,'corrupt contents');await assert.rejects(cache.hydrate([metadata]),/unavailable/);
 const recovered=await cache.hydrate([metadata],{recover:async()=>new Map([[hash,record.html]])});assert.equal(recovered[0].html,record.html);
 assert.equal(cache.compact(recovered)[0].html,record.html,'a recovered copy remains inline until its separate write commits');await cache.persist(recovered);assert.equal(disk.bodies.get(hash),record.html);assert.equal(cache.compact(recovered)[0].html,undefined);
 await assert.rejects(api.create(adapter()).hydrate([metadata],{recover:async()=>new Map([[hash,'an older different sheet']])}),/unavailable/);
});

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8'),functions=new Map();
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=/.test(match[1])||!match[2].includes('function vectaGetPaperworkCache('))continue;const source=match[2],ast=parse(source,{sourceType:'unambiguous'});
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&!functions.has(node.id.name))functions.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}};visit(ast.program);
}
function load(ctx,names){vm.createContext(ctx);for(const name of names){assert.ok(functions.has(name),name);vm.runInContext(functions.get(name),ctx);}return ctx;}
test('completion of a background paperwork write compacts the newest job state, not a stale captured app',async()=>{
 let release;const disk=adapter({beforeWrite:()=>new Promise(r=>release=r)}),storage=new Map(),record=sheet('service:TEST:job','x'.repeat(1000000));
 const c=load({window:{VectaPaperworkCache:{create:options=>api.create({...options,...disk})}},vectaPaperworkStore:null,vectaLocalRecoveryReady:true,vectaLocalStorageLimited:false,app:{jobs:[{id:'job',work_required:'first'}],serviceRecords:[record]},localStorage:{setItem:(k,v)=>storage.set(k,v)},STORE_KEY:'app',vectaCreateDailyBackup:async()=>{},vectaIsQuotaError:()=>false,console},['vectaGetPaperworkCache','vectaLocalStateSnapshot','vectaCompactLocalState','vectaPersistPaperwork','saveLocal']);
 c.saveLocal();await until(()=>!!release);assert.ok(storage.get('app').length>1000000);c.app.jobs[0].work_required='latest offline edit';c.saveLocal();release();await c.vectaPersistPaperwork();
 const saved=JSON.parse(storage.get('app'));assert.equal(saved.jobs[0].work_required,'latest offline edit');assert.equal(saved.serviceRecords[0].html,undefined);assert.ok(storage.get('app').length<1000);assert.equal(c.app.serviceRecords[0].html.length,1000000);
});
test('late hydration never overwrites paperwork that arrived from cloud during the local read',async()=>{
 let release;const old={...sheet(),vecta_paperwork_ref:'a'.repeat(64)};delete old.html;const c=load({app:{serviceRecords:[old]},vectaGetPaperworkCache:()=>({hydrate:()=>new Promise(r=>release=r)}),vectaRecoverPaperworkBodies:()=>{},console},['vectaHydratePaperwork']);
 const task=c.vectaHydratePaperwork();const current=sheet('service:TEST:job','new cloud checks');c.app.serviceRecords=[current];release([{...old,html:'old cached checks'}]);assert.equal(await task,false);assert.equal(c.app.serviceRecords[0].html,'new cloud checks');
});
test('legacy per-sheet localStorage quota does not bypass the main save and durable cache',()=>{
 let saves=0;const c=load({app:{serviceRecords:[]},normReg:r=>r,serviceRecordKind:()=> 'service',serviceRemoteKey:()=> 'service:TEST:job',serviceStorageKey:()=> 'legacy',localStorage:{setItem:()=>{throw Error('quota');}},saveLocal:()=>saves++,console:{warn(){}}},['storeServiceRecordLocal']);c.storeServiceRecordLocal(sheet());assert.equal(saves,1);assert.equal(c.app.serviceRecords.length,1);
});
test('unresolved content prevents a backup replacement and prevents silently generating a blank service sheet',async()=>{
 let writes=0;const c=load({vectaLocalRecoveryReady:true,vectaBackupInFlight:null,vectaBackupRequested:false,vectaBackupForce:false,vectaBackupSource:'',navigator:{onLine:false},vectaHydratePaperwork:async()=>{throw Error('Paperwork unavailable');},vectaStoreBackup:async()=>writes++},['vectaCreateDailyBackup']);await assert.rejects(c.vectaCreateDailyBackup(false,'test'),/Paperwork unavailable/);assert.equal(writes,0);
 const viewer=load({remoteClient:null,navigator:{onLine:false},normReg:r=>r,normalisePaperworkKind:k=>k,serviceRecordKind:()=> 'service',vectaHydratePaperwork:c.vectaHydratePaperwork,latestSavedServiceSheet:()=>{throw Error('Must not fall through to a blank form');}},['openLatestServiceSheet']);await assert.rejects(viewer.openLatestServiceSheet('TEST',{id:'job'},null,'service'),/Paperwork unavailable/);
});
test('backup cloning preserves the complete original format and has a JSON fallback',()=>{
 const c=load({structuredClone:()=>{throw Error('unsupported value');}},['vectaCloneBackupState']);const original={jobs:[{id:'job'}],serviceRecords:[sheet()]},copy=c.vectaCloneBackupState(original);assert.equal(copy.serviceRecords[0].html,original.serviceRecords[0].html);assert.notEqual(copy,original);
});

test('manual export waits for complete paperwork and includes edits made while it loads',async()=>{
 let release;const downloads=[],record={id:'sheet',vecta_paperwork_ref:'a'.repeat(64)};
 const c=load({app:{jobs:[{work_required:'before'}],serviceRecords:[record]},vectaHydratePaperwork:()=>new Promise(r=>release=r),vectaDownloadObject:(data,filename)=>downloads.push({data:JSON.parse(JSON.stringify(data)),filename}),todayIso:()=> '2026-11-03',alert:()=>assert.fail('Unexpected alert'),console},['exportData']);
 const task=c.exportData();assert.equal(downloads.length,0);record.html='<div>Saved checks</div>';c.app.jobs[0].work_required='latest';release();assert.equal(await task,true);assert.equal(downloads.length,1);assert.equal(downloads[0].data.serviceRecords[0].html,record.html);assert.equal(downloads[0].data.jobs[0].work_required,'latest');assert.equal(downloads[0].filename,'vecta-workshop-pro-backup-2026-11-03.json');
});
test('manual export refuses both a failed recovery and unresolved references without downloading',async()=>{
 for(const reject of [true,false]){let downloads=0,alerts=0;const c=load({app:{serviceRecords:[{id:'sheet',vecta_paperwork_ref:'a'.repeat(64)}]},vectaHydratePaperwork:async()=>{if(reject)throw Error('unavailable');},vectaDownloadObject:()=>downloads++,alert:()=>alerts++,console:{warn(){}}},['exportData']);assert.equal(await c.exportData(),false);assert.equal(downloads,0);assert.equal(alerts,1);}
});
