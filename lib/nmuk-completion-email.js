import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {validManagerSession,managerGate} from '../middleware.js';
import {databaseEnvironment} from '../api/_database-environment.js';

export const completionSender='chris@nissan-fleet.co.uk';
export const completionSignatureText='Kind Regards,\n\nChris.\n07721722622\n\nVECTA\nNissan Fleet Support\nContractors compound\nVectaMotors.co.uk';
export const completionSignatureHtml='<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#333"><p>Kind Regards,</p><p>Chris.<br>07721722622</p><div style="font-family:Arial,sans-serif;font-size:32px;font-weight:700;color:#c8102e;margin:18px 0 8px">VECTA</div><div style="font-family:monospace;font-size:12px">Nissan Fleet Support<br>Contractors compound<br><a href="https://www.vectamotors.co.uk/" style="color:#315aa6;font-weight:bold">VectaMotors.co.uk</a></div></div>';
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const emails=value=>[...new Set(String(value||'').split(/[;,]/).map(s=>s.trim().toLowerCase()).filter(s=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))];
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const sign=payload=>createHmac('sha256',process.env.VECTA_MAIN_PASSWORD).update(payload).digest('base64url');
function issueToken(context){const p=Buffer.from(JSON.stringify({...context,expires:Date.now()+900000})).toString('base64url');return p+'.'+sign(p);}
function readToken(value){
  const [p,s,...rest]=String(value||'').split('.');if(!p||!s||rest.length)throw fail('Reopen the completion email before sending.',409);
  const a=Buffer.from(s),b=Buffer.from(sign(p));if(a.length!==b.length||!timingSafeEqual(a,b))throw fail('Reopen the completion email before sending.',409);
  let token;try{token=JSON.parse(Buffer.from(p,'base64url').toString());}catch{throw fail('Invalid completion draft.',409);}
  if(!token.expires||Date.now()>token.expires)throw fail('This draft expired. Reopen the completion email.',409);return token;
}
async function db(path,options={}){
  const {url,key}=databaseEnvironment({requireService:true});
  const response=await fetch(url+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'content-type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>null);if(!response.ok)throw fail('Email records could not be checked. Please retry.',response.status===409?409:503);return data;
}
async function contextFor(jobId){
  if(!/^[0-9a-f-]{36}$/i.test(String(jobId||'')))throw fail('Choose a saved completed job.');
  const [jobs,settings]=await Promise.all([db('jobs?id=eq.'+encodeURIComponent(jobId)+'&select=*'),db('workshop_settings?id=in.(fleet_state_v77,jobcustomer:'+encodeURIComponent(jobId)+')&select=id,value')]);
  const job=jobs?.[0];if(!job)throw fail('Job not found.',404);
  const memory=settings?.find(x=>x.id==='jobcustomer:'+jobId)?.value||{},fleet=settings?.find(x=>x.id==='fleet_state_v77')?.value||{};
  const vehicle=(fleet.vehicles||[]).find(v=>reg(v.registration)===reg(job.registration));
  const account=String(memory.customer_account||job.customer_account||job.customer_name||'').toUpperCase(),subtype=String(memory.nmuk_vehicle_type||job.nmuk_vehicle_type||vehicle?.nmukType||(vehicle?.fleetGroup==='Nissan Internal'?'Internal':vehicle?.fleetGroup==='Nissan Pool Cars'?'Pool':'')).toUpperCase();
  if(account!=='NMUK'||!['INTERNAL','POOL'].includes(subtype)||job.no_vehicle||!reg(job.registration)||/vehicle tax|pool car tax/i.test(String(job.job_type||'')+' '+subtype))throw fail('Collection emails are available for NMUK Internal and Pool vehicles only.');
  if(job.status!=='completed'||job.archived!==true||!job.completed_at)throw fail('The workshop server has not confirmed completion of this job.',409);
  const to=emails(vehicle?.contactEmail);if(!to.length)throw fail('Add the vehicle owner’s email in Fleet Manager before sending.');
  const model=String(vehicle?.model||job.vehicle||'vehicle').trim()||'vehicle',first=(to[0].split('@')[0].replace(/[^A-Za-z._-]/g,' ').split(/[._\-\s]+/).filter(Boolean)[0]||'there');
  const body='Hi '+first.charAt(0).toUpperCase()+first.slice(1).toLowerCase()+'.\n\nYour '+model+' is complete and ready to pick up from our Workshop.';
  const subject=String(job.registration).trim().toUpperCase()+' — ready to pick up';
  const stamp=new Date(job.completed_at).toISOString(),id='completion:'+hash(jobId+':'+stamp);
  return {job,id,stamp,to,body,subject,tokenContext:{job_id:jobId,stamp,to}};
}
async function senderStatus(){
  if(!process.env.RESEND_API_KEY)return {ready:false,error:'The workshop email service is not configured.'};
  try{
    const r=await fetch('https://api.resend.com/domains',{headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY},signal:AbortSignal.timeout(8000)});
    // Sending-only keys cannot list domains; the sending API performs its own verification.
    if(r.status===401)return {ready:false,error:'The workshop email service credentials were rejected.'};
    if(r.status===403)return {ready:true,verification:'checked_on_send'};
    if(!r.ok)return {ready:false,error:'The email service could not verify the sender. Please retry.'};
    const data=await r.json(),domain=(data.data||[]).find(d=>d.name?.toLowerCase()==='nissan-fleet.co.uk');
    if(domain?.status!=='verified'||domain.capabilities?.sending==='disabled')return {ready:false,error:'nissan-fleet.co.uk needs sender-domain verification in the email service before this message can be sent.'};
    return {ready:true,verification:'verified'};
  }catch{return {ready:false,error:'The email service could not verify the sender. Please retry.'};}
}
function messageContent(body){return {text:body+'\n\n'+completionSignatureText,html:'<div style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.5">'+escapeHtml(body).replace(/\n/g,'<br>')+'</div><br>'+completionSignatureHtml};}
async function auditRecord(id){return (await db('nmuk_service_reminder_sends?id=eq.'+encodeURIComponent(id)+'&select=*'))?.[0]||null;}
function auditPayload(row){try{return JSON.parse(row.error||'').payload;}catch{return null;}}
async function deliver(context,body,subject){
  const payload={from:completionSender,reply_to:completionSender,to:context.to,subject,...messageContent(body)},digest=hash(JSON.stringify(payload));
  let record=await auditRecord(context.id),owns=false;
  if(record?.status==='sent')return {accepted:true,already_sent:true,provider_id:record.provider_id};
  if(record&&Date.now()-Date.parse(record.created_at)>=23*3600000)throw fail('A previous send attempt needs checking before retrying. Contact the workshop administrator to avoid a duplicate email.',409);
  if(record&&record.status==='pending')throw fail('This email is being sent or its result is not yet confirmed. Reopen the draft to check its status; do not send another copy.',409);
  if(record&&record.status==='failed'){
    const frozen=auditPayload(record);if(!frozen||hash(JSON.stringify(frozen))!==digest)throw fail('Use the original email wording when retrying this send. Reopen the completion email.',409);
    const rows=await db('nmuk_service_reminder_sends?id=eq.'+encodeURIComponent(context.id)+'&status=eq.failed',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'pending'})});owns=rows?.length===1;
  }else{
    try{await db('nmuk_service_reminder_sends',{method:'POST',body:JSON.stringify({id:context.id,job_id:context.job.id,booking_date:context.stamp.slice(0,10),recipient:context.to.join(';'),status:'pending',error:JSON.stringify({payload}),message_payload:{...payload,registration:context.job.registration}})});owns=true;}
    catch(e){if(e.status!==409)throw e;}
  }
  if(!owns)throw fail('Another send is already in progress. Reopen the draft to check its status.',409);
  let result;
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':context.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    result=await r.json().catch(()=>null);
    if(!r.ok){
      // 5xx, 408 and unknown responses can conceal acceptance: keep the reservation.
      if(r.status>=500||r.status===408||r.status===409)throw fail('The email service did not confirm the result. Do not send another copy until the status is checked.',409);
      await db('nmuk_service_reminder_sends?id=eq.'+encodeURIComponent(context.id),{method:'PATCH',body:JSON.stringify({status:'failed',error:JSON.stringify({payload,error:String(result?.message||'Email service rejected this message').slice(0,500)})})});
      throw fail('Email not sent: '+String(result?.message||'The email service rejected the message.').slice(0,300),502);
    }
    if(!result?.id)throw fail('The email service did not confirm the result. Check the send status before retrying.',409);
  }catch(e){if(e.status)throw e;throw fail('Sending could not be confirmed. Do not send another copy until its status is checked.',409);}
  try{await db('nmuk_service_reminder_sends?id=eq.'+encodeURIComponent(context.id),{method:'PATCH',body:JSON.stringify({status:'sent',provider_id:result.id,sent_at:new Date().toISOString(),error:JSON.stringify({payload})})});}
  catch{return {accepted:true,provider_id:result.id,audit_pending:true};}
  return {accepted:true,provider_id:result.id};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const host=String(req.headers.host||'');if(!host||req.headers.origin!=='https://'+host||!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(403).json({error:'Open the completion email from Workshop Pro.'});
  const credentials={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
  const request=new Request('https://'+host+'/completion-email',{headers:req.headers});
  if(!credentials.user||!credentials.password||(!await validManagerSession(request,credentials)&&managerGate(request,credentials)))return res.status(401).json({error:'Manager sign-in required.'});
  if(!['draft','send'].includes(req.body?.action))return res.status(400).json({error:'Choose draft or send.'});
  try{
    const context=await contextFor(req.body.job_id);
    if(req.body.action==='draft'){
      const [record,service]=await Promise.all([auditRecord(context.id),senderStatus()]);
      const frozen=auditPayload(record),body=frozen?.text?.split('\n\n'+completionSignatureText)[0]||context.body;
      return res.status(200).json({from:completionSender,to:context.to,subject:frozen?.subject||context.subject,body,signature_html:completionSignatureHtml,signature_text:completionSignatureText,token:issueToken(context.tokenContext),status:record?.status||'draft',provider_id:record?.provider_id,ready:service.ready&&(!record||record.status==='failed'),setup_error:service.error||'',locked:!!record});
    }
    const token=readToken(req.body.token);if(JSON.stringify({job_id:token.job_id,stamp:token.stamp,to:token.to})!==JSON.stringify(context.tokenContext))throw fail('The vehicle contact or job completion changed. Reopen this draft before sending.',409);
    const body=String(req.body.body||'').trim(),subject=String(req.body.subject||'').trim();if(!body||body.length>4000||!subject||subject.length>160||/[\r\n]/.test(subject))throw fail('Enter a subject and message within the allowed length.');
    if(!process.env.RESEND_API_KEY)throw fail('The workshop email service is not configured.',503);
    return res.status(200).json(await deliver(context,body,subject));
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Email records could not be checked. Please retry.'});}
}
