import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {readState,stageRelease,activate,assertWorkersStopped} from './release-store.mjs';
import {withLock} from './release-cli.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const patches=['lib/worker-runtime.js','workers/control/workshop-workers.ps1','workers/control/supervisor.mjs'];
const allowed=/^(?:package\.json|lib\/[a-zA-Z0-9_-]+\.(?:js|mjs)|workers\/(?:haynes|gsf|repair-quotes|tyres|control)\/[a-zA-Z0-9_-]+\.(?:mjs|js|json|ps1))$/;
export async function prepareRecoveryUpdate(root,patchRoot,{prepare}={}){
 return withLock(root,async()=>{
  await assertWorkersStopped(root);
  const state=await readState(root), source=path.join(root,'releases',state.active);
  const controller=await fs.readFile(path.join(source,'workers/control/workshop-workers.ps1'),'utf8');
  const runtime=await fs.readFile(path.join(source,'lib/worker-runtime.js'),'utf8');
  if(!controller.includes('VECTA_WORKER_STATUS_FILE')||!controller.includes('function Find-Runner')||!runtime.includes('createWorkerRuntime'))throw Error('This installed worker version needs a compatibility check. Nothing was changed.');
  const contents=new Map();
  async function walk(relative=''){
   for(const item of await fs.readdir(path.join(source,relative),{withFileTypes:true})){
    const file=relative?relative+'/'+item.name:item.name;
    if(item.isSymbolicLink()) {if(allowed.test(file))throw Error('Installed source contains a symbolic link');continue;}
    if(item.isDirectory()){if(item.name!=='node_modules'&&(/^(?:lib|workers)(?:\/|$)/.test(file)))await walk(file);}
    else if(allowed.test(file)&&!file.includes('.local.'))contents.set(file,await fs.readFile(path.join(source,file)));
   }
  }
  await walk();
  // Copy the installed supplier code verbatim. Only the manager, status writer
  // and new supervisor change, so newer tyre/GSF pricing fixes cannot regress.
  for(const file of patches)contents.set(file,await fs.readFile(path.join(patchRoot,file)));
  const files=[...contents].sort(([a],[b])=>a.localeCompare(b)).map(([file,bytes])=>({path:file,size:bytes.length,sha256:hash(bytes),content:bytes.toString('base64')}));
  // A local derived release has a content-based identifier, not a claimed Main commit.
  const version=hash(JSON.stringify({kind:'recovery-overlay-v1',files})).slice(0,40);
  if(version===state.active)return {status:'current',version};
  if(state.blocked?.includes(version))throw Error('This recovery update was previously rolled back. Nothing was changed.');
  const bytes=gzipSync(JSON.stringify({format:1,version,files}));
  const prepareLocal=prepare|| (async directory=>{
   for(const folder of ['haynes','gsf','tyres']){
    for(const name of ['package.json','package-lock.json']){
     const relative='workers/'+folder+'/'+name;
     if(hash(await fs.readFile(path.join(source,relative)))!==hash(await fs.readFile(path.join(directory,relative))))throw Error('Pinned dependencies changed unexpectedly');
    }
    // Installed dependencies may be Windows junctions. Copy their contents;
    // recreating a symbolic link requires privileges on ordinary Windows PCs.
    await fs.cp(path.join(source,'workers',folder,'node_modules'),path.join(directory,'workers',folder,'node_modules'),{recursive:true,dereference:true});
   }
   await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--check',path.join(directory,'workers/control/supervisor.mjs')],{stdio:'ignore',windowsHide:true});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Supervisor validation failed')));
   });
  });
  await stageRelease(root,bytes,{prepare:prepareLocal});
  // Both activation and the maintenance lock protect against a competing start.
  await activate(root,version);
  return {status:'updated',version,previous:state.active};
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,patchRoot]=process.argv.slice(2);
 if(!root||!patchRoot||!path.isAbsolute(root)||!path.isAbsolute(patchRoot))throw Error('Absolute installation and patch paths required');
 try{console.log(JSON.stringify(await prepareRecoveryUpdate(root,patchRoot)));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
