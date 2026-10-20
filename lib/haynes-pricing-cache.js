import '../public/js/vecta-service-pricing.js';
import {normaliseReg,validReg} from './haynes-vehicle.js';
const {oilQuantity,matchesIdentity}=globalThis.VectaServicePricing;
const PROJECT='https://brqsejjykrubxuofavuu.supabase.co';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

// Read-only, server-to-server cache lookup. It cannot enqueue a worker task,
// alter records or return contacts, mileage, schedules or supplier credentials.
export function createPricingCache({env,fetcher=fetch}){
  return async req=>{
    if(req.method!=='POST')return json({status:'METHOD_NOT_ALLOWED'},405);
    if(env('SUPABASE_URL')!==PROJECT)return json({status:'DISABLED'},404);
    const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
    if(!/^[a-f0-9]{64}$/.test(token))return json({status:'UNAUTHORIZED'},401);
    try{
      const key=env('SUPABASE_SERVICE_ROLE_KEY');
      if(!key)return json({status:'UNAVAILABLE'});
      const headers={apikey:key,Authorization:'Bearer '+key};
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
      const auth=await fetcher(PROJECT+'/rest/v1/haynes_relay_worker?id=eq.1&select=id&site_token_hash=eq.'+hash,{headers,signal:AbortSignal.timeout(1500)});
      if(!auth.ok)throw Error('Authentication unavailable');
      if(!(await auth.json()).length)return json({status:'UNAUTHORIZED'},401);
      // Stream with a hard limit even when Content-Length is omitted.
      const reader=req.body?.getReader();if(!reader)return json({status:'INVALID_REQUEST'},400);
      let length=0,body='';const decoder=new TextDecoder();
      while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>1024){await reader.cancel();return json({status:'INVALID_REQUEST'},413);}body+=decoder.decode(part.value,{stream:true});}
      body+=decoder.decode();const input=JSON.parse(body);
      const registration=normaliseReg(input.registration);
      if(!validReg(registration)||!/^t_\d+$/.test(input.typeId||'')||typeof input.engineCode!=='string'||input.engineCode.length>180)return json({status:'INVALID_REQUEST'},400);
      const query=new URLSearchParams({select:'result',status:'eq.MATCHED','request->>registration':'eq.'+registration,'result->vehicle->>typeId':'eq.'+input.typeId,order:'created_at.desc',limit:'20'});
      const response=await fetcher(PROJECT+'/rest/v1/haynes_service_jobs?'+query,{headers,signal:AbortSignal.timeout(1500)});
      if(!response.ok)throw Error('Cache unavailable');
      const rows=await response.json();
      for(const {result} of rows){
        if(result?.source!=='HaynesPro'||result.kind||!matchesIdentity(result.vehicle,{...input,registration}))continue;
        const oilLitres=oilQuantity(result.oil);
        if(oilLitres!==null)return json({status:'MATCHED',registration,typeId:input.typeId,engineCode:input.engineCode,oilLitres,source:'HaynesPro'});
      }
      return json({status:'UNAVAILABLE'});
    }catch{return json({status:'UNAVAILABLE'});}
  };
}
