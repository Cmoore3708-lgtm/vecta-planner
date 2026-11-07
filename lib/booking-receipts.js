import {databaseEnvironment} from '../api/_database-environment.js';

export async function receiptRpc(action,id=null,lease=null,payload={}){
 const {url,key}=databaseEnvironment({requireService:true});
 const response=await fetch(url+'/rest/v1/rpc/vecta_booking_receipt',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_id:id,p_lease:lease,p_payload:payload}),signal:AbortSignal.timeout(action==='status'?1500:10000)});
 if(!response.ok)throw Error('Receipt queue unavailable');return response.json();
}
