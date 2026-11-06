// The Windows caller holds Tyres.json open without delete sharing throughout
// this test, reproducing the failed rename without operating any real worker.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { chromium } from '../../workers/haynes/node_modules/playwright/index.mjs';
import { patchSupervisor } from '../../scripts/haynes-sign-in-update/managed-repair.mjs';
import { openTyreSupplier } from '../../workers/tyres/open-supplier.mjs';

const folder=process.argv[2], sourcePath=process.argv[3];
const status=path.join(folder,'Tyres.json'), stop=path.join(folder,'Tyres.stop');
const installed=await fs.readFile(sourcePath,'utf8');
const patched=patchSupervisor(installed);
assert.equal(patchSupervisor(patched),patched);
await fs.writeFile(path.join(folder,'supervisor.mjs'),patched);
await fs.copyFile(new URL('../../workers/control/recovery-status.mjs',import.meta.url),path.join(folder,'recovery-status.mjs'));
const child=path.join(folder,'test-worker.mjs');
await fs.writeFile(child,`
import fs from 'node:fs';
if (!fs.existsSync(process.env.STARTED)) { fs.writeFileSync(process.env.STARTED,'first');process.exit(1); }
fs.appendFileSync(process.env.STARTED,',replacement');fs.writeFileSync(process.env.VECTA_WORKER_STOP_FILE,'stop');
`);
const {supervise} = await import(pathToFileURL(path.join(folder,'supervisor.mjs')).href);
const messages=[], started=path.join(folder,'started');
const watchdog=setTimeout(()=>fs.writeFile(stop,'stop').catch(()=>{}),10000);
try {
  await supervise(child,{env:{...process.env,STARTED:started,VECTA_WORKER_NAME:'Tyres',VECTA_WORKER_STATUS_FILE:status,VECTA_WORKER_STOP_FILE:stop},interval:30,backoff:[350],log:msg=>messages.push(msg)});
} finally {clearTimeout(watchdog);}
assert.equal(await fs.readFile(started,'utf8'),'first,replacement');
assert.ok(messages.some(line=>/status update delayed \((EPERM|EBUSY|EACCES)\)/.test(line)));
assert.deepEqual(JSON.parse(await fs.readFile(status,'utf8')),{state:'previous'});
console.log('Passed locked Tyres.json: previous status readable; supervisor restarted the failed worker.');

const server=http.createServer((req,res)=>{
  if(req.url==='/slow'){res.writeHead(200,{'content-type':'image/png'});res.flushHeaders();return;}
  res.end('<!DOCTYPE html><input id="key1"><img src="/slow">');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();
  await openTyreSupplier(page,'http://127.0.0.1:'+server.address().port+'/');
  assert.ok(await page.locator('#key1').isVisible());
  await assert.rejects(page.waitForLoadState('load',{timeout:250}),{name:'TimeoutError'});
  console.log('Passed tyre startup in Windows Edge with a supplier asset still loading.');
}finally{
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
