// A submitted lease may be retried with exactly the same payload. The queue
// returns SAVED for a replay and EXPIRED once the lease is no longer valid.
export const restartRequired='GSF_BROWSER_RESTART_REQUIRED';

export async function closeOwned(resources,timeoutMs=4000){
 let timer;
 try{
  await Promise.race([
   Promise.all(resources.filter(Boolean).map(resource=>Promise.resolve().then(()=>resource.close()))),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(restartRequired)),timeoutMs);})
  ]);
 }finally{clearTimeout(timer);}
}

export function createQuoteDelivery(rpc,{cleanupMs=4000,retryWindowMs=180000,now=Date.now}={}){
 let pending=null,expires=0,retiring=false;
 async function flush(){
  let status;
  if(pending){
   if(now()>=expires){status='EXPIRED';}
   else{
    const response=await rpc(pending);
    status=response.status;
    if(!['SAVED','EXPIRED'].includes(status))throw Error('RELAY_UNAVAILABLE');
   }
   pending=null;
  }
  if(retiring)throw Error(restartRequired);
  return status;
 }
 return {
  get pending(){return pending!==null;},
  get retiring(){return retiring;},
  flush,
  async finish(payload,pages){
   if(pending||retiring)throw Error('Previous GSF job has not settled');
   pending=payload;expires=now()+retryWindowMs;
   try{return await flush();}
   finally{
    try{await closeOwned(pages,cleanupMs);}
    catch{
     retiring=true;
     // If the acknowledgement was lost, flush that lease again before
     // restarting. Never acquire another job using a stuck browser.
     if(!pending)throw Error(restartRequired);
    }
   }
  }
 };
}
