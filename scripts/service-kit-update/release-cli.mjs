import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomicJSON,readState,stageRelease,activate,rollback,update} from './release-store.mjs';
const parseJSON=text=>JSON.parse(text.replace(/^\uFEFF/,''));

export async function importSettings(root,sources){
  const repair=sources.GSF;
  if(typeof repair!=='string'||!path.isAbsolute(repair))throw Error('Select the existing shared GSF installation');
  const connection=parseJSON(await fs.readFile(path.join(repair,'repair-connection.local.json'),'utf8'));
  if(connection.origin!=='https://vecta-planner.vercel.app'||!/^[a-f0-9]{64}$/.test(connection.token||''))throw Error('Existing live GSF pairing is required; preview setup cannot be activated silently');
  const files=[['repair-quotes/repair-connection.local.json',path.join(repair,'repair-connection.local.json')],['repair-quotes/repair-config.local.json',path.join(repair,'repair-config.local.json')]];
  const service=path.resolve(repair,'../gsf/live-service-config.local.json');
  try{await fs.access(service);files.push(['gsf/live-service-config.local.json',service])}catch{}
  // Read and validate everything before writing; existing installed settings
  // win on re-install and must not be overwritten with an older Downloads copy.
  const pending=[];
  for(const [relative,source] of files){
    const bytes=Buffer.from((await fs.readFile(source,'utf8')).replace(/^\uFEFF/,''));parseJSON(bytes.toString('utf8'));
    const target=path.join(root,'data',relative);
    try{await fs.access(target)}catch{pending.push({target,bytes})}
  }
  for(const {target,bytes} of pending){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx',mode:0o600})}
}

export async function withLock(root,operation){
  await fs.mkdir(root,{recursive:true});
  const lock=path.join(root,'maintenance.lock');let handle;
  try{handle=await fs.open(lock,'wx',0o600)}catch(error){
    if(error.code!=='EEXIST')throw error;
    const owner=JSON.parse(await fs.readFile(lock,'utf8'));
    if(!Number.isInteger(owner.pid)||owner.pid<1)throw Error('Invalid maintenance lock');
    let alive=true;try{process.kill(owner.pid,0)}catch(e){if(e.code==='ESRCH')alive=false}
    if(alive)throw Error('Another worker update or installation is already running');
    await fs.unlink(lock);handle=await fs.open(lock,'wx',0o600);
  }
  try{await handle.writeFile(JSON.stringify({pid:process.pid}));await handle.sync();return await operation()}
  finally{await handle.close();await fs.unlink(lock)}
}

async function main(){
  const [action,root,...args]=process.argv.slice(2);
  if(!root||!path.isAbsolute(root)||!['install','update','rollback','state'].includes(action))throw Error('Invalid worker maintenance command');
  if(action==='state')return readState(root);
  return withLock(root,async()=>{
    if(action==='update')return update(root);
    if(action==='rollback')return {status:'rolled-back',...await rollback(root)};
    let installed=false;try{await fs.access(path.join(root,'state.json'));installed=true}catch{}
    if(installed){
      const state=await readState(root);
      const marker=parseJSON(await fs.readFile(path.join(root,'releases',state.active,'installed.json'),'utf8'));
      if(marker.version!==state.active)throw Error('Existing installation needs recovery; it has not been overwritten');
      return {status:'already-installed',...state};
    }
    const [artifact,sourcesFile]=args;
    if(!artifact||!sourcesFile)throw Error('The complete one-time installer is required');
    const sources=parseJSON(await fs.readFile(sourcesFile,'utf8'));
    // Do not change old installations, Windows-encrypted tokens or profiles.
    const version=await stageRelease(root,await fs.readFile(artifact));
    await importSettings(root,sources);
    const state=await activate(root,version);
    await atomicJSON(path.join(root,'migration.json'),{completedAt:new Date().toISOString(),sourceFolders:sources});
    return {status:'installed',...state};
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await main()))}catch(error){console.error(JSON.stringify({status:'failed',message:error.message}));process.exitCode=1}
}
