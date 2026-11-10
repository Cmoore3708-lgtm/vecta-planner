import {randomUUID} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {trackingUrl,uuid,trackable} from './job-progress.js';
import {deliver} from './nmuk-completion-email.js';
import {deliverWhatsapp,whatsappConfig,whatsappNumber,whatsappPermission} from './approval-whatsapp.js';

const table='customer_portal_alerts',ledger='nmuk_service_reminder_sends';
const read=(db,name,params)=>db(name+'?'+new URLSearchParams(params));
const patch=(db,params,body)=>db(table+'?'+new URLSearchParams(params),{method:'PATCH',body:JSON.stringify(body)});
const reg=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const email=v=>String(v||'').trim().toLowerCase();
const validEmail=v=>/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(v);
const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sameCustomer=(row,job)=>job&&row.job_id===job.id&&row.registration===reg(job.registration)&&row.customer_email===email(job.customer_email)&&whatsappNumber(row.customer_phone)===whatsappNumber(job.customer_phone);
export const portalWhatsappConfig=()=>whatsappConfig({...process.env,WHATSAPP_APPROVAL_TEMPLATE:process.env.WHATSAPP_PORTAL_TEMPLATE});
export function portalAlertContent(row,url){
 const first=String(row.customer_name||'').trim().split(/\s+/)[0]||'there';
 const message='Hi '+first+'. You have a new message in your Vecta customer portal that needs your attention.';
 return {first,subject:row.registration+' — new message in your customer portal',text:message+'\n\nOpen your customer portal: '+url,
  html:'<div style="font-family:Arial,sans-serif;line-height:1.6"><p>'+escape(message)+'</p><p><a href="'+escape(url)+'" style="display:inline-block;background:#bd1830;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">HERE</a></p><p>Vecta Motors</p></div>'};
}
async function permission(db,job){try{return await whatsappPermission(db,job);}catch{return {allowed:false,unavailable:true};}}
async function receipt(db,row,job){
 if(!sameCustomer(row,job))return {event_id:row.event_id,channels:{email:'contact_changed',whatsapp:'contact_changed'}};
 const channels={email:row.email_status,whatsapp:row.whatsapp_status},result={event_id:row.event_id,channels};
 if(channels.whatsapp==='manual'&&!isTestProject()&&trackable(job)){
  const consent=await permission(db,job);
  if(!consent.allowed){channels.whatsapp=consent.unavailable?'unavailable':'no_permission';return result;}
  try{const url=trackingUrl(job),content=portalAlertContent(row,url);result.manual_url='https://wa.me/'+whatsappNumber(row.customer_phone)+'?text='+encodeURIComponent(content.text);}catch{channels.whatsapp='closed';}
 }
 return result;
}
async function sendEmail(db,row,job,url){
 const id='portal-email:'+row.event_id;
 const [prior]=await read(db,ledger,{id:'eq.'+id,select:'status,recipient,message_payload',limit:1});
 if(prior?.recipient&&email(prior.recipient)!==row.customer_email)return 'contact_changed';
 if(['sent','pending'].includes(prior?.status))return prior.status;
 if(!validEmail(row.customer_email))return 'missing_contact';
 if(!process.env.RESEND_API_KEY)return 'not_configured';
 const original=portalAlertContent(row,url),content=prior?.message_payload||original;
 try{
  const result=await deliver({id,job,stamp:row.created_at,to:[row.customer_email]},content.text,content.subject,'chris@vectamotors.co.uk',{text:content.text,html:content.html});
  return result.audit_pending?'pending':'sent';
 }catch{
  const [saved]=await read(db,ledger,{id:'eq.'+id,select:'status,error',limit:1});
  let reason='';try{reason=JSON.parse(saved?.error||'{}').error||'';}catch{}
  return saved?.status==='failed'&&/domain.*not verified/i.test(reason)?'sender_unverified':saved?.status||'failed';
 }
}
async function sendWhatsapp(db,row,job,url){
 const id='portal-wa:'+row.event_id,phone=whatsappNumber(row.customer_phone);
 const [prior]=await read(db,ledger,{id:'eq.'+id,select:'status,recipient',limit:1});
 if(prior?.recipient&&prior.recipient!==phone)return 'contact_changed';
 if(['sent','pending'].includes(prior?.status))return prior.status;
 if(!phone)return 'missing_contact';
 const consent=await permission(db,job);if(consent.unavailable)return 'unavailable';if(!consent.allowed)return 'no_permission';
 const config=portalWhatsappConfig();if(!config)return 'manual';
 const content=portalAlertContent(row,url);
 return deliverWhatsapp(db,{row:{...row,id:row.event_id},job,prior,phone,url,first:content.first,text:content.text,id,subject:content.subject,config});
}
export async function sendCustomerPortalAlerts(db,eventId,{jobId,retry=false,background=false,now=Date.now()}={}){
 if(!uuid.test(eventId||''))throw Object.assign(Error('Choose a saved portal message.'),{status:400});
 let [row]=await read(db,table,{event_id:'eq.'+eventId,select:'*',limit:1});
 if(!row||jobId&&row.job_id!==jobId)throw Object.assign(Error('Portal message unavailable.'),{status:404});
 const [job]=await read(db,'jobs',{id:'eq.'+row.job_id,select:'*',limit:1});
 if(!sameCustomer(row,job))return receipt(db,row,job);
 if(!trackable(job))return {event_id:eventId,channels:{email:'closed',whatsapp:'closed'}};
 let url;try{url=trackingUrl({...job,booking_date:row.booking_date});}catch{return {event_id:eventId,channels:{email:'closed',whatsapp:'closed'}};}
 if(background&&(row.attempts>=8||Date.parse(row.next_attempt_at)>now))return receipt(db,row,job);
 const terminal=s=>['sent','pending'].includes(s);
 if(terminal(row.email_status)&&terminal(row.whatsapp_status))return receipt(db,row,job);
 if(!retry&&!background&&row.attempts>0)return receipt(db,row,job);
 const lease=randomUUID(),stamp=new Date(now).toISOString();
 const claimed=await patch(db,{event_id:'eq.'+eventId,attempts:'eq.'+row.attempts,or:'(lease_until.is.null,lease_until.lt.'+stamp+')'},
  {lease_id:lease,lease_until:new Date(now+120000).toISOString(),attempts:row.attempts+1,next_attempt_at:new Date(now+Math.min(3600000,300000*2**Math.min(row.attempts,4))).toISOString(),updated_at:stamp});
 if(!claimed?.length)return receipt(db,row,job);
 const tasks=isTestProject()?[Promise.resolve('test'),Promise.resolve('test')]:[
  terminal(row.email_status)?Promise.resolve(row.email_status):sendEmail(db,row,job,url),
  terminal(row.whatsapp_status)?Promise.resolve(row.whatsapp_status):sendWhatsapp(db,row,job,url)];
 const results=await Promise.allSettled(tasks),states=results.map(r=>r.status==='fulfilled'?r.value:'unavailable');
 const update={email_status:states[0],whatsapp_status:states[1],lease_id:null,lease_until:null,updated_at:new Date().toISOString()};
 try{await patch(db,{event_id:'eq.'+eventId,lease_id:'eq.'+lease},update);}catch{
  // Provider reservations are authoritative. A later retry reconciles them;
  // the portal message remains saved even if recording alert status fails.
 }
 return receipt(db,{...row,...update},job);
}
export async function portalAlertReceipts(db,job,events){
 const ids=events.filter(e=>e.actor==='workshop'&&e.kind==='message').map(e=>e.id);
 if(!ids.length)return [];
 const rows=await read(db,table,{job_id:'eq.'+job.id,event_id:'in.('+ids.join(',')+')',select:'*'});
 return Promise.all(rows.map(row=>receipt(db,row,job)));
}
export async function retryCustomerPortalAlerts(db){
 if(isTestProject())return;
 const now=new Date().toISOString();
 const rows=await read(db,table,{select:'event_id',attempts:'lt.8',next_attempt_at:'lte.'+now,
  or:'(email_status.in.(queued,failed,unavailable),whatsapp_status.in.(queued,failed,unavailable))',order:'next_attempt_at.asc',limit:5});
 await Promise.allSettled(rows.map(async row=>{try{await sendCustomerPortalAlerts(db,row.event_id,{background:true});}catch{console.warn('Customer message alerts will retry on the next run.');}}));
}
