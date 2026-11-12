import fs from 'node:fs';
import {closeOwned,createQuoteDelivery,restartRequired} from '../gsf/quote-delivery.mjs';
import {lookupRepair} from './catalogue.mjs';
import {createGeneralRepairSession} from './general-repair.mjs';
import {repairRequest} from '../../lib/repair-quote.js';
const validOrigin=value=>/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(value||'');
export function createRepairBridge({origin,token,gsfContext,openHaynesContext,configPath,lookup,rpc:providedRpc,log=()=>{},timeoutMs=60000,cleanupMs=4000}){
 if(!validOrigin(origin)||!/^[a-f0-9]{64}$/.test(token||''))throw Error('SETTINGS_REQUIRED');
 const rpc=providedRpc||async function(body){
  const response=await fetch(origin+'/api/repair-quote-worker',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(response.status===401)throw Error('PAIRING_REQUIRED');if(!response.ok)throw Error('RELAY_UNAVAILABLE');return response.json();
 };
 let haynesContext=null,busy=false,unpaired=false;
 const general=createGeneralRepairSession();
 const runLookup=lookup||((pages,request,config)=>lookupRepair(pages,request,config,{general}));
 const delivery=createQuoteDelivery(rpc,{cleanupMs,retryWindowMs:120000});
 return {
  get retiring(){return delivery.retiring;},
  async tick(){
   if(busy)return 'BUSY';if(unpaired)return 'PAIRING_REQUIRED';busy=true;
   try{
    if(delivery.pending||delivery.retiring){const ack=await delivery.flush();return ack==='SAVED'?'DELIVERED':'EXPIRED';}
    const task=await rpc({action:'pull',repairProtocol:4});
    if(task.status!=='JOB')return task.status;
    let gsfPage,haynesPage,timer,result=null,status='MATCHED';
    try{
     let config={lookupMode:'vehicle-catalogue'};
     try{config=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
     // Do not claim/setup a second GSF browser: use the service worker's context.
     const request=repairRequest(task.request);
     if(request.lookup!=='labour')gsfPage=await gsfContext.newPage();
     if(request.lookup!=='parts'){haynesContext||=await openHaynesContext();haynesPage=await haynesContext.newPage();}
     result=await Promise.race([runLookup({gsfPage,haynesPage},task.request,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),timeoutMs);})]);
    }catch(error){
     const code=error.code||error.message;
     status=['CHOICE_REQUIRED','LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','OUT_OF_STOCK'].includes(code)?code:['SETTINGS_REQUIRED','ENOENT'].includes(code)?'SETTINGS_REQUIRED':'UNAVAILABLE';
     if(status==='CHOICE_REQUIRED')result=error.result;
     log('Repair lookup: '+status);
    }finally{clearTimeout(timer);}
    const completion={action:'complete',id:task.id,lease:task.lease,request:task.request,status,result};
    const ack=await delivery.finish(completion,[gsfPage,haynesPage]);
    return ack==='SAVED'?status:'EXPIRED';
   }catch(error){
    if(error.message==='PAIRING_REQUIRED'){
     if(delivery.retiring)throw Error(restartRequired);
     unpaired=true;log('Repair quote pairing needs updating; service pricing can continue.');return 'PAIRING_REQUIRED';
    }
    throw error;
   }
   finally{busy=false;}
  },
  async close(){general.clear();await closeOwned([haynesContext],cleanupMs);}
 };
}
