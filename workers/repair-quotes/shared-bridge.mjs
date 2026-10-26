import fs from 'node:fs';
import {lookupRepair} from './catalogue.mjs';
const validOrigin=value=>/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(value||'');
export function createRepairBridge({origin,token,gsfContext,openHaynesContext,configPath,lookup=lookupRepair,rpc:providedRpc,log=()=>{},timeoutMs=60000}){
 if(!validOrigin(origin)||!/^[a-f0-9]{64}$/.test(token||''))throw Error('SETTINGS_REQUIRED');
 const rpc=providedRpc||async function(body){
  const response=await fetch(origin+'/api/repair-quote-worker',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(response.status===401)throw Error('PAIRING_REQUIRED');if(!response.ok)throw Error('RELAY_UNAVAILABLE');return response.json();
 };
 let pending=null,haynesContext=null,busy=false,unpaired=false;
 async function deliver(){const result=await rpc(pending);if(result.status!=='SAVED'&&result.status!=='EXPIRED')throw Error('RELAY_UNAVAILABLE');pending=null;}
 return {
  async tick(){
   if(busy)return 'BUSY';if(unpaired)return 'PAIRING_REQUIRED';busy=true;
   try{
    if(pending){await deliver();return 'DELIVERED';}
    const task=await rpc({action:'pull'});
    if(task.status!=='JOB')return task.status;
    let gsfPage,haynesPage,timer,result=null,status='MATCHED';
    try{
     const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
     // Do not claim/setup a second GSF browser: use the service worker's context.
     gsfPage=await gsfContext.newPage();
     haynesContext||=await openHaynesContext();haynesPage=await haynesContext.newPage();
     result=await Promise.race([lookup({gsfPage,haynesPage},task.request,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),timeoutMs);})]);
    }catch(error){
     const code=error.code||error.message;
     status=['LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','OUT_OF_STOCK'].includes(code)?code:['SETTINGS_REQUIRED','ENOENT'].includes(code)?'SETTINGS_REQUIRED':'UNAVAILABLE';
     log('Repair lookup: '+status);
    }finally{
     clearTimeout(timer);await Promise.allSettled([gsfPage?.close(),haynesPage?.close()]);
    }
    pending={action:'complete',id:task.id,lease:task.lease,request:task.request,status,result};
    await deliver();return status;
   }catch(error){if(error.message==='PAIRING_REQUIRED'){unpaired=true;log('Repair quote pairing needs updating; service pricing can continue.');return 'PAIRING_REQUIRED';}throw error;}
   finally{busy=false;}
  },
  async close(){await haynesContext?.close().catch(()=>{});}
 };
}
