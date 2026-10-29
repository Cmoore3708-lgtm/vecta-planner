import {readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const sourceRevision=()=>{const hash=createHash('sha256');for(const file of ['worker.mjs','supplier.mjs','live-service.mjs','service-capture.mjs','product-dialog.mjs','oil-capacity.mjs','diagnostic-case.mjs','diagnostic-product.mjs','diagnostic-bridge.mjs','../../lib/service-pricing.js','../../lib/worker-tests.js'])hash.update(file).update(readFileSync(new URL(file,import.meta.url)));return hash.digest('hex');};
import {DIAGNOSTIC_BUILD,cleanEvidence} from '../../lib/worker-tests.js';
import {diagnosticCase} from './diagnostic-case.mjs';
// Runs only within the existing browser owner. No second profile or process.
export function createDiagnosticBridge({context,origin,token,ready,outboxPath,rpc:providedRpc,lookup=diagnosticCase,now=Date.now,timeoutMs=170000,revision=sourceRevision(),log=()=>{}}) {
 const workerId=randomUUID();let pending=null,lastBeat=0,available=false,busy=false;
 try{pending=JSON.parse(readFileSync(outboxPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('DIAGNOSTIC_OUTBOX_UNREADABLE');}
 const rpc=providedRpc||(async(body)=>{
  const r=await fetch(origin+'/api/worker-tests-worker',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error(r.status===401?'PAIRING_REQUIRED':'DIAGNOSTIC_RELAY_UNAVAILABLE');return r.json();
 });
 const persist=()=>{writeFileSync(outboxPath+'.tmp',JSON.stringify(pending),{mode:0o600});renameSync(outboxPath+'.tmp',outboxPath);};
 async function deliver(){
  const result=await rpc(pending);
  if(!['SAVED','EXPIRED'].includes(result.status))throw Error('DIAGNOSTIC_DELIVERY_UNAVAILABLE');
  if(result.status==='EXPIRED')log('Test receipt expired; the server will resume the case.');
  pending=null;try{unlinkSync(outboxPath);}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 async function heartbeat(){
  if(now()-lastBeat<20000)return available;
  lastBeat=now();
  try{const r=await rpc({action:'heartbeat',workerId,build:DIAGNOSTIC_BUILD,revision,ready});available=r.status==='READY';}catch{available=false;}
  return available;
 }
 return {
  heartbeat,
  async tick(){
   if(busy)return 'BUSY';busy=true;
   let page,timer,beat;
   try{
    if(pending){await deliver();return 'DELIVERED';}
    if(!await heartbeat()||!ready)return 'NOT_READY';
    const task=await rpc({action:'pull',workerId});
    if(task.status!=='JOB')return task.status;
    const started=now();let result;
    try{
     page=await context.newPage();
     // Keep capability heartbeat alive while a long supplier lookup owns the page.
     beat=setInterval(()=>{void heartbeat();},20000);beat.unref?.();
     result=await Promise.race([lookup(page,task.request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),timeoutMs);})]);
    }catch(error){result={outcome:'FAILED',reason:error.message==='LOOKUP_TIMEOUT'?'LOOKUP_TIMEOUT':'LOOKUP_FAILED',evidence:{stage:'WORKER_LOOKUP'}};}
    finally{clearTimeout(timer);clearInterval(beat);await page?.close().catch(()=>{});page=null;}
    pending={action:'complete',id:task.id,lease:task.lease,...result,evidence:cleanEvidence({...result.evidence,reason:result.reason,workerBuild:revision}),durationMs:now()-started};
    persist();await deliver();return result.outcome;
   }finally{clearTimeout(timer);clearInterval(beat);await page?.close().catch(()=>{});busy=false;}
  }
 };
}
