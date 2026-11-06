import {photoBinding} from './job-workshop-photos.js';

// Only accept one unambiguous UK mobile or an explicitly international number.
export function whatsappNumber(value) {
  let number=String(value||'').trim().replace(/[\s().-]/g,'');
  if (/^07\d{9}$/.test(number)) number='+44'+number.slice(1);
  else if (/^447\d{9}$/.test(number)) number='+'+number;
  else if (number.startsWith('00')) number='+'+number.slice(2);
  if (!/^\+[1-9]\d{7,14}$/.test(number)) return '';
  if (number.startsWith('+44') && !/^\+447\d{9}$/.test(number)) return '';
  return number.slice(1);
}

export function whatsappConfig(env=process.env) {
  const version=env.WHATSAPP_GRAPH_VERSION||'v23.0';
  const name=env.WHATSAPP_APPROVAL_TEMPLATE;
  const phoneId=env.WHATSAPP_PHONE_NUMBER_ID;
  if (!env.WHATSAPP_ACCESS_TOKEN || !/^\d+$/.test(phoneId||'') || !/^[a-z0-9_]+$/.test(name||'') || !/^v\d+\.\d+$/.test(version)) return null;
  return {url:'https://graph.facebook.com/'+version+'/'+phoneId+'/messages',
    name,language:env.WHATSAPP_TEMPLATE_LANGUAGE||'en_GB',token:env.WHATSAPP_ACCESS_TOKEN};
}

const prefKey=job=>'approval-whatsapp:'+job.id;
export async function whatsappPermission(db,job) {
  const phone=whatsappNumber(job.customer_phone);
  if (!phone) return {phone,allowed:false};
  const [setting]=await db('workshop_settings?'+new URLSearchParams({select:'value',id:'eq.'+prefKey(job),limit:'1'}));
  if (setting?.value?.phone===phone && setting.value.binding===photoBinding(job)) return {phone,allowed:setting.value.allowed===true};
  const rows=await db('website_booking_requests?'+new URLSearchParams({select:'registration,email,phone,contact_preference',job_id:'eq.'+job.id,order:'created_at.desc',limit:'1'}));
  const booking=rows[0];
  const cleanReg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const cleanEmail=value=>String(value||'').trim().toLowerCase();
  return {phone,allowed:!!booking && booking.contact_preference==='WhatsApp' &&
    whatsappNumber(booking.phone)===phone && cleanReg(booking.registration)===cleanReg(job.registration) &&
    cleanEmail(booking.email)===cleanEmail(job.customer_email)};
}

export async function saveWhatsappPermission(db,job,body) {
  const phone=whatsappNumber(job.customer_phone);
  if (!phone || body.phone!==phone || typeof body.allowed!=='boolean' || body.contact_binding!==photoBinding(job))
    throw Object.assign(Error('The customer contact changed. Reopen this job before saving WhatsApp permission.'),{status:409});
  const value={phone,binding:photoBinding(job),allowed:body.allowed};
  await db('workshop_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify({id:prefKey(job),value,updated_at:new Date().toISOString()})});
  return {phone,allowed:body.allowed};
}

export function whatsappAvailability(phone,allowed,config=whatsappConfig()) {
  if (!phone) return 'missing_contact';
  if (!allowed) return 'no_permission';
  return config?'unsent':'not_configured';
}
export const waLedgerId=id=>'approval-wa:'+id;

// Meta accepts template messages without a caller idempotency key. Hold an
// uncertain reservation indefinitely; a timeout is not proof of rejection.
export async function deliverWhatsapp(db,{row,job,prior,phone,url,first,text}) {
  const id=waLedgerId(row.id);
  const filters={id:'eq.'+id};
  const ledger=params=>'nmuk_service_reminder_sends?'+new URLSearchParams(params);
  if (prior?.recipient && prior.recipient!==phone) return 'contact_changed';
  if (prior?.status==='sent' || prior?.status==='pending') return prior.status;
  const config=whatsappConfig();
  if (!config) return 'not_configured';
  const details={from:'Vecta Motors WhatsApp',to:[phone],registration:row.registration,
    subject:'Customer approval request',text};
  const claim=prior
    ? await db(ledger({...filters,status:'eq.failed'}),{method:'PATCH',body:JSON.stringify({status:'pending'})})
    : await db('nmuk_service_reminder_sends?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({id,job_id:job.id,booking_date:row.created_at.slice(0,10),recipient:phone,status:'pending',message_payload:details})});
  if (!claim.length) return 'pending';
  const components=[
    {type:'body',parameters:[{type:'text',text:first}]},
    {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:new URL(url).hash.slice(1)}]}
  ];
  let response,result;
  try {
    response=await fetch(config.url,{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'template',
        template:{name:config.name,language:{code:config.language},components}}),signal:AbortSignal.timeout(12000)});
    result=await response.json();
  } catch {return 'pending';}
  const receipt=result?.messages?.[0]?.id;
  const accepted=response.ok && typeof receipt==='string' && receipt.startsWith('wamid.');
  const rejected=!response.ok && response.status>=400 && response.status<500 && ![408,409].includes(response.status) && !!result?.error;
  if (!accepted && !rejected) return 'pending';
  const status=accepted?'sent':'failed';
  const update=accepted?{status,provider_id:receipt,sent_at:new Date().toISOString()}:{status,error:'WhatsApp rejected template ('+String(result.error.code||response.status)+')'};
  try {
    const saved=await db(ledger({...filters,status:'eq.pending'}),{method:'PATCH',body:JSON.stringify(update)});
    return saved.length?status:'pending';
  } catch {return 'pending';}
}
