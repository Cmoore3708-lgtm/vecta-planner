import {sendPushSubscription,supabaseRest} from './_push.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const endpoint=String(req.body&&req.body.endpoint||'');
    if(!endpoint.startsWith('https://'))return res.status(400).json({error:'Missing iPhone push subscription'});
    const rows=await supabaseRest(`workshop_push_subscriptions?select=subscription&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`);
    if(!Array.isArray(rows)||!rows.length)return res.status(404).json({error:'This iPhone subscription was not saved in Supabase'});
    await sendPushSubscription(rows[0].subscription,{
      title:'VECTA alerts are working',
      body:'Background website booking notifications are now connected.',
      count:0,
      tag:'vecta-push-test',
      url:'/?view=websiteRequests'
    });
    return res.status(200).json({ok:true});
  }catch(error){
    console.error('Push test failed',error);
    const detail=error&&error.message?String(error.message):'Unknown push error';
    return res.status(500).json({error:`Test notification failed: ${detail}`});
  }
}
