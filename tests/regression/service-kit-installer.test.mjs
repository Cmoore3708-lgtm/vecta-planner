import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {installServiceKit} from '../../scripts/service-kit-update/install.mjs';

async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'kit-installer-')),version='a'.repeat(40),source=path.join(root,'releases',version);
 const files=['package.json','workers/control/workshop-workers.ps1','workers/control/release-cli.mjs','workers/control/release-store.mjs','workers/control/supervisor.mjs','workers/haynes/relay.mjs','workers/tyres/live-worker.mjs','workers/repair-quotes/start-paired.mjs','workers/gsf/worker.mjs','workers/gsf/live-service.mjs','lib/worker-runtime.js'];
 for(const folder of ['haynes','gsf','tyres'])files.push('workers/'+folder+'/package.json','workers/'+folder+'/package-lock.json');
 for(const file of files){await fs.mkdir(path.dirname(path.join(source,file)),{recursive:true});await fs.writeFile(path.join(source,file),file==='workers/control/workshop-workers.ps1'?'VECTA_WORKER_STATUS_FILE function Find-Runner':file==='lib/worker-runtime.js'?'createWorkerRuntime current recovery patch':'preserve current '+file);}
 await fs.writeFile(path.join(source,'installed.json'),JSON.stringify({version,sha256:'b'.repeat(64)}));
 await fs.writeFile(path.join(root,'state.json'),JSON.stringify({format:1,active:version,previous:null,blocked:[]}));
 await fs.mkdir(path.join(root,'data','gsf'),{recursive:true});await fs.writeFile(path.join(root,'data','gsf','settings.local.json'),'retain private settings');
 return {root,version,source,files};
}
test('Service Kit installer preserves current recovery, supplier files and private settings and keeps rollback',async()=>{
 const f=await fixture();try{
  const result=await installServiceKit(f.root,process.cwd(),{prepare:async()=>{}});
  assert.equal(result.status,'updated');const state=JSON.parse(await fs.readFile(path.join(f.root,'state.json')));
  assert.equal(state.previous,f.version);assert.equal(state.active,result.version);
  for(const file of f.files.filter(file=>file!=='workers/gsf/live-service.mjs'))assert.equal(await fs.readFile(path.join(f.root,'releases',state.active,file),'utf8'),await fs.readFile(path.join(f.source,file),'utf8'));
  assert.equal(await fs.readFile(path.join(f.root,'data','gsf','settings.local.json'),'utf8'),'retain private settings');
  assert.match(await fs.readFile(path.join(f.root,'releases',state.active,'workers/gsf/live-service.mjs'),'utf8'),/captureServiceKit/);
  assert.equal((await installServiceKit(f.root,process.cwd(),{prepare:async()=>assert.fail('Already applied')})).status,'current');
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('failed module validation and an active worker leave the current release untouched',async()=>{
 const f=await fixture();try{
  await assert.rejects(installServiceKit(f.root,process.cwd(),{prepare:async()=>{throw Error('validation failed');}}),/validation failed/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'state.json'))).active,f.version);
  await fs.mkdir(path.join(f.root,'runtime'));await fs.writeFile(path.join(f.root,'runtime','GSF.json'),JSON.stringify({pid:process.pid}));
  await assert.rejects(installServiceKit(f.root,process.cwd(),{prepare:async()=>assert.fail('Should not stage')}),/still running/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'state.json'))).active,f.version);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
