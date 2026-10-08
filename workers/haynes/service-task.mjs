// At most one service page; vehicle polling continues while it is being read.
export function createServiceTaskRunner(lookup,complete,onError=()=>{}) {
  let pending=null;
  return {
    get busy(){return pending!==null;},
    get done(){return pending||Promise.resolve();},
    start(task){
      if(pending)return false;
      pending=(async()=>{
        let result;
        try{result={status:'MATCHED',result:await lookup(task.request)};}
        catch(error){result={status:['LOGIN_REQUIRED','VERIFICATION_REQUIRED','AMBIGUOUS','SCHEDULE_REQUIRED'].includes(error.code)?error.code:'UNAVAILABLE'};onError({status:result.status,reason:error.name==='TimeoutError'?'TIMEOUT':error.code||'BROWSER_ERROR'});}
        await complete({action:'complete',id:task.id,lease:task.lease,request:task.request,...result});
      })().catch(onError).finally(()=>{pending=null;});
      return true;
    }
  };
}
