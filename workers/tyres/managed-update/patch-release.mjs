import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const hash=data=>createHash('sha256').update(data).digest('hex');
const read=async file=>(await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'');
const installedTypes=/^(?:package\.json|lib\/[\w-]+\.(?:js|mjs)|workers\/(?:haynes|gsf|repair-quotes|tyres|control)\/[\w-]+\.(?:mjs|js|json|ps1))$/;
function replaceOnce(text,before,after){
 const matches=[...text.matchAll(new RegExp(before.source,'g'))];
 if(matches.length!==1)throw Error('Unrecognised installed tyre launcher or reader. Keep the diagnostic report; nothing has been switched.');
 return text.replace(before,()=>after);
}
export function patchReader(source){
 if(source.includes("from './managed-session.mjs'")&&source.includes('session.inspect(page)'))return source;
 // Retain the installed ESP search, catalogue cleaning, runtime, lease completion
 // and stop logic. Reject unfamiliar layouts rather than downgrading supplier code.
 if(!source.includes('runtime.stopRequested()')||!source.includes("runtime.set('connected','LOOKUP_CONFIRMED')")||!source.includes('testEspSearch(tab,task.size'))throw Error('Unsupported managed tyre reader');
 let s=replaceOnce(source,/import \{prepareTyreStartup\} from '\.\/startup\.mjs';/,"import {managedSession} from './managed-session.mjs';");
 s=replaceOnce(s,/const terminal=createInterface\([^\n]*\);/,"const session=managedSession(SUPPLIER,runtime);");
 s=replaceOnce(s,/import \{createInterface\} from 'node:readline\/promises';\r?\n/,'');
 s=replaceOnce(s,/const page=context\.pages\(\)\[0\]\|\|await context\.newPage\(\);[\s\S]*?await prepareTyreStartup\([\s\S]*?\r?\n \}\);/,"const page=context.pages()[0]||await context.newPage();\n console.log('ESP recovery active. Complete any supplier verification in Edge; the worker resumes automatically.');\n await session.inspect(page);");
 s=replaceOnce(s,/await tab\.goto\(SUPPLIER,\{waitUntil:'domcontentloaded',timeout:10000\}\);if\(\/[^;\n]+?throw Error\('SUPPLIER_LOGIN_REQUIRED'\);/,"await session.ensure(tab);");
 s=replaceOnce(s,/if\(task\.status==='JOB'\)\{/,"if(task.status!=='JOB')await session.inspect(page);\n  if(task.status==='JOB'){");
 return replaceOnce(s,/terminal\.close\(\);/,'');
}
export function patchLauncher(source){
 if(source.includes("workers\\tyres\\read-esp-login.ps1"))return source;
 const match=/^(\s*)\$entry = switch \(\$Worker\)/m.exec(source);
 if(!match||!source.includes('VECTA_WORKER_STATUS_FILE')||!source.includes(" 'Tyres' { 'workers\\tyres\\live-worker.mjs' }"))throw Error('Unsupported Workshop Connections launcher');
 const marker="$entry = switch ($Worker)";
 if(source.split(marker).length!==2)throw Error('Ambiguous Workshop Connections launcher');
 const cleanup=/Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue/;
 const withCleanup=replaceOnce(source,cleanup,`Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue
            if ($Worker -eq 'Tyres') {
                Remove-Item Env:ESP_USERNAME,Env:ESP_PASSWORD -ErrorAction SilentlyContinue
                if ($ownsEspReader) { $espReaderLock.ReleaseMutex() }
                if ($espReaderLock) { $espReaderLock.Dispose() }
            }`);
 return withCleanup.replace(marker,"if ($Worker -eq 'Tyres') { . (Join-Path $release 'workers\\tyres\\read-esp-login.ps1') }\r\n            "+marker);
}
async function installedFiles(source){
 const contents=new Map();
 async function walk(rel){
  for(const item of await fs.readdir(path.join(source,rel),{withFileTypes:true})){
   const name=rel?rel+'/'+item.name:item.name;
   if(item.name==='node_modules'||name==='installed.json')continue;
   if(item.isDirectory()){await walk(name);continue;}
   if(!item.isFile()||!installedTypes.test(name)||name.includes('.local.'))throw Error('Unexpected installed file. Check the active release before updating.');
   contents.set(name,await fs.readFile(path.join(source,name)));
  }
 }
 await walk('');return contents;
}
export async function install(root,assets,{prepare}={}){
 const stateFile=path.join(root,'state.json'),initial=JSON.parse(await read(stateFile));
 if(!/^[a-f0-9]{40}$/.test(initial.active))throw Error('Invalid managed release identity');
 const source=path.join(root,'releases',initial.active);
 const fromActive=name=>pathToFileURL(path.join(source,'workers/control',name)).href;
 const {withLock}=await import(fromActive('release-cli.mjs'));
 const {readState,assertWorkersStopped,stageRelease,activate}=await import(fromActive('release-store.mjs'));
 return withLock(root,async()=>{
  const state=await readState(root);if(state.active!==initial.active)throw Error('The active release changed. Run the check again.');
  await assertWorkersStopped(root);
  const files=await installedFiles(source);
  const reader='workers/tyres/live-worker.mjs',launcher='workers/control/workshop-workers.ps1';
  const changes=new Map([[reader,Buffer.from(patchReader(files.get(reader).toString()))],[launcher,Buffer.from(patchLauncher(files.get(launcher).toString()))]]);
  for(const name of ['managed-session.mjs','session-recovery.mjs','read-esp-login.ps1'])changes.set('workers/tyres/'+name,await fs.readFile(path.join(assets,name)));
  if([...changes].every(([name,value])=>files.get(name)?.equals(value)))return 'already installed';
  for(const [name,value] of changes)files.set(name,value);
  const rows=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,bytes])=>({path:name,size:bytes.length,sha256:hash(bytes),content:bytes.toString('base64')}));
  const version=hash(JSON.stringify(rows)).slice(0,40);
  if(state.blocked?.includes(version))throw Error('This version was rolled back previously.');
  const bundle=gzipSync(JSON.stringify({format:1,version,files:rows}));
  await stageRelease(root,bundle,{prepare:prepare|| (async staging=>{
   for(const folder of ['haynes','gsf','tyres']){
    const relative=path.join('workers',folder,'node_modules');
    await fs.cp(path.join(source,relative),path.join(staging,relative),{recursive:true,dereference:true});
   }
   const helper=pathToFileURL(path.join(staging,'workers/tyres/managed-session.mjs')).href;
   for(const args of [['--check',path.join(staging,reader)],['--input-type=module','--eval','await import('+JSON.stringify(helper)+')']]){
    const check=spawnSync(process.execPath,args,{encoding:'utf8'});if(check.status!==0)throw Error('Staged tyre code did not pass its checks. The previous release is still active.');
   }
   if(process.platform==='win32'){
    const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
    const cmd="$errors=$null;$tokens=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($env:VECTA_VALIDATE_FILE,[ref]$tokens,[ref]$errors);if($errors.Count){exit 1}";
    for(const name of [launcher,'workers/tyres/read-esp-login.ps1']){
     if(spawnSync(ps,['-NoProfile','-Command',cmd],{env:{...process.env,VECTA_VALIDATE_FILE:path.join(staging,name)}}).status!==0)throw Error('Staged PowerShell script validation failed.');
    }
   }
  })});
  await activate(root,version);
  return 'installed '+version.slice(0,12)+'; previous '+state.active.slice(0,12);
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(await install(process.argv[2],path.dirname(fileURLToPath(import.meta.url))));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
