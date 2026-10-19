import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('repair package loads service modules in a clean installation and catches the reported missing helper',async()=>{
 const folder=await mkdtemp(resolve(tmpdir(),'vecta-worker-repair-'));
 try{
  const build=spawnSync(process.execPath,['scripts/package-haynes-repair.mjs',folder],{cwd:root,encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const manifest=JSON.parse(await readFile(resolve(folder,'manifest.json'),'utf8'));
  assert.ok(manifest.some(x=>x.path==='lib/haynes-service.js'));
  assert.ok(manifest.some(x=>x.path==='lib/haynes-vehicle.js'));
  for(const file of manifest)assert.equal(createHash('sha256').update(await readFile(resolve(folder,'payload',file.path))).digest('hex'),file.sha256);
  await writeFile(resolve(folder,'payload/package.json'),'{"type":"module"}');
  const worker=resolve(folder,'payload/workers/haynes');
  await symlink(resolve(root,'workers/haynes/node_modules'),resolve(worker,'node_modules'),'junction');
  const modules=['service-browser.mjs','browser-recovery.mjs','service-task.mjs','relay-poll.mjs','service.mjs'];
  const load=()=>spawnSync(process.execPath,['--input-type=module','--eval',modules.map(n=>`await import('./${n}');`).join('')],{cwd:worker,encoding:'utf8'});
  assert.equal(load().status,0,'Clean packaged worker must load all service dependencies');
  await rm(resolve(folder,'payload/lib/haynes-service.js'));
  const broken=load();assert.notEqual(broken.status,0);assert.match(broken.stderr,/ERR_MODULE_NOT_FOUND/);assert.match(broken.stderr,/haynes-service\.js/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
