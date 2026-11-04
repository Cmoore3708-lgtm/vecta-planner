import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const CHANNEL='https://github.com/Cmoore3708-lgtm/vecta-planner/releases/download/workers-stable/channel.json';
const MAX=32*1024*1024;
const sha=data=>createHash('sha256').update(data).digest('hex');
const versionOK=value=>/^[a-f0-9]{40}$/.test(value||'');
const required=['package.json','workers/control/workshop-workers.ps1','workers/control/release-cli.mjs','workers/control/release-store.mjs','workers/haynes/relay.mjs','workers/tyres/live-worker.mjs','workers/repair-quotes/start-paired.mjs','workers/gsf/worker.mjs'];
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
async function exists(file){try{await fs.access(file);return true}catch{return false}}
export async function atomicJSON(file,value){
  const temporary=file+'.'+randomUUID()+'.tmp';
  await fs.mkdir(path.dirname(file),{recursive:true});
  const handle=await fs.open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync()}finally{await handle.close()}
  try{await fs.rename(temporary,file)}catch(error){await fs.rm(temporary,{force:true});throw error}
}
export function validateBundle(bytes,expectedHash){
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX)throw Error('Worker download is too large');
  if(expectedHash&&(!/^[a-f0-9]{64}$/.test(expectedHash)||sha(bytes)!==expectedHash))throw Error('Worker download checksum failed');
  const bundle=JSON.parse(gunzipSync(bytes,{maxOutputLength:MAX*2}).toString('utf8'));
  if(bundle.format!==1||!versionOK(bundle.version)||!Array.isArray(bundle.files)||bundle.files.length>1000)throw Error('Invalid worker release');
  const names=new Set();let total=0;
  for(const file of bundle.files){
    // No arbitrary filesystem writes, private files, dependencies or symlinks.
    if(typeof file.path!=='string'||! /^(?:package\.json|lib\/[a-zA-Z0-9_-]+\.(?:js|mjs)|workers\/(?:haynes|gsf|repair-quotes|tyres|control)\/[a-zA-Z0-9_-]+\.(?:mjs|js|json|ps1))$/.test(file.path)||/\.local\.|node_modules|(?:^|\/)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(file.path)||names.has(file.path.toLowerCase()))throw Error('Unsafe or duplicate release path');
    if(typeof file.content!=='string'||file.content.length>8*1024*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content))throw Error('Invalid release content');
    const data=Buffer.from(file.content,'base64');total+=data.length;
    if(total>MAX||file.size!==data.length||file.sha256!==sha(data))throw Error('Worker file checksum failed');
    names.add(file.path.toLowerCase());
  }
  for(const name of required)if(!names.has(name.toLowerCase()))throw Error('Incomplete worker release: '+name);
  for(const folder of ['haynes','gsf','tyres'])for(const name of ['package.json','package-lock.json'])if(!names.has('workers/'+folder+'/'+name))throw Error('Missing pinned worker dependencies');
  return bundle;
}
export async function readState(root){
  const state=await json(path.join(root,'state.json'));
  if(state.format!==1||!versionOK(state.active)||(state.previous&&!versionOK(state.previous)))throw Error('Invalid installed release state');
  return state;
}
export function releasePath(root,version){if(!versionOK(version))throw Error('Invalid release version');return path.join(root,'releases',version)}

