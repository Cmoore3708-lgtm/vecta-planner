import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRepairBridge} from '../../workers/repair-quotes/shared-bridge.mjs';
const settings={origin:'https://preview.vercel.app',token:'a'.repeat(64)};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'repair-bridge-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const configPath=path.join(dir,'config.json');fs.writeFileSync(configPath,JSON.stringify({calibrationApproved:true}));
 let gsfTabs=0,haynesTabs=0,closed=0,haynesContexts=0;
 const page=()=>({close:async()=>{closed++;}}),gsfContext={newPage:async()=>{gsfTabs++;return page();}};
 const openHaynesContext=async()=>{haynesContexts++;return {newPage:async()=>{haynesTabs++;return page();},close:async()=>{}};};
 return {configPath,gsfContext,openHaynesContext,counts:()=>({gsfTabs,haynesTabs,closed,haynesContexts})};
}
test('shared bridge borrows GSF context and retries result delivery without repeating the lookup',async t=>{
 const f=fixture(t);let pulls=0,lookups=0,deliveries=0;
 const task={status:'JOB',id:'id',lease:'lease',request:{registration:'FV65JTY',operation:'alternator'}};
 const bridge=createRepairBridge({...settings,...f,lookup:async()=>{lookups++;return {source:'captured'};},rpc:async body=>{
  if(body.action==='pull'){pulls++;return pulls===1?task:{status:'DISABLED'};}
  assert.equal(body.id,'id');assert.equal(body.lease,'lease');assert.equal(body.status,'MATCHED');
  if(++deliveries===1)throw Error('network');return {status:'SAVED'};
 }});
 await assert.rejects(bridge.tick(),/network/);
 assert.equal(await bridge.tick(),'DELIVERED');assert.equal(lookups,1);assert.equal(pulls,1);
 assert.equal(await bridge.tick(),'DISABLED');
 assert.deepEqual(f.counts(),{gsfTabs:1,haynesTabs:1,closed:2,haynesContexts:1});await bridge.close();
});
test('shared bridge reports labour review without manufacturing a quote',async t=>{
 const f=fixture(t);let delivered;
 const bridge=createRepairBridge({...settings,...f,lookup:async()=>{throw Object.assign(Error('scope'),{code:'LABOUR_REVIEW_REQUIRED'});},rpc:async body=>body.action==='pull'?{status:'JOB',id:'id',lease:'lease',request:{}}:(delivered=body,{status:'SAVED'})});
 assert.equal(await bridge.tick(),'LABOUR_REVIEW_REQUIRED');assert.equal(delivered.result,null);assert.equal(delivered.status,'LABOUR_REVIEW_REQUIRED');assert.equal(f.counts().closed,2);await bridge.close();
});
test('shared bridge serialises supplier access and isolates repair pairing failures',async t=>{
 const f=fixture(t);let release,pulls=0;
 const bridge=createRepairBridge({...settings,...f,rpc:async()=>{pulls++;return new Promise(resolve=>{release=resolve;});}});
 const first=bridge.tick();assert.equal(await bridge.tick(),'BUSY');release({status:'DISABLED'});assert.equal(await first,'DISABLED');assert.equal(pulls,1);assert.equal(f.counts().gsfTabs,0);
 const bad=createRepairBridge({...settings,...f,rpc:async()=>{throw Error('PAIRING_REQUIRED');}});
 assert.equal(await bad.tick(),'PAIRING_REQUIRED');assert.equal(await bad.tick(),'PAIRING_REQUIRED');assert.equal(f.counts().gsfTabs,0);
 assert.throws(()=>createRepairBridge({...settings,...f,origin:'http://other.example'}),/SETTINGS_REQUIRED/);
});

import {navigateGSFAlternator} from '../../workers/repair-quotes/gsf-navigation.mjs';
test('GSF calibration enters the requested plate and clicks only observed category controls',async()=>{
 const actions=[];
 const control=label=>({waitFor:async()=>{},count:async()=>1,isVisible:async()=>true,fill:async value=>actions.push(value),click:async()=>actions.push(label)});
 const page={url:()=> 'https://trade.gsfcarparts.com',getByPlaceholder:label=>{assert.equal(label,'ENTER REG / VIN');return control(label);},getByRole:(role,{name})=>control(name),getByText:label=>control(label),evaluate:async()=>({identities:[{text:'FV65JTY Clear'}],candidateCount:2})};
 const result=await navigateGSFAlternator(page,'FV65JTY');
 assert.deepEqual(actions,['FV65JTY','Search VRM Button','All categories','Electrical','Rotating','Alternator']);assert.equal(result.fitmentConfirmed,false);assert.equal(result.catalogueComplete,false);
 await assert.rejects(navigateGSFAlternator({...page,url:()=> 'https://elsewhere.example'},'FV65JTY'),/LOGIN_REQUIRED/);
});
