import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorkerRuntime} from '../../lib/worker-runtime.js';
test('relay polls never manufacture or refresh lookup confirmation; login survives retries',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-status-'));
 const file=path.join(root,'Haynes.json');let now=Date.parse('2026-11-03T12:00:00Z');
 const runtime=createWorkerRuntime('Haynes',{env:{VECTA_WORKER_STATUS_FILE:file},now:()=>now,timers:false});
 const read=()=>JSON.parse(fs.readFileSync(file));
 try {
  runtime.set('connected','RELAY_ONLY');assert.equal(read().lookupConfirmedAt,null);
  runtime.set('attention','LOGIN_REQUIRED');runtime.set('working');assert.equal(read().attentionReason,'LOGIN_REQUIRED');
  runtime.set('reconnecting','RELAY_UNAVAILABLE');assert.equal(read().attentionReason,'LOGIN_REQUIRED');
  runtime.set('connected','RELAY_ONLY');assert.equal(read().state,'attention');
  runtime.set('connected','LOOKUP_CONFIRMED');const confirmed=read().lookupConfirmedAt;
  assert.equal(read().attentionReason,'');assert.equal(confirmed,new Date(now).toISOString());
  now+=120000;runtime.set('connected','RELAY_ONLY');assert.equal(read().lookupConfirmedAt,confirmed);
  runtime.set('attention','UNAVAILABLE');assert.equal(read().lookupConfirmedAt,null);
  runtime.set('connected','RELAY_ONLY');assert.equal(read().state,'attention');
 } finally {runtime.close();fs.rmSync(root,{recursive:true});}
});
test('manager never colours a relay-only heartbeat green and supports older records',()=>{
 const source=fs.readFileSync(new URL('../../workers/control/workshop-workers.ps1',import.meta.url),'utf8');
 assert.doesNotMatch(source,/if \(\$status.state -eq 'connected'\) \{ \$colour = \[System.Drawing.Color\]::LightGreen/);
 assert.match(source,/\$lookupAge -ge 0 -and \$lookupAge -lt 60/);
 assert.match(source,/\$status.attentionReason -or \$status.state -eq 'attention'/);
 assert.match(source,/Relay reachable - supplier lookup not verified/);
});
