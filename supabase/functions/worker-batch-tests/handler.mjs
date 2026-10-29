import {selectCohort,cleanCompletion,DIAGNOSTIC_BUILD} from '../../../lib/worker-tests.js';
const TEST='https://brqsejjykrubxuofavuu.supabase.co';
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value||'');
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function batchRelayHandler({env,fetcher=fetch}={}) {
 return async req=>{
  if(req.method!=='POST')return reply({status:'METHOD_NOT_ALLOWED'},405);
  if(env('SUPABASE_URL')!==TEST)return reply({status:'DISABLED'},404);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(token))return reply({status:'UNAUTHORIZED'},401);
  try{
   const key=env('SUPABASE_SERVICE_ROLE_KEY');if(!key)return reply({status:'UNAVAILABLE'},503);
   const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
   const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
   // Reuse the PC's existing paired identity. Neither the pairing nor the other
   // workers' heartbeat/quota state is modified by authenticating diagnostics.
   const auth=await fetcher(TEST+'/rest/v1/haynes_relay_worker?id=eq.1&select=id&token_hash=eq.'+tokenHash,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!auth.ok)return reply({status:'UNAVAILABLE'},503);
   const matches=await auth.json();if(!Array.isArray(matches)||matches.length!==1)return reply({status:'UNAUTHORIZED'},401);
   let length=0;const reader=req.body?.getReader(),chunks=[];
   if(!reader)return reply({status:'INVALID_REQUEST'},400);
   while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>24000){await reader.cancel();return reply({status:'INVALID_REQUEST'},413);}chunks.push(chunk.value);}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const body=JSON.parse(new TextDecoder().decode(bytes));
   const store=async(action,payload={})=>{
    const r=await fetcher(TEST+'/rest/v1/rpc/worker_test_queue',{method:'POST',redirect:'error',headers,body:JSON.stringify({p_action:action,p_payload:payload}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('STORAGE_UNAVAILABLE');return r.json();
   };
   if(body.action==='preflight')return reply(await store('preflight'));
   if(body.action==='heartbeat'&&body.build===DIAGNOSTIC_BUILD&&/^[a-f0-9]{64}$/.test(body.revision||'')&&uuid(body.workerId))return reply(await store('heartbeat',{workerId:body.workerId,build:body.build,revision:body.revision,ready:body.ready===true}));
   if(body.action==='pull'&&uuid(body.workerId))return reply(await store('pull',{workerId:body.workerId}));
   if(body.action==='complete')return reply(await store('complete',cleanCompletion(body)));
   if(body.action==='start'&&uuid(body.launchKey)&&[2,100].includes(body.count)){
    const ready=await store('preflight');if(ready.activeRun)return reply({status:'ACTIVE_RUN',id:ready.activeRun});if(ready.status!=='READY')return reply(ready);
    const source=await store('cohort'),cohort=selectCohort(source.vehicles||[],body.count);
    if(!cohort.some(row=>row.registration==='CM14KEL'))return reply({status:'REQUIRED_REGISTRATION_MISSING'},409);
    return reply(await store('start',{launchKey:body.launchKey,cohort,previousRun:null}));
   }
   if(['status','resume','pause','cancel'].includes(body.action)&&uuid(body.id))return reply(await store(body.action,{id:body.id}));
   return reply({status:'INVALID_REQUEST'},400);
  }catch(error){return reply({status:error.message==='INSUFFICIENT_REGISTRATIONS'?error.message:'UNAVAILABLE'},503);}
 };
}
