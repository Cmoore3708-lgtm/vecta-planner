import {databaseEnvironment} from '../api/_database-environment.js';
export async function workerTestStore(action, payload = {}, {fetcher=fetch} = {}) {
 const {url,key}=databaseEnvironment({requireService:true});
 const response=await fetcher(url+'/rest/v1/rpc/worker_test_queue',{method:'POST',redirect:'error',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:payload}),signal:AbortSignal.timeout(10000)});
 if(!response.ok) throw Error('TEST_STORAGE_UNAVAILABLE');
 return response.json();
}
