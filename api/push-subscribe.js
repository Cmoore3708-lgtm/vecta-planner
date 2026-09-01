import {pushConfig,supabaseRest} from './_push.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    pushConfig();const subscription=req.body&&req.body.subscription,endpoint=String(subscription&&subscription.endpoint||'');
    if(!endpoint.startsWith('https://')||!subscription.keys||!subscription.keys.p256dh||!subscription.keys.auth)return res.status(400).json({error:'Invalid notification subscription'});
    await supabaseRest('workshop_push_subscriptions?on_conflict=endpoint',{method:'POST',body:{endpoint,subscription,updated_at:new Date().toISOString()}});
    return res.status(200).json({ok:true});
  }catch(error){console.error('Push subscription failed',error);return res.status(500).json({error:'Could not enable booking alerts'})}
}
