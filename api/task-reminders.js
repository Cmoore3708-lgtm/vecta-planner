import {sendPushSubscription,supabaseRest} from './_push.js';

export async function dispatchTaskReminders(db=supabaseRest,send=sendPushSubscription){
  const rows=await db('rpc/claim_task_reminders',{method:'POST',body:{}});
  const results=await Promise.allSettled(rows.map(async row=>{
    const tag='vecta-task-'+row.task_id+'-'+Date.parse(row.remind_at);
    try{
      await send(row.subscription,{
        title:'VECTA task reminder',body:row.task_text,tag,
        url:'/?task_reminder='+encodeURIComponent(row.task_id),taskReminder:true
      },{urgency:'high',TTL:3600});
    }catch(error){
      if(![404,410].includes(error.statusCode))throw error;
      await db('workshop_push_subscriptions?endpoint=eq.'+encodeURIComponent(row.endpoint),{method:'DELETE'});
      return;
    }
    const match=new URLSearchParams({task_id:'eq.'+row.task_id,remind_at:'eq.'+row.remind_at,endpoint:'eq.'+row.endpoint});
    await db('task_reminder_deliveries?'+match,{method:'PATCH',body:{sent:true}});
  }));
  const failed=results.filter(result=>result.status==='rejected').length;
  return {claimed:rows.length,failed};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).end();
  if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).end();
  try{
    const result=await dispatchTaskReminders();
    return res.status(result.failed?503:200).json(result);
  }catch{ return res.status(503).json({error:'Task reminders will retry.'}); }
}
