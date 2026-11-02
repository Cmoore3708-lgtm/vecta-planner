import {databaseEnvironment} from '../api/_database-environment.js';
export async function gsfQueue(action, payload, {fetcher = fetch} = {}) {
  const {url, key} = databaseEnvironment({requireService:true});
  const response = await fetcher(url + '/rest/v1/rpc/gsf_service_queue', {method:'POST', redirect:'error',
    headers:{apikey:key, Authorization:'Bearer ' + key, 'Content-Type':'application/json'},
    body:JSON.stringify({p_action:action, p_payload:payload}), signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw Error('QUEUE_UNAVAILABLE');
  return response.json();
}

// Private, recent, successful supplier results only. Never read customer records.
export async function serviceCostHistory(){
 const {url,key}=databaseEnvironment({requireService:true});
 const since=new Date(Date.now()-30*86400000).toISOString();
 const response=await fetch(url+'/rest/v1/gsf_service_jobs?status=eq.MATCHED&completed_at=gte.'+encodeURIComponent(since)+'&select=result&order=completed_at.desc&limit=300',{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(3000)});
 if(!response.ok)throw Error('HISTORY_UNAVAILABLE');
 return response.json();
}
