import { serviceRequest, serviceResult } from '../../../lib/haynes-service.js';
const TEST='https://brqsejjykrubxuofavuu.supabase.co';
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST'||Deno.env.get('SUPABASE_URL')!==TEST)return response({status:'DISABLED'},404);
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(token))return response({status:'UNAUTHORIZED'},401);
  const reader=req.body?.getReader();if(!reader)return response({status:'INVALID_REQUEST'},400);
  let size=0,parts:Uint8Array[]=[];
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>65536){await reader.cancel();return response({status:'INVALID_REQUEST'},413);}parts.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes));
  if(!['enqueue','poll','pull','complete'].includes(body.action))return response({status:'INVALID_ACTION'},400);
  const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
  let payload:Record<string,unknown>={};
  if(body.action==='enqueue')payload=serviceRequest(body.request);
  if(body.action==='poll'){if(!uuid(body.id))return response({status:'INVALID_REQUEST'},400);payload={id:body.id};}
  if(body.action==='complete'){
   if(!uuid(body.id)||!uuid(body.lease))return response({status:'INVALID_RESULT'},400);
   payload={id:body.id,lease:body.lease,status:body.status};
   if(body.status==='MATCHED')payload.result=serviceResult(body.result,body.request);
  }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const result=await fetch(TEST+'/rest/v1/rpc/haynes_service_relay',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:body.action,p_payload:payload,p_token_hash:hash}),signal:AbortSignal.timeout(8000)});
  if(!result.ok)return response({status:'UNAVAILABLE'},503);
  const data=await result.json();return response(data,data.status==='UNAUTHORIZED'?401:200);
 }catch{return response({status:'UNAVAILABLE'},503);}
});
