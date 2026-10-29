import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {stageRelease,readState,releasePath,activate,atomicJSON,assertWorkersStopped} from './release-store.mjs';
import {withLock} from './release-cli.mjs';
export async function prepareLocal(directory,current){
 for(const name of ['haynes','gsf','tyres']){
  const previous=path.join(current,'workers',name),next=path.join(directory,'workers',name);
  const oldLock=await fs.readFile(path.join(previous,'package-lock.json')),nextLock=await fs.readFile(path.join(next,'package-lock.json'));
  if(!oldLock.equals(nextLock))throw Error('Worker dependencies changed; previous installation kept.');
  const modules=path.join(previous,'node_modules');await fs.access(modules);
  await fs.symlink(modules,path.join(next,'node_modules'),'junction');
 }
 for(const file of ['workers/gsf/diagnostic-bridge.mjs','workers/gsf/diagnostic-case.mjs','workers/gsf/batch-connection.mjs','workers/haynes/service-browser.mjs','workers/tyres/startup.mjs']){
  const check=spawnSync(process.execPath,['--input-type=module','--eval','await import('+JSON.stringify(pathToFileURL(path.join(directory,file)).href)+');'],{encoding:'utf8',timeout:15000});
  if(check.status!==0)throw Error('Updated files could not load; the previous version is kept.');
 }
}
export async function stageBatch(root,artifact,manifest,{prepare=prepareLocal}={}){
 const state=await readState(root),current=releasePath(root,state.active);
 if(state.active!==manifest.baseVersion&&state.active!==manifest.version)throw Error('A different worker release is installed. It has been kept unchanged.');
 const version=await stageRelease(root,await fs.readFile(artifact),{expectedHash:manifest.sha256,prepare:directory=>prepare(directory,current)});
 if(version!==manifest.version)throw Error('Update identity mismatch');
 return {status:'STAGED',version};
}
export async function activateBatch(root,manifest){
 // Stage and verify before asking any working supplier to stop. A bad bundle
 // never overwrites an active release, pairing file, profile or customer data.
 await assertWorkersStopped(root);
 await fs.mkdir(path.join(root,'data/gsf'),{recursive:true});
 const requestFile=path.join(root,'data/gsf/batch-request.local.json');
 let existing;try{existing=JSON.parse((await fs.readFile(requestFile,'utf8')).replace(/^\uFEFF/,''));}catch(error){if(error.code!=='ENOENT')throw Error('Existing test request needs review; it was not overwritten');}
 const request=existing?.launchKey===manifest.launchKey?existing:{endpoint:manifest.endpoint,launchKey:manifest.launchKey,count:100,requiredRegistration:'CM14KEL'};
 // Switching the active version is atomic and retains its previous version for
 // the existing desktop manager's Restore previous option.
 const state=await activate(root,manifest.version);
 try{
  await atomicJSON(requestFile,request);
  // The old stable channel must not immediately undo this one-time update.
  // Restore previous remains available; a genuinely newer channel is allowed.
  await atomicJSON(path.join(root,'state.json'),{...state,blocked:[...new Set([...(state.blocked||[]),state.previous].filter(Boolean))]});
 }catch(error){
  if(state.previous)await atomicJSON(path.join(root,'state.json'),{...state,active:state.previous,previous:state.active});
  throw error;
 }
 return {status:'INSTALLED',version:state.active};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const [action,root,artifact,manifestFile]=process.argv.slice(2);
  if(!path.isAbsolute(root||'')||!['stage','activate'].includes(action))throw Error('Invalid update request');
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  if(manifest.endpoint!=='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/worker-batch-tests'||!/^[a-f0-9]{40}$/.test(manifest.version||'')||!/^[a-f0-9]{64}$/.test(manifest.sha256||'')||!/^[a-f0-9-]{36}$/.test(manifest.launchKey||''))throw Error('Invalid update manifest');
  const result=await withLock(root,()=>action==='stage'?stageBatch(root,artifact,manifest):activateBatch(root,manifest));console.log(JSON.stringify(result));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
