import {cleanTyreCatalogue} from './tyre-relay-contract.js';
export async function relayTyreLookup(size,quantity,{token=process.env.HAYNES_RELAY_SITE_TOKEN,fetcher=fetch,wait=()=>new Promise(r=>setTimeout(r,500))}={}){
 if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('NOT_CONFIGURED');
 const signal=AbortSignal.timeout(22000),endpoint='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/tyre-pc-relay';
 const rpc=async body=>{const r=await fetcher(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(!r.ok)throw Error('UNAVAILABLE');return r.json()};
 let data=await rpc({action:'enqueue',size,quantity});while(data.status==='PENDING'){if(typeof data.id!=='string'||!(/^[a-f0-9-]{36}$/.test(data.id)))throw Error('INVALID_RESULT');await wait();data=await rpc({action:'poll',id:data.id})}
 if(data.status!=='MATCHED')return{status:['OFFLINE','LOGIN_REQUIRED','SETTINGS_REQUIRED','BUSY','DAILY_LIMIT'].includes(data.status)?data.status:'UNAVAILABLE'};
 return{status:'MATCHED',...cleanTyreCatalogue(data.result,size)};
}
