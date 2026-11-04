import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const manual = new Set(['LOGIN_REQUIRED','VERIFICATION_REQUIRED','PAIRING_REQUIRED','SIGN_IN_OR_SETTINGS_REQUIRED','SETTINGS_REQUIRED','DAILY_LIMIT']);
const transient = new Set(['RELAY_UNAVAILABLE','CONNECTION_UNAVAILABLE','BROWSER_DISCONNECTED','BROWSER_CLOSED']);
export function recoveryReason(status, {pid, startedAt, now, reconnectSince, attentionSince=null, startupGrace=90000, attentionGrace=60000}={}) {
  if (!status || status.pid!==pid) return now-startedAt>90000?'HEARTBEAT_MISSING':null;
  const age=now-Date.parse(status.updatedAt);
  if (!Number.isFinite(age)||age<0||age>90000) return 'HEARTBEAT_STALE';
  // The previous process's warning is retained for display during startup.
  // It must never request a stop before the new worker can verify its session.
  if (now-startedAt<startupGrace || status.state==='starting') return null;
  // A valid in-flight lookup is allowed to finish. Never restart for one
  // registration's NOT_FOUND/AMBIGUOUS result or an ordinary idle heartbeat.
  if (status.state==='working') return null;
  const reason=status.attentionReason||status.reason;
  if (status.state==='attention' && manual.has(reason)) return attentionSince!==null && now-attentionSince>=attentionGrace?'MANUAL_'+reason:null;
  if (status.state==='reconnecting' || transient.has(reason)) {
    return reconnectSince!==null && now-reconnectSince>=120000?'CONNECTION_STALLED':null;
  }
  return null;
}

export async function supervise(entry,{env=process.env,interval=1500,backoff=[30000,120000,300000,900000],drainTimeout=120000,startupGrace=90000,attentionGrace=60000,log=console.log}={}) {
  const statusFile=env.VECTA_WORKER_STATUS_FILE, stopFile=env.VECTA_WORKER_STOP_FILE;
  if(!statusFile||!stopFile)throw Error('Managed worker status and stop files are required');
  const recoveryFile=statusFile+'.recovery-stop';
  const sleep=()=>new Promise(resolve=>setTimeout(resolve,interval));
  const stopped=()=>fs.existsSync(stopFile);
  const read=()=>{try{return JSON.parse(fs.readFileSync(statusFile,'utf8'))}catch{return null}};
  let attentionReason='';
  const writeRecovery=(state,reason)=>{
    const file=statusFile+'.supervisor.tmp';
    fs.writeFileSync(file,JSON.stringify({name:env.VECTA_WORKER_NAME||'Worker',pid:process.pid,state,reason,attentionReason,updatedAt:new Date().toISOString()}));
    fs.renameSync(file,statusFile);
  };
  let failures=0, retryAt=0;
  const manualRetried=new Set();
  fs.mkdirSync(path.dirname(statusFile),{recursive:true});
  while(!stopped()) {
    if(Date.now()<retryAt){writeRecovery('reconnecting','AUTO_RESTART_WAIT');await sleep();continue;}
    fs.rmSync(recoveryFile,{force:true});
    const startedAt=Date.now();
    const child=spawn(process.execPath,[entry],{env:{...env,VECTA_WORKER_RECOVERY_FILE:recoveryFile},stdio:'inherit',windowsHide:false});
    let exited=false, spawnFailed=false;
    child.once('exit',()=>{exited=true});child.once('error',()=>{spawnFailed=true;exited=true});
    let reconnectSince=null, requestedAt=null, pendingReason=null, healthySince=null, attentionSince=null, lastAttention='';
    while(!exited) {
      await sleep();
      if(stopped())continue; // Child observes the same operator stop file.
      const now=Date.now(), status=read();
      const owned=status?.pid===child.pid;
      if(owned)attentionReason=status.attentionReason||(status.state==='attention'?status.reason:'')||'';
      if(owned && status.state==='connected' && status.lookupConfirmedAt && !status.attentionReason){
        healthySince??=now;
        if(now-healthySince>=600000){failures=0;manualRetried.clear();}
      }else healthySince=null;
      const transientFailure=owned&&(status.state==='reconnecting'||transient.has(status.reason));
      if(transientFailure)reconnectSince??=now;else reconnectSince=null;
      const currentAttention=owned&&status.state==='attention'?(status.attentionReason||status.reason||''):'';
      if(currentAttention!==lastAttention){attentionSince=currentAttention?now:null;lastAttention=currentAttention;}
      if(requestedAt!==null){
        if(now-requestedAt>drainTimeout){
          // Do not kill a browser-owning process or start a duplicate if it
          // ignores the safe stop; retain the failure for operator diagnosis.
          log('Automatic recovery is waiting for the existing worker to stop safely.');
          requestedAt=now;
        }
        continue;
      }
      const reason=recoveryReason(status,{pid:child.pid,startedAt,now,reconnectSince,attentionSince,startupGrace,attentionGrace});
      if(!reason)continue;
      if(reason.startsWith('MANUAL_')){
        if(manualRetried.has(reason))continue;
        manualRetried.add(reason);
      }
      pendingReason=reason;requestedAt=now;
      fs.writeFileSync(recoveryFile,'stop');
      log('Automatic recovery requested: '+reason+'. Finishing current work before restarting.');
    }
    if(stopped())break;
    // One session restart can recover a stale browser. If the same supplier
    // challenge returns, leave it visible rather than repeatedly closing it.
    const delay=backoff[Math.min(failures++,backoff.length-1)];
    retryAt=Date.now()+delay;
    log('Worker '+(spawnFailed?'could not start':'stopped')+'. Automatic retry in '+Math.ceil(delay/1000)+' seconds'+(pendingReason?' ('+pendingReason+')':'')+'.');
  }
  fs.rmSync(recoveryFile,{force:true});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const entry=process.argv[2];if(!entry||!path.isAbsolute(entry))throw Error('Absolute worker entry required');
  await supervise(entry);
}
