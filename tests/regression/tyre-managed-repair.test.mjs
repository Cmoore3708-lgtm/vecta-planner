import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reserveLoginAttempt} from '../../workers/tyres/managed-session.mjs';
import {patchReader,patchLauncher} from '../../workers/tyres/managed-update/patch-release.mjs';

test('managed login attempt survives a reader restart and unreadable state fails closed',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'esp-cooldown-'));
 try{
  const file=path.join(folder,'time');
  assert.equal(reserveLoginAttempt(file,5000,1000),true);
  assert.equal(reserveLoginAttempt(file,5001,1000),false);
  assert.equal(reserveLoginAttempt(file,4000,1000),false);
  assert.equal(reserveLoginAttempt(file,6000,1000),true);
  fs.writeFileSync(file,'unreadable');assert.equal(reserveLoginAttempt(file,8000,1000),false);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('only the tyre launcher reads the encrypted login and unknown managed release layouts reject changes',()=>{
 const launcher=["$env:VECTA_WORKER_STATUS_FILE = 'fixture'","$entry = switch ($Worker) { 'Tyres' { 'workers\\tyres\\live-worker.mjs' } }","Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue"].join('\n');
 const patched=patchLauncher(launcher);assert.match(patched,/if \(\$Worker -eq 'Tyres'\) \{ \. \(Join-Path \$release 'workers\\tyres\\read-esp-login.ps1'/);
 assert.equal(patchLauncher(patched),patched);assert.throws(()=>patchLauncher('# changed'),/Unsupported/);
 assert.throws(()=>patchReader("throw Error('different reader');"),/Unsupported/);
});
