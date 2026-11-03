import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {prepareRecoveryUpdate} from '../../workers/control/recovery-update.mjs';
import {rollback} from '../../workers/control/release-store.mjs';
const patchRoot=fileURLToPath(new URL('../../',import.meta.url));
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vecta-overlay-'));
 const version='a'.repeat(40),release=path.join(root,'releases',version);
 const files={'package.json':'{"type":"module"}','workers/control/workshop-workers.ps1':'# VECTA_WORKER_STATUS_FILE\nfunction Find-Runner {}','workers/control/release-cli.mjs':'// existing updater','workers/control/release-store.mjs':'// existing release code','lib/worker-runtime.js':'export function createWorkerRuntime(){}','workers/haynes/relay.mjs':'// latest installed Haynes fix','workers/tyres/live-worker.mjs':'// latest remote warehouse stock fix','workers/repair-quotes/start-paired.mjs':'// current GSF pairing loader','workers/gsf/worker.mjs':'// latest bulk oil pricing rule','installed.json':JSON.stringify({version,sha256:'1'.repeat(64)})};
 for(const folder of ['haynes','gsf','tyres']){
  files['workers/'+folder+'/package.json']='{}';files['workers/'+folder+'/package-lock.json']='{}';files['workers/'+folder+'/node_modules/fixture.txt']='pinned installed dependency';
 }
 for(const [file,bytes] of Object.entries(files)){const p=path.join(release,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);}
 await fs.mkdir(path.join(root,'data'),{recursive:true});await fs.writeFile(path.join(root,'data/private.json'),'private fixture');
 await fs.writeFile(path.join(root,'state.json'),JSON.stringify({format:1,active:version,blocked:[]}));
 try{await fn(root,release,files);}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('small update retains supplier code and private data, reuses pinned dependencies, and supports rollback',()=>fixture(async(root,release,files)=>{
 const result=await prepareRecoveryUpdate(root,patchRoot);
 assert.equal(result.status,'updated');
 const next=path.join(root,'releases',result.version);
 for(const file of ['workers/gsf/worker.mjs','workers/tyres/live-worker.mjs','workers/haynes/relay.mjs'])assert.equal(await fs.readFile(path.join(next,file),'utf8'),files[file]);
 assert.equal(await fs.readFile(path.join(root,'data/private.json'),'utf8'),'private fixture');
 assert.equal(await fs.readFile(path.join(next,'workers/gsf/node_modules/fixture.txt'),'utf8'),'pinned installed dependency');
 assert.equal((await prepareRecoveryUpdate(root,patchRoot)).status,'current');
 await rollback(root);assert.equal(JSON.parse(await fs.readFile(path.join(root,'state.json'))).active,'a'.repeat(40));
 await assert.rejects(prepareRecoveryUpdate(root,patchRoot),/previously rolled back/);
}));
test('failed staging keeps installed version and settings',()=>fixture(async(root)=>{
 await assert.rejects(prepareRecoveryUpdate(root,patchRoot,{prepare:async()=>{throw Error('synthetic preparation failure')}}),/synthetic preparation failure/);
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'state.json'))).active,'a'.repeat(40));
 assert.equal(await fs.readFile(path.join(root,'data/private.json'),'utf8'),'private fixture');
}));
test('live worker prevents update before any activation',()=>fixture(async(root)=>{
 await fs.mkdir(path.join(root,'runtime'));await fs.writeFile(path.join(root,'runtime/Haynes.json'),JSON.stringify({pid:process.pid}));
 await assert.rejects(prepareRecoveryUpdate(root,patchRoot),/still running/);
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'state.json'))).active,'a'.repeat(40));
}));
