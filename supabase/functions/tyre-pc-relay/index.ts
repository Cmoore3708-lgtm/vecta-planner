import {parseSize} from '../../../workers/tyres/guide.mjs';
import {cleanTyreCatalogue} from '../../../lib/tyre-relay-contract.js';
const TEST='https://brqsejjykrubxuofavuu.supabase.co';
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({status:'METHOD_NOT_ALLOWED'},405);
 if(Deno.env.get('SUPABASE_URL')!==TEST)return reply({status:'DISABLED'},404);
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return reply({status:'UNAUTHORIZED'},401);
  const reader=req.body?.getReader();if(!reader)return reply({status:'INVALID_REQUEST'},400);
  const chunks:Uint8Array[]=[];let size=0;while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>250000){await reader.cancel();return reply({status:'INVALID_REQUEST'},413)}chunks.push(x.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  const body=JSON.parse(new TextDecoder().decode(bytes)),action=body.action;
  if(!['enqueue','poll','pull','complete'].includes(action))return reply({status:'INVALID_ACTION'},400);
  let payload:Record<string,unknown>={};const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if(action==='enqueue'){if(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>4)return reply({status:'INVALID_REQUEST'},400);payload={size:parseSize(body.size).key,quantity:body.quantity}}
  if(action==='poll'){if(!uuid.test(body.id))return reply({status:'INVALID_REQUEST'},400);payload={id:body.id}}
  if(action==='complete'){if(!uuid.test(body.id)||!uuid.test(body.lease)||!['MATCHED','UNAVAILABLE','LOGIN_REQUIRED','SETTINGS_REQUIRED'].includes(body.status))return reply({status:'INVALID_RESULT'},400);payload={id:body.id,lease:body.lease,status:body.status};if(body.status==='MATCHED')payload.result=cleanTyreCatalogue(body.result,body.result?.size)}
  const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r=await fetch(TEST+'/rest/v1/rpc/tyre_relay',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:payload,p_token_hash:tokenHash}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)return reply({status:'UNAVAILABLE'},503);const data=await r.json();return reply(data,data.status==='UNAUTHORIZED'?401:200);
 }catch{return reply({status:'UNAVAILABLE'},503)}
});
