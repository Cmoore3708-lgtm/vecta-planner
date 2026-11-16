import {databaseEnvironment} from './_database-environment.js';
import {whatsappHistoryConfig,constantEqual,validSignature,rawWebhookBody,whatsappEvents} from '../lib/whatsapp-history.js';

const json=(status,body,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
async function handler(req) {
  if(!['GET','POST'].includes(req.method))return json(405,{error:'Method not allowed.'},{Allow:'GET, POST'});
  const settings=whatsappHistoryConfig();
  if(!settings)return json(503,{error:'WhatsApp connection is not configured.'});
  if(req.method==='GET'){
    const q=Object.fromEntries(new URL(req.url).searchParams);
    if(q['hub.mode']!=='subscribe'||!constantEqual(q['hub.verify_token'],settings.verifyToken)||typeof q['hub.challenge']!=='string'||q['hub.challenge'].length>200)return json(403,{error:'Verification failed.'});
    return new Response(q['hub.challenge'],{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  }
  try{
    const raw=await rawWebhookBody(req);
    if(!validSignature(raw,req.headers.get('x-hub-signature-256'),settings.secret))return json(401,{error:'Invalid signature.'});
    let payload;try{payload=JSON.parse(raw.toString('utf8'));}catch{return json(400,{error:'Invalid JSON.'});}
    const rows=whatsappEvents(payload,settings);
    if(rows.length){
      const {url,key}=databaseEnvironment({requireService:true});
      const response=await fetch(url+'/rest/v1/workshop_whatsapp_events?on_conflict=id',{
        method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
        body:JSON.stringify(rows),signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Error('Storage unavailable'); // non-200 asks Meta to retry; no payloads/secrets in logs
    }
    return json(200,{received:true});
  }catch(error){return json(error.status||503,{error:error.status?error.message:'WhatsApp history could not be saved. Retry required.'});}
}

export default {fetch:handler};
