import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {buildWorkerBundle} from '../../scripts/package-workshop-workers.mjs';
import {validateBundle,stageRelease,activate,rollback,readState,update,assertWorkersStopped,validateChannel,download} from '../../workers/control/release-store.mjs';
import {importSettings,withLock} from '../../workers/control/release-cli.mjs';
import {createWorkerRuntime} from '../../lib/worker-runtime.js';
import {prepareTyreStartup} from '../../workers/tyres/startup.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../../',import.meta.url));
const first='a'.repeat(40),second='b'.repeat(40);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const noDependencies=async()=>{};
const bundles=new Map();
async function bundle(version=first){if(!bundles.has(version))bundles.set(version,await buildWorkerBundle(source,version));return bundles.get(version)}
async function temporary(fn){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vecta-managed-'));try{await fn(directory)}finally{await fs.rm(directory,{recursive:true,force:true})}}
async function initial(root){await stageRelease(root,await bundle(),{prepare:noDependencies});await activate(root,first)}
async function absent(file){await assert.rejects(fs.access(file),{code:'ENOENT'})}
const rewrite=(bytes,mutate)=>{const value=JSON.parse(gunzipSync(bytes));mutate(value);return gzipSync(JSON.stringify(value))};
test('complete release follows runtime import dependencies and contains no private configuration',async()=>{
 const bytes=await bundle(),value=validateBundle(bytes,hash(bytes));
 assert.ok(value.files.some(f=>f.path==='lib/worker-runtime.js'));
 assert.ok(value.files.some(f=>f.path==='workers/tyres/startup.mjs'));
 assert.ok(value.files.some(f=>f.path==='lib/haynes-service.js'));
 for(const f of value.files)assert.doesNotMatch(f.path,/\.local\.|node_modules|\/profile\//i);
 assert.deepEqual(await buildWorkerBundle(source,first),bytes,'same code/version creates identical release');
});
test('damaged, substituted, incomplete and unsafe downloads never reach installation',async()=>{
 const bytes=await bundle();assert.throws(()=>validateBundle(bytes,'0'.repeat(64)),/checksum/);
 for(const bad of ['../outside.js','C:/outside.js','workers/gsf/repair-connection.local.json','workers/gsf/CON.json']){
  const altered=rewrite(bytes,b=>b.files[0].path=bad);
  assert.throws(()=>validateBundle(altered),/Unsafe/);
 }
 assert.throws(()=>validateBundle(rewrite(bytes,b=>b.files.push({...b.files[0],path:b.files[0].path.toUpperCase()}))),/Unsafe/);
 assert.throws(()=>validateBundle(rewrite(bytes,b=>b.files[0].content='AAAA')),/checksum/);
 assert.throws(()=>validateBundle(rewrite(bytes,b=>b.files=b.files.filter(f=>f.path!=='workers/tyres/live-worker.mjs'))),/Incomplete/);
});
test('failed dependency preparation leaves active version and private settings unchanged',()=>temporary(async root=>{
 await initial(root);const data=path.join(root,'data/private.json');await fs.mkdir(path.dirname(data),{recursive:true});await fs.writeFile(data,'private fixture');
 await assert.rejects(stageRelease(root,await bundle(second),{prepare:async()=>{throw Error('npm unavailable')}}),/npm unavailable/);
 assert.equal((await readState(root)).active,first);assert.equal(await fs.readFile(data,'utf8'),'private fixture');
 await absent(path.join(root,'releases',second));assert.deepEqual(await fs.readdir(path.join(root,'staging')),[]);
}));
test('updates are prepared separately and activation refuses a worker still in flight',()=>temporary(async root=>{
 await initial(root);await stageRelease(root,await bundle(second),{prepare:noDependencies});
 const runtime=path.join(root,'runtime');await fs.mkdir(runtime);await fs.writeFile(path.join(runtime,'Haynes.json'),JSON.stringify({pid:process.pid}));
 await assert.rejects(activate(root,second),/still running/);assert.equal((await readState(root)).active,first);
 await fs.rm(runtime,{recursive:true});await activate(root,second);assert.equal((await readState(root)).previous,first);
}));
test('rollback keeps settings and blocks automatic reinstallation of the rejected version',()=>temporary(async root=>{
 await initial(root);await stageRelease(root,await bundle(second),{prepare:noDependencies});await activate(root,second);
 await rollback(root);const state=await readState(root);assert.equal(state.active,first);assert.deepEqual(state.blocked,[second]);
 const channel={format:1,version:second,sha256:hash(await bundle(second)),url:`https://github.com/Cmoore3708-lgtm/vecta-planner/releases/download/workers-${second}/workers.vecta.gz`};
 let requests=0;const result=await update(root,{fetcher:async()=>{requests++;return new Response(JSON.stringify(channel))},prepare:noDependencies});
 assert.equal(result.status,'blocked');assert.equal(requests,1);assert.equal((await readState(root)).active,first);
}));
test('approved channel downloads and stages exactly its immutable bundle',()=>temporary(async root=>{
 await initial(root);const bytes=await bundle(second);
 const channel={format:1,version:second,sha256:hash(bytes),url:`https://github.com/Cmoore3708-lgtm/vecta-planner/releases/download/workers-${second}/workers.vecta.gz`};
 const calls=[];const result=await update(root,{fetcher:async url=>{calls.push(url);return new Response(calls.length===1?JSON.stringify(channel):bytes)},prepare:noDependencies});
 assert.equal(result.status,'updated');assert.equal((await readState(root)).active,second);assert.equal(calls[1],channel.url);
 assert.throws(()=>validateChannel({...channel,url:'https://example.com/malicious.gz'}),/Invalid/);
}));
test('offline or corrupted update does not disturb the existing installation',()=>temporary(async root=>{
 await initial(root);await assert.rejects(update(root,{fetcher:async()=>{throw Error('offline')}}),/offline/);
 assert.equal((await readState(root)).active,first);
 await assert.rejects(download('unused',{fetcher:async()=>new Response('oversize'),limit:3}),/too large/);
}));
test('same release identifier cannot be replaced by different source',()=>temporary(async root=>{
 await initial(root);const altered=rewrite(await bundle(),b=>{b.files.push({path:'lib/new.js',size:0,sha256:hash(''),content:''})});
 await assert.rejects(stageRelease(root,altered,{prepare:noDependencies}),/different build/);
}));
test('settings migrate once and newer installed settings win over old Downloads copies',()=>temporary(async root=>{
 const old=path.join(root,'old/workers/repair-quotes');await fs.mkdir(old,{recursive:true});
 const connection={origin:'https://vecta-planner.vercel.app',token:'1'.repeat(64)};
 await fs.writeFile(path.join(old,'repair-connection.local.json'),'\uFEFF'+JSON.stringify(connection));await fs.writeFile(path.join(old,'repair-config.local.json'),'\uFEFF{"calibrationApproved":true}');
 const service=path.resolve(old,'../gsf');await fs.mkdir(service);await fs.writeFile(path.join(service,'live-service-config.local.json'),'{"calibrationApproved":true}');
 await importSettings(root,{GSF:old});const file=path.join(root,'data/repair-quotes/repair-config.local.json');
 await fs.writeFile(file,'{"newer":true}');await importSettings(root,{GSF:old});assert.deepEqual(JSON.parse(await fs.readFile(file)),{newer:true});
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'data/gsf/live-service-config.local.json'))),{calibrationApproved:true});
 assert.equal(JSON.parse((await fs.readFile(path.join(old,'repair-config.local.json'),'utf8')).replace(/^\uFEFF/,'')).calibrationApproved,true);
 await fs.writeFile(path.join(old,'repair-connection.local.json'),JSON.stringify({...connection,origin:'https://preview.vercel.app'}));await assert.rejects(importSettings(root,{GSF:old}),/preview/);
}));
test('managed GSF entrypoint reads persistent configuration after the old folder is removed',()=>temporary(async root=>{
 const release=path.join(root,'release/workers/repair-quotes'),gsf=path.resolve(release,'../gsf'),data=path.join(root,'data');
 await fs.mkdir(release,{recursive:true});await fs.mkdir(gsf);await fs.mkdir(path.join(data,'repair-quotes'),{recursive:true});await fs.mkdir(path.join(data,'gsf'));
 await fs.copyFile(new URL('../../workers/repair-quotes/start-paired.mjs',import.meta.url),path.join(release,'start-paired.mjs'));
 await fs.writeFile(path.join(data,'repair-quotes/repair-connection.local.json'),JSON.stringify({origin:'https://vecta-planner.vercel.app',token:'1'.repeat(64)}));
 await fs.writeFile(path.join(data,'repair-quotes/repair-config.local.json'),'{}');await fs.writeFile(path.join(data,'gsf/live-service-config.local.json'),'{}');
 await fs.writeFile(path.join(gsf,'worker.mjs'),`import fs from 'node:fs';for(const key of ['REPAIR_QUOTE_CONFIG_FILE','GSF_CONFIG_FILE'])if(!fs.existsSync(process.env[key]))throw Error(key);console.log('persistent settings loaded');`);
 const child=spawnSync(process.execPath,[path.join(release,'start-paired.mjs')],{env:{...process.env,VECTA_WORKER_DATA_DIR:data},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/persistent settings loaded/);
}));
test('maintenance lock rejects overlapping updates and recovers after a dead owner',()=>temporary(async root=>{
 await withLock(root,async()=>{await assert.rejects(withLock(root,async()=>{}),/already running/)});
 await fs.writeFile(path.join(root,'maintenance.lock'),JSON.stringify({pid:2147483647}));let called=false;await withLock(root,async()=>{called=true});assert.equal(called,true);
}));
test('rerunning an old installer preserves the current installed release without reading old Downloads',()=>temporary(async root=>{
 await initial(root);
 const cli=fileURLToPath(new URL('../../workers/control/release-cli.mjs',import.meta.url));
 const child=spawnSync(process.execPath,[cli,'install',root,path.join(root,'old-download-missing.gz'),path.join(root,'old-sources-missing.json')],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).status,'already-installed');assert.equal((await readState(root)).active,first);
}));
test('runtime status persists actionable login state across relay polling and cooperatively stops',()=>temporary(async root=>{
 const file=path.join(root,'status.json'),stop=path.join(root,'stop');const runtime=createWorkerRuntime('Tyres',{env:{VECTA_WORKER_STATUS_FILE:file,VECTA_WORKER_STOP_FILE:stop},timers:false});
 runtime.set('attention','LOGIN_REQUIRED');runtime.set('reconnecting','RELAY_UNAVAILABLE');runtime.set('connected','RELAY_ONLY');
 assert.equal(JSON.parse(await fs.readFile(file)).state,'attention');runtime.set('connected','LOOKUP_CONFIRMED');assert.equal(JSON.parse(await fs.readFile(file)).state,'connected');
 assert.equal(runtime.stopRequested(),false);await fs.writeFile(stop,'stop');assert.equal(runtime.stopRequested(),true);runtime.close();assert.equal(JSON.parse(await fs.readFile(file)).state,'stopped');
 assert.throws(()=>runtime.set('attention','customer@email.example'),/Invalid/);
}));
test('managed tyre startup needs no Enter when session/settings verify; failures require confirmation and recheck',async()=>{
 let confirms=0,checks=0;await prepareTyreStartup({managed:true,verify:async()=>{checks++},confirm:async()=>{confirms++}});assert.equal(confirms,0);assert.equal(checks,1);
 checks=0;await prepareTyreStartup({managed:true,verify:async()=>{if(++checks===1)throw Error('LOGIN_REQUIRED')},confirm:async()=>{confirms++}});assert.equal(confirms,1);assert.equal(checks,2);
 await assert.rejects(prepareTyreStartup({managed:true,verify:async()=>{throw Error('SETTINGS_REQUIRED')},confirm:async()=>{confirms++}}),/SETTINGS_REQUIRED/);
});