export async function prepareDependencies(directory){
  const nodeDirectory=path.dirname(await fs.realpath(process.execPath));
  const candidates=[process.env.npm_execpath,path.join(nodeDirectory,'node_modules/npm/bin/npm-cli.js'),path.resolve(nodeDirectory,'../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  let npmCLI;for(const candidate of candidates)if(await exists(candidate)){npmCLI=candidate;break}
  if(!npmCLI)throw Error('The existing Node.js installation is missing npm. The previous version has been kept.');
  async function run(executable,args,cwd){
    await new Promise((resolve,reject)=>{
      const child=spawn(executable,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'}});
      let output='';child.stdout.on('data',b=>output=(output+b.toString()).slice(-8000));child.stderr.on('data',b=>output=(output+b.toString()).slice(-8000));
      const timer=setTimeout(()=>child.kill(),180000);
      child.on('error',error=>{clearTimeout(timer);reject(error)});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Staged dependency/module check failed; previous version kept. '+output.slice(-600)))})
    });
  }
  for(const folder of ['haynes','gsf','tyres']){
    const cwd=path.join(directory,'workers',folder);
    // Invoke npm's JavaScript CLI directly. Windows cannot spawn npm.cmd without
    // cmd.exe; avoiding the shell also avoids quoting paths through cmd.exe.
    await run(process.execPath,[npmCLI,'ci','--ignore-scripts','--no-audit','--no-fund'],cwd);
  }
  for(const file of ['workers/haynes/service-browser.mjs','workers/gsf/supplier.mjs','workers/repair-quotes/shared-bridge.mjs','workers/tyres/startup.mjs','workers/tyres/esp-search.mjs']){
    await run(process.execPath,['--input-type=module','--eval',`await import(${JSON.stringify(pathToFileURL(path.resolve(directory,file)).href)});`],directory);
  }
}

export async function stageRelease(root,bytes,{expectedHash,prepare=prepareDependencies}={}){
  const bundle=validateBundle(bytes,expectedHash),digest=sha(bytes);
  const final=releasePath(root,bundle.version),staging=path.join(root,'staging',randomUUID());
  if(await exists(final)){
    const marker=await json(path.join(final,'installed.json'));
    if(marker.sha256!==digest)throw Error('A different build already uses this version');
    return bundle.version;
  }
  await fs.mkdir(staging,{recursive:true});
  try{
    for(const file of bundle.files){const dest=path.join(staging,file.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,Buffer.from(file.content,'base64'),{flag:'wx'})}
    await prepare(staging);
    await atomicJSON(path.join(staging,'installed.json'),{version:bundle.version,sha256:digest,installedAt:new Date().toISOString()});
    await fs.mkdir(path.dirname(final),{recursive:true});await fs.rename(staging,final);
    return bundle.version;
  }finally{await fs.rm(staging,{recursive:true,force:true})}
}

// Stopping is cooperative: an in-flight lookup finishes before releasing its
// browser. New installs never forcibly stop older, independently started workers.
export async function assertWorkersStopped(root,{isProcessAlive=pid=>{try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}}}={}){
  for(const name of ['Haynes','Tyres','GSF']){
    const file=path.join(root,'runtime',name+'.json');
    if(!await exists(file))continue;
    let status;try{status=await json(file)}catch{throw Error('Worker status unreadable; restart the PC before updating')}
    if(!Number.isInteger(status.pid)||status.pid<1)throw Error('Invalid worker process status');
    if(isProcessAlive(status.pid))throw Error('Workers are still running; update deferred');
  }
}
export async function activate(root,version,{assertStopped=()=>assertWorkersStopped(root)}={}){
  await assertStopped();
  const marker=await json(path.join(releasePath(root,version),'installed.json'));
  if(marker.version!==version||! /^[a-f0-9]{64}$/.test(marker.sha256))throw Error('Release is not prepared');
  const previous=await exists(path.join(root,'state.json'))?await readState(root):null;
  if(previous?.active===version)return previous;
  const state={format:1,active:version,previous:previous?.active||null,blocked:previous?.blocked||[],changedAt:new Date().toISOString()};
  await atomicJSON(path.join(root,'state.json'),state);return state;
}
export async function rollback(root,{assertStopped=()=>assertWorkersStopped(root)}={}){
  await assertStopped();const state=await readState(root);
  if(!state.previous)throw Error('There is no previous installed version');
  const marker=await json(path.join(releasePath(root,state.previous),'installed.json'));
  if(marker.version!==state.previous)throw Error('Previous release is unavailable');
  const next={...state,active:state.previous,previous:state.active,blocked:[...new Set([...(state.blocked||[]),state.active])],changedAt:new Date().toISOString()};
  await atomicJSON(path.join(root,'state.json'),next);return next;
}

export function validateChannel(channel){
  if(channel.format!==1||!versionOK(channel.version)||! /^[a-f0-9]{64}$/.test(channel.sha256||'')||channel.url!==`https://github.com/Cmoore3708-lgtm/vecta-planner/releases/download/workers-${channel.version}/workers.vecta.gz`)throw Error('Invalid approved worker channel');
  return channel;
}
export async function download(url,{fetcher=fetch,limit=MAX,timeout=20000}={}){
  const response=await fetcher(url,{signal:AbortSignal.timeout(timeout),redirect:'follow'});
  if(!response.ok)throw Error('Approved worker release unavailable (HTTP '+response.status+')');
  if(Number(response.headers.get('content-length'))>limit)throw Error('Worker download too large');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit){await response.body.cancel?.().catch(()=>{});throw Error('Worker download too large')}chunks.push(chunk)}
  return Buffer.concat(chunks);
}
export async function update(root,{fetcher=fetch,prepare=prepareDependencies,assertStopped=()=>assertWorkersStopped(root)}={}){
  await assertStopped();const state=await readState(root);
  const channel=validateChannel(JSON.parse((await download(CHANNEL,{fetcher,limit:16384,timeout:8000})).toString('utf8')));
  if(channel.version===state.active)return {status:'current',version:state.active};
  if((state.blocked||[]).includes(channel.version))return {status:'blocked',version:state.active};
  const bytes=await download(channel.url,{fetcher});
  const bundle=validateBundle(bytes,channel.sha256);
  if(bundle.version!==channel.version)throw Error('Channel and worker release do not match');
  await stageRelease(root,bytes,{expectedHash:channel.sha256,prepare});
  await activate(root,channel.version,{assertStopped});return {status:'updated',version:channel.version};
}
