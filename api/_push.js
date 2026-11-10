import crypto from 'node:crypto';
import webpush from 'web-push';
import {databaseEnvironment} from './_database-environment.js';

function base64url(value){return Buffer.from(value).toString('base64url')}
function privateKeyBytes(secret){
  const order=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const digest=crypto.createHash('sha256').update(`vecta-workshop-booking-badges:v1:${secret}`).digest('hex');
  const scalar=(BigInt(`0x${digest}`)%(order-1n))+1n;
  return Buffer.from(scalar.toString(16).padStart(64,'0'),'hex');
}
export function pushConfig(){
  const {serviceKey}=databaseEnvironment({requireService:true});
  const secret=process.env.VAPID_SECRET||serviceKey;
  if(!secret)throw new Error('Push alerts are not configured');
  const privateBytes=privateKeyBytes(secret),ecdh=crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateBytes);
  const publicKey=base64url(ecdh.getPublicKey(undefined,'uncompressed')),privateKey=base64url(privateBytes);
  webpush.setVapidDetails('https://vectamotors.co.uk',publicKey,privateKey);
  return {publicKey};
}
export async function supabaseRest(path,{method='GET',body}={}){
  const {url,key}=databaseEnvironment({requireService:true});
  const response=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(await response.text());
  if(response.status===204)return null;
  return response.json().catch(()=>null);
}
export async function sendPushSubscription(subscription,payload){
  pushConfig();
  return webpush.sendNotification(subscription,typeof payload==='string'?payload:JSON.stringify(payload));
}

export async function sendBookingBadges(){
  try{
    pushConfig();
    const [subscriptions,pending]=await Promise.all([supabaseRest('workshop_push_subscriptions?select=endpoint,subscription&audience=eq.manager'),supabaseRest('website_booking_requests?select=id&status=eq.awaiting_review')]);
    const count=Array.isArray(pending)?pending.length:0,payload=JSON.stringify({title:'New VECTA website booking',body:'A new customer booking is waiting for review.',count,url:'/?view=websiteRequests'});
    await Promise.allSettled((subscriptions||[]).map(async row=>{
      try{await webpush.sendNotification(row.subscription,payload,{timeout:5000})}catch(error){
        if(error&&[404,410].includes(error.statusCode)){await supabaseRest(`workshop_push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`,{method:'DELETE'}).catch(()=>{});return}
        throw error;
      }
    }));
  }catch(error){console.warn('Website booking badge delivery skipped',error&&error.message||error)}
}

// The subscription audience is derived from authenticated workshop identity,
// never from a browser-provided role. Push text contains no customer or prices.
export async function sendPortalPush({audience='manager',eventId}){
 try{
  const subscriptions=await supabaseRest('workshop_push_subscriptions?select=endpoint,subscription&audience=eq.'+audience);
  const payload={title:audience==='mechanic'?'VECTA — job update':'VECTA — customer message',body:audience==='mechanic'?'Open your job update.':'A customer has sent a message or responded to a work request.',tag:'vecta-portal-'+eventId,url:'/?portal_event='+encodeURIComponent(eventId),portal:true};
  const results=await Promise.allSettled((subscriptions||[]).map(async row=>{
   try{await sendPushSubscription(row.subscription,payload);}catch(error){if([404,410].includes(error.statusCode)){await supabaseRest('workshop_push_subscriptions?endpoint=eq.'+encodeURIComponent(row.endpoint),{method:'DELETE'});return;}throw error;}
  }));
  if(results.some(r=>r.status==='rejected'))return false;
  await supabaseRest('customer_portal_events?id=eq.'+encodeURIComponent(eventId),{method:'PATCH',body:{[audience+'_push_done']:true}});
  return true;
 }catch{console.warn('Portal push unavailable; message remains in the workshop inbox.');return false;}
}
export async function retryPortalPushes(){
 const rows=await supabaseRest('customer_portal_events?'+new URLSearchParams({select:'id,manager_alert,mechanic_at,manager_push_done,mechanic_push_done,push_attempts,push_next_at',or:'(and(manager_alert.eq.true,manager_push_done.eq.false),and(mechanic_at.not.is.null,mechanic_push_done.eq.false))',push_attempts:'lt.8',order:'seq.asc',limit:30}));
 for(const row of rows||[]){
  if(row.push_next_at&&Date.parse(row.push_next_at)>Date.now())continue;
  const lease=await supabaseRest('customer_portal_events?'+new URLSearchParams({id:'eq.'+row.id,push_attempts:'eq.'+row.push_attempts}),{method:'PATCH',body:{push_attempts:row.push_attempts+1,push_next_at:new Date(Date.now()+Math.min(3600000,300000*2**row.push_attempts)).toISOString()}});
  if(!lease?.length)continue;
  if(row.manager_alert&&!row.manager_push_done)await sendPortalPush({audience:'manager',eventId:row.id});
  if(row.mechanic_at&&!row.mechanic_push_done)await sendPortalPush({audience:'mechanic',eventId:row.id});
 }
}
