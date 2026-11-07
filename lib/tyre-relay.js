import {cleanTyreCatalogue} from './tyre-relay-contract.js';
const endpoint='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/tyre-pc-relay';
export async function relayTyreLookup(size,quantity,{token=process.env.HAYNES_RELAY_SITE_TOKEN,fetcher=fetch,wait=()=>new Promise(r=>setTimeout(r,500)),cachedOnly=false}={}){
 if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('NOT_CONFIGURED');
 const rpc=async(body,signal)=>{const r=await fetcher(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(!r.ok)throw Error('UNAVAILABLE');return r.json()};
 let failure='UNAVAILABLE';
 if(!cachedOnly)try{
  const signal=AbortSignal.timeout(18000);
  let data=await rpc({action:'enqueue',size,quantity},signal);
  while(data.status==='PENDING'){if(typeof data.id!=='string'||!(/^[a-f0-9-]{36}$/.test(data.id)))throw Error('INVALID_RESULT');await wait();data=await rpc({action:'poll',id:data.id},signal)}
  if(data.status==='MATCHED')return{status:'MATCHED',...cleanTyreCatalogue(data.result,size)};
  if(['OFFLINE','LOGIN_REQUIRED','SETTINGS_REQUIRED','BUSY','DAILY_LIMIT'].includes(data.status))failure=data.status;
 }catch{ /* The durable catalogue has its own timeout, including after a live timeout. */ }
 try{
  const data=await rpc({action:'cached',size,quantity},AbortSignal.timeout(4000));
  if(data.status==='MATCHED')return{status:'MATCHED',...cleanTyreCatalogue(data.result,size,Date.now(),{saved:true}),priceSource:'saved'};
 }catch{ /* No matching saved price: keep the existing enquiry route. */ }
 return{status:failure};
}
