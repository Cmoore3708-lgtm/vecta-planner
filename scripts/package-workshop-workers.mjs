import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {validateBundle} from '../workers/control/release-store.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildWorkerBundle(root,version){
  if(!/^[a-f0-9]{40}$/.test(version))throw Error('Use the exact approved 40-character Git commit');
  const seeds=['workers/haynes/relay.mjs','workers/tyres/live-worker.mjs','workers/repair-quotes/start-paired.mjs','workers/gsf/worker.mjs',
    'workers/control/workshop-workers.ps1','workers/control/release-cli.mjs','workers/control/release-store.mjs','workers/control/permanent-start.ps1'];
  for(const folder of ['haynes','gsf','tyres'])for(const name of ['package.json','package-lock.json'])seeds.push('workers/'+folder+'/'+name);
  const files=new Map([['package.json',Buffer.from('{"private":true,"type":"module"}\n')]]);
  async function include(relative){
    if(files.has(relative))return;
    if(! /^(?:workers\/(?:haynes|gsf|repair-quotes|tyres|control)|lib)\/[\w-]+\.(?:js|mjs|ps1|json)$/.test(relative))throw Error('Unexpected runtime dependency: '+relative);
    const full=path.join(root,relative);if((await fs.lstat(full)).isSymbolicLink())throw Error('Release symlinks are not allowed');
    const bytes=await fs.readFile(full);files.set(relative,bytes);
    if(/\.(?:mjs|js)$/.test(relative))for(const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[1]));await include(dependency);
    }
  }
  for(const file of seeds)await include(file);
  const bundle={format:1,version,files:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,data])=>({path:name,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),content:data.toString('base64')}))};
  const bytes=gzipSync(Buffer.from(JSON.stringify(bundle)),{level:9});validateBundle(bytes);
  return bytes;
}
export async function buildInstaller(root,out,version){
  if((await fs.readdir(out).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e))).length)throw Error('Use an empty output folder');
  await fs.mkdir(path.join(out,'workers/control'),{recursive:true});
  const bytes=await buildWorkerBundle(root,version);
  await fs.writeFile(path.join(out,'initial-release.vecta.gz'),bytes);
  for(const name of ['workshop-workers.ps1','permanent-start.ps1','release-cli.mjs','release-store.mjs','Install-Desktop-Shortcut.cmd'])await fs.copyFile(path.join(root,'workers/control',name),path.join(out,'workers/control',name));
  await fs.writeFile(path.join(out,'package.json'),'{"private":true,"type":"module"}\n');
  await fs.writeFile(path.join(out,'START-HERE.cmd'),'@echo off\r\ncall "%~dp0workers\\control\\Install-Desktop-Shortcut.cmd"\r\n');
  await fs.copyFile(path.join(root,'workers/control/README.md'),path.join(out,'READ-ME.md'));
  const channel={format:1,version,sha256:createHash('sha256').update(bytes).digest('hex'),url:`https://github.com/Cmoore3708-lgtm/vecta-planner/releases/download/workers-${version}/workers.vecta.gz`};
  await fs.writeFile(path.join(out,'channel.json'),JSON.stringify(channel,null,2)+'\n');
  return {version,files:validateBundle(bytes).files.length,bytes:bytes.length,sha256:channel.sha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [out,version]=process.argv.slice(2);if(!out||!path.isAbsolute(out))throw Error('Provide an absolute empty output folder and exact commit');
  console.log(JSON.stringify(await buildInstaller(repository,out,version)));
}
