import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recoveryStatusWriter } from '../../workers/control/recovery-status.mjs';
import { openTyreSupplier } from '../../workers/tyres/open-supplier.mjs';
import { patchSupervisor, patchTyreStartup } from '../../scripts/haynes-sign-in-update/managed-repair.mjs';

test('a Windows sharing violation preserves the complete status, clears the temp and recovers on the next tick', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vecta-status-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'Tyres.json');
  const messages = [];
  const publish = recoveryStatusWriter(file,message=>messages.push(message));
  publish({state:'connected'});
  const locked = t.mock.method(fs,'renameSync',()=>{throw Object.assign(Error('fixture lock'),{code:'EPERM'});});
  for (let i=0;i<3;i++) publish({state:'reconnecting'});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{state:'connected'});
  assert.deepEqual(fs.readdirSync(dir),['Tyres.json']);
  assert.equal(messages.length,1);assert.match(messages[0],/EPERM/);
  locked.mock.restore();
  publish({state:'reconnecting'});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{state:'reconnecting'});
});

test('tyre startup waits for the document and retries only a genuine navigation timeout', async () => {
  const url='https://supplier.test/';
  const timeout=Object.assign(Error('fixture'),{name:'TimeoutError'});
  for(const [failure,closed,calls,reject] of [[null,false,1,false],[timeout,false,2,false],[timeout,true,1,true],[Error('closed'),false,1,true]]){
    const attempts=[];
    const page={isClosed:()=>closed,goto:async(...args)=>{attempts.push(args);if(failure&&attempts.length===1)throw failure;}};
    const opened=openTyreSupplier(page,url);
    if(reject)await assert.rejects(opened);else await opened;
    assert.deepEqual(attempts,Array(calls).fill([url,{waitUntil:'domcontentloaded',timeout:20000}]));
  }
  let attempts=0;
  await assert.rejects(openTyreSupplier({isClosed:()=>false,goto:async()=>{attempts++;throw timeout;}},url),{name:'TimeoutError'});
  assert.equal(attempts,2);
});

test('installer edits only the known startup line and refuses unrecognised worker source',()=>{
  const original="// Original supplier configuration\nawait page.goto(SUPPLIER,{timeout:20000});\nverifySettings();";
  const patched=patchTyreStartup(original);
  assert.ok(patched.includes('await openTyreSupplier(page, SUPPLIER);\nverifySettings();'));
  assert.equal(patchTyreStartup(patched),patched);
  assert.throws(()=>patchTyreStartup(original+original),/Unrecognised/);
  assert.throws(()=>patchSupervisor('// Unknown supervisor'),/Unrecognised/);
});
