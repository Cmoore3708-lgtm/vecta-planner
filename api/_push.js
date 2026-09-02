import crypto from 'node:crypto';
import webpush from 'web-push';

function base64url(value){return Buffer.from(value).toString('base64url')}
function privateKeyBytes(secret){
  const order=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const digest=crypto.createHash('sha256').update(`vecta-workshop-booking-badges:v1:${secret}`).digest('hex');
  const scalar=(BigInt(`0x${digest}`)%(order-1n))+1n;
  return Buffer.from(scalar.toString(16).padStart(64,'0'),'hex');
}
export function pushConfig(){
  const secret=process.env.VAPID_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new Error('Push alerts are not configured');
  const privateBytes=privateKeyBytes(secret),ecdh=crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateBytes);
  const publicKey=base64url(ecdh.getPublicKey(undefined,'uncompressed')),privateKey=base64url(privateBytes);
  webpush.setVapidDetails('https://vectamotors.co.uk',publicKey,privateKey);
  return {publicKey};
}
export async function supabaseRest(path,{method='GET',body}={}){
  const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Supabase service access is not configured');
  const response=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
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
    const [subscriptions,pending]=await Promise.all([supabaseRest('workshop_push_subscriptions?select=endpoint,subscription'),supabaseRest('website_booking_requests?select=id&status=eq.awaiting_review')]);
    const count=Array.isArray(pending)?pending.length:0,payload=JSON.stringify({title:'New VECTA website booking',body:'A new customer booking is waiting for review.',count,url:'/?view=websiteRequests'});
    await Promise.allSettled((subscriptions||[]).map(async row=>{
      try{await webpush.sendNotification(row.subscription,payload)}catch(error){
        if(error&&[404,410].includes(error.statusCode)){await supabaseRest(`workshop_push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`,{method:'DELETE'}).catch(()=>{});return}
        throw error;
      }
    }));
  }catch(error){console.warn('Website booking badge delivery skipped',error&&error.message||error)}
}
