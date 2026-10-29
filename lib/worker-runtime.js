import fs from 'node:fs';
import path from 'node:path';

// Local operator status only: never includes supplier/customer data or secrets.
export function createWorkerRuntime(name, {env=process.env, now=Date.now, io=fs, timers=true}={}) {
  const statusFile=env.VECTA_WORKER_STATUS_FILE, stopFile=env.VECTA_WORKER_STOP_FILE;
  let state='starting', reason='', stopping=false, attentionReason='';
  function write() {
    if(!statusFile)return;
    const temporary=statusFile+'.'+process.pid+'.tmp';
    try {
      io.mkdirSync(path.dirname(statusFile),{recursive:true});
      io.writeFileSync(temporary,JSON.stringify({name,pid:process.pid,version:env.VECTA_WORKER_VERSION||'',state,reason,updatedAt:new Date(now()).toISOString()}),{mode:0o600});
      io.renameSync(temporary,statusFile);
    } catch {try{io.unlinkSync(temporary)}catch{}}
  }
  const timer=statusFile&&timers?setInterval(write,15000):null;
  timer?.unref(); write();
  return {
    set(next, detail='') {
      if(!['starting','connected','working','attention','reconnecting','stopped'].includes(next))throw Error('Invalid worker status');
      if(detail&&!/^[A-Z_]{1,48}$/.test(detail))throw Error('Invalid worker status reason');
      if(next==='attention')attentionReason=detail||'REVIEW_REQUIRED';
      if(next==='connected'&&detail==='LOOKUP_CONFIRMED')attentionReason='';
      if(next==='connected'&&detail==='STARTUP_CONFIRMED'&&attentionReason==='SIGN_IN_OR_SETTINGS_REQUIRED')attentionReason='';
      state=next==='connected'&&attentionReason?'attention':next;
      reason=state==='attention'?attentionReason:detail;write();
    },
    stopRequested(){return stopping ||= !!stopFile&&io.existsSync(stopFile);},
    close(){clearInterval(timer);state='stopped';reason=attentionReason;write();}
  };
}
