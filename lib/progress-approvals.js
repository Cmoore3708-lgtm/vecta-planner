import {approvedJobChanges,mechanicApprovalSummary} from './approved-work.js';
import {sendPortalPush} from '../api/_push.js';
import {randomUUID} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {claimMatchesJob, progressSecret, trackable, uuid, verifyProgressToken} from './job-progress.js';
import {photoBinding} from './job-workshop-photos.js';
import {deliver} from './nmuk-completion-email.js';

import {deliverWhatsapp, waLedgerId, whatsappAvailability, whatsappConfig, whatsappNumber, whatsappPermission} from './approval-whatsapp.js';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const fields = 'id,job_id,registration,customer_email,customer_phone,customer_name,created_at,status,expires_at,decided_at,progress_booking_date,progress_message,progress_photo_ids,progress_review_state,progress_estimate_pence,progress_from_mechanic';
const approvals = params => 'additional_work_approvals?' + new URLSearchParams({select:fields,progress_message:'not.is.null', ...params});
const email = value => String(value || '').trim().toLowerCase();
const reg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const closedJob = job => job.archived || ['work_complete','ready_to_invoice','completed','invoiced','invoice_created'].includes(job.status);
const matches = (row,job) => row && row.job_id === job.id && row.progress_booking_date === job.booking_date &&
  reg(row.registration) === reg(job.registration) && email(row.customer_email) === email(job.customer_email) &&
  (row.customer_phone == null || String(row.customer_phone).replace(/\D/g,'') === String(job.customer_phone||'').replace(/\D/g,''));
// A private finding can be priced after a missing contact has been filled in.
// An existing recipient can never be replaced through this path.
function reviewMatches(row,job) {
  if(!row||row.progress_review_state!=='draft')return matches(row,job);
  return matches({...row,customer_email:email(row.customer_email)||job.customer_email,
    customer_phone:String(row.customer_phone||'').trim()||job.customer_phone},job);
}

async function bindDraftForPublication(db,row,job){
  if(row.progress_review_state!=='draft')return;
  if(!matches(row,job)){
    const original=value=>value==null?'is.null':'eq.'+value;
    const saved=await db('additional_work_approvals?'+new URLSearchParams({id:'eq.'+row.id,job_id:'eq.'+job.id,
      progress_review_state:'eq.draft',customer_email:original(row.customer_email),customer_phone:original(row.customer_phone)}),
      {method:'PATCH',body:JSON.stringify({customer_email:job.customer_email||'',customer_phone:job.customer_phone||'',customer_name:job.customer_name||''})});
    if(!saved.length)throw fail('The customer contact changed. Refresh the finding.',409);
  }
  if(row.progress_photo_ids.length){
    await db('job_workshop_photos?'+new URLSearchParams({job_id:'eq.'+job.id,review_id:'eq.'+row.id,
      review_uploaded:'eq.true',ready:'eq.false',deleted_at:'is.null'}),
      {method:'PATCH',body:JSON.stringify({binding:photoBinding(job)})});
  }
}
const validId = id => { if (typeof id !== 'string' || !uuid.test(id)) throw fail('Choose a valid approval request.'); return id; };
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function summary(row,job) {
  const expired = Date.parse(row.expires_at) <= Date.now() || closedJob(job);
  return {id:row.id,message:row.progress_message,photo_ids:row.progress_photo_ids,
    status:row.progress_review_state==='draft'?'awaiting_price':(row.status === 'pending' && expired ? 'closed' : row.status),estimated_pence:row.progress_estimate_pence??null,decided_at:row.decided_at};
}

async function find(db,job,id) {
  return (await db(approvals({select:fields+',token',job_id:'eq.' + job.id,id:'eq.' + validId(id),limit:'1'})))?.[0];
}

export async function reviewQueue(db,role='manager') {
  const select=fields+',progress_from_mechanic,jobs!inner(id,booking_date,registration,customer_email,customer_phone,status,card_type,archived,customer_note,job_type)';
  const [rows,decisions]=await Promise.all([
    role==='mechanic'?Promise.resolve([]):db(approvals({progress_review_state:'eq.draft',select,order:'created_at.asc',limit:'250'})),
    db(approvals({progress_review_state:'eq.sent',status:'in.(approved,declined)',decided_at:'gte.'+new Date(Date.now()-7*86400000).toISOString(),select,order:'decided_at.desc,id.desc',limit:'250'}))
  ]);
  const queue={findings:rows.filter(row=>trackable(row.jobs)&&!closedJob(row.jobs)&&reviewMatches(row,row.jobs)).map(row=>({
    ...summary(row,row.jobs),job_id:row.job_id,registration:row.registration,
    mechanic_finding:row.progress_from_mechanic===true,mechanic_photo:row.progress_from_mechanic===true && row.progress_photo_ids.length>0
  })),decisions:decisions.filter(row=>row.progress_review_state==='sent'&&['approved','declined'].includes(row.status)&&row.decided_at&&trackable(row.jobs)&&matches(row,row.jobs)).map(row=>({
    ...summary(row,row.jobs),job_id:row.job_id,registration:row.registration
  }))};
  if(role==='mechanic'){
    const forwarded=await db('customer_portal_events?'+new URLSearchParams({select:'details',kind:'eq.approval_response',mechanic_at:'not.is.null',limit:'1000'}));
    const ids=new Set(forwarded.map(event=>event.details?.approval_id));
    queue.decisions=queue.decisions.filter(item=>ids.has(item.id)).map(mechanicApprovalSummary);
  }
  return queue;
}

export async function workshopApprovalList(db,job,role='manager') {
  const rows = (await db(approvals({job_id:'eq.' + job.id,order:'created_at.desc',limit:'50'}))).filter(row => reviewMatches(row,job));
  if(role==='mechanic'){
    const forwarded=await db('customer_portal_events?'+new URLSearchParams({select:'details',job_id:'eq.'+job.id,kind:'eq.approval_response',mechanic_at:'not.is.null',limit:'1000'}));
    const ids=new Set(forwarded.map(event=>event.details?.approval_id));
    return {approvals:rows.filter(row=>row.progress_from_mechanic===true||ids.has(row.id)).map(row=>{
      const item=summary(row,job);
      if(['approved','declined'].includes(item.status)&&!ids.has(row.id)){item.status='pending';item.decided_at=null;}
      return mechanicApprovalSummary(item);
    })};
  }
  const permission=await readPermission(db,job);
  const contact={...permission,manual_sender:!isTestProject()&&!whatsappConfig(),contact_binding:photoBinding(job)};
  if (!rows.length) return {approvals:[],whatsapp:contact};
  const ids=rows.flatMap(row=>['approval:'+row.id,waLedgerId(row.id)]);
  const sends=await db('nmuk_service_reminder_sends?'+new URLSearchParams({select:'id,status',id:'in.('+ids.join(',')+')'}));
  const states=new Map(sends.map(send=>[send.id,send.status]));
  return {whatsapp:contact,approvals:rows.map(row=>({...summary(row,job),channels:{
    email:states.get('approval:'+row.id)||emailAvailability(row),
    whatsapp:states.get(waLedgerId(row.id))||waAvailability(row,permission)
  }}))};
}

export async function stageFinding(db,job,body,role='manager') {
  if(closedJob(job))throw fail('This job has already finished.',409);
  const id = validId(body.approval_id);
  const replay = await find(db,job,id);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const ids = body.photo_ids;
  if (!message || message.length > 1200) throw fail('Enter the work you would like the customer to approve (up to 1,200 characters).');
  if (!Array.isArray(ids) || ids.length > 12 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !uuid.test(id))) throw fail('Choose valid workshop photos.');
  if (ids.length && !replay) {
    const photos = await db('job_workshop_photos?' + new URLSearchParams({select:'id',job_id:'eq.' + job.id,
      id:'in.(' + ids.join(',') + ')',binding:'eq.' + photoBinding(job),review_id:'eq.'+id,review_uploaded:'eq.true',ready:'eq.false',deleted_at:'is.null'}));
    if (photos.length !== ids.length) throw fail('Finish uploading the photos before requesting approval.',409);
  }
  if (!replay) {
    await db('additional_work_approvals?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({
      id,job_id:job.id,customer_phone:String(job.customer_phone||''),token:'progress:' + randomUUID(),registration:job.registration,vehicle:job.vehicle,
      customer_email:job.customer_email,customer_name:job.customer_name,items:[],total:0,status:'pending',
      progress_booking_date:job.booking_date,progress_message:message,progress_photo_ids:ids,progress_review_state:'draft',progress_from_mechanic:role==='mechanic',
      expires_at:null
    })});
  }
  const row = replay || await find(db,job,id);
  if (!reviewMatches(row,job) || row.progress_message !== message || JSON.stringify(row.progress_photo_ids) !== JSON.stringify(ids))
    throw fail('This request changed. Reopen the job before sending.',409);
  return {approval_id:row.id,stage:row.progress_review_state};
}

export function estimatePence(value){
  if(typeof value!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(value.trim()))throw fail('Enter the estimated total in pounds, including VAT.');
  const [pounds,pence='']=value.trim().split('.');
  return Number(pounds)*100+Number(pence.padEnd(2,'0'));
}

const validEmail=value=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email(value));
function emailAvailability(row) {
  if(!validEmail(row.customer_email))return 'missing_contact';
  if(isTestProject())return 'test';
  return process.env.RESEND_API_KEY?'unsent':'not_configured';
}
async function readPermission(db,job) {
  try {return await whatsappPermission(db,job);}
  catch {return {phone:whatsappNumber(job.customer_phone),allowed:false,unavailable:true};}
}
function waAvailability(row,permission) {
  if(permission.unavailable)return 'unavailable';
  const phone=whatsappNumber(row.customer_phone);
  if(!phone||phone!==permission.phone)return 'missing_contact';
  if(isTestProject() && permission.allowed)return 'test';
  const state=whatsappAvailability(phone,permission.allowed);
  return state==='not_configured'?'manual':state;
}

async function sendEmail(db,row,job,first,url) {
  const id='approval:'+row.id;
  const query='nmuk_service_reminder_sends?'+new URLSearchParams({select:'status',id:'eq.'+id,limit:'1'});
  const previous=(await db(query))[0]?.status;
  if(previous==='sent'||previous==='pending')return previous;
  const available=emailAvailability(row);
  if(available!=='unsent')return available;
  const start='Hi '+first+'. There is a message relating to your car waiting for your approval, ';
  const text=start+'click here to see it: '+url;
  const html='<p>'+escape(start)+'<a href="'+escape(url)+'">click here to see it</a>.</p>';
  try {
    const result=await deliver({id,job,stamp:row.created_at,to:[email(row.customer_email)]},text,
      row.registration+' — your approval is needed','chris@vectamotors.co.uk',{text,html});
    return result.audit_pending?'pending':'sent';
  } catch {
    return (await db(query))[0]?.status||'failed';
  }
}

export async function requestApproval(db,job,body,origin) {
  if (closedJob(job)) throw fail('This job has already finished.',409);
  if (!validEmail(job.customer_email) && !whatsappNumber(job.customer_phone)) throw fail('Save a customer email or WhatsApp number on this job, then reopen it.');
  let row=await find(db,job,body.approval_id);
  if(!reviewMatches(row,job))throw fail('This finding is no longer available.',404);
  const permission=await readPermission(db,job);
  if(!validEmail(job.customer_email) && !permission.allowed)throw fail('Save an email address or confirm the customer agreed to WhatsApp before sending.');
  if(body.action==='approval-request'){
    const pence=estimatePence(body.estimate);
    // Older open tabs send only a price; keep their existing wording. New tabs
    // publish the reviewed text and price in the same locked transaction.
    const message=body.message===undefined?row.progress_message:(typeof body.message==='string'?body.message.trim():'');
    if(!message||message.length>1200)throw fail('Enter a customer description (up to 1,200 characters).');
    await bindDraftForPublication(db,row,job);
    const result=await db('rpc/vecta_publish_progress_estimate_review',{method:'POST',body:JSON.stringify({p_job_id:job.id,p_id:row.id,p_pence:pence,p_message:message})});
    if(result.code!==200)throw fail(result.error,result.code);
    row=await find(db,job,body.approval_id);
  }
  if(!matches(row,job)||row.progress_review_state!=='sent')throw fail('Enter an estimate and send the finding from Workshop Pro.',409);
  if (summary(row,job).status!=='pending')throw fail('This request has already closed.',409);
  // One short fragment works in the email anchor and the approved WhatsApp
  // template button. It identifies only this request, and is never a page query.
  const url=origin+'/track#approval.'+row.id+'.'+row.token.slice('progress:'.length);
  const first=String(row.customer_name||'').trim().split(/\s+/)[0]||'there';
  async function sendWhatsapp() {
    const [previous]=await db('nmuk_service_reminder_sends?'+new URLSearchParams({select:'status,recipient',id:'eq.'+waLedgerId(row.id),limit:'1'}));
    if(previous && ['sent','pending'].includes(previous.status)) return previous.status;
    const permission=await readPermission(db,job);
    const status=waAvailability(row,permission);
    if(status!=='unsent')return status;
    return deliverWhatsapp(db,{row,job,prior:previous,phone:permission.phone,url,first,
      text:'Hi '+first+'. There is a message relating to your car waiting for your approval, click here to see it: '+url});
  }
  const results=await Promise.allSettled([sendEmail(db,row,job,first,url),sendWhatsapp()]);
  const [mail,whatsapp]=results.map(r=>r.status==='fulfilled'?r.value:'unavailable');
  const response={approval_id:row.id,channels:{email:mail,whatsapp},...(isTestProject()?{url}: {})};
  if(whatsapp==='manual'&&!isTestProject()){
    const text='Hi '+first+'. There is a message relating to your car waiting for your approval, click here to see it: '+url;
    response.manual_url='https://wa.me/'+whatsappNumber(row.customer_phone)+'?text='+encodeURIComponent(text);
  }
  return response;
}

// A capability is verified against its original published row and customer.
// The private portal can then reach other published requests for that same job.
// A recipient/date change still invalidates it. Cancellation receipts are read-only.
export async function approvalAccess(db,token,now=Date.now(),{allowCancelled=false}={}) {
  const parts=typeof token==='string'?token.split('.'):[];
  if(parts.length!==3||parts[0]!=='approval'||!uuid.test(parts[1])||!uuid.test(parts[2]))throw fail('Open the private approval link in your message.',404);
  const [row]=await db(approvals({id:'eq.'+parts[1],select:fields+',token',limit:'1'}));
  if(!row||row.progress_review_state!=='sent'||row.token!=='progress:'+parts[2]||!(Date.parse(row.expires_at)>now))throw fail('This approval link is no longer available.',404);
  const [job]=await db('jobs?'+new URLSearchParams({select:'*',id:'eq.'+row.job_id,limit:'1'}));
  const readable=allowCancelled&&['cancelled','canceled'].includes(job?.status)?{...job,status:'booked'}:job;
  if(!trackable(readable)||!matches(row,job))throw fail('This approval link is no longer available.',404);
  return {job,row};
}

export async function customerApproval(db,body) {
  let job,row;
  if(typeof body.token==='string' && body.token.startsWith('approval.')) {
    ({job,row}=await approvalAccess(db,body.token));
    if(row.id!==body.approval_id){row=await find(db,job,body.approval_id);if(!matches(row,job)||row.progress_review_state!=='sent')throw fail('This approval link is no longer available.',404);}
  } else {
    try{({job}=await (await import('./customer-portal.js')).portalAccess(db,body.token));}catch{throw fail('Open the private approval link in your message.',404);}
    if(!job)throw fail('This booking has not yet been assigned to a workshop job.',409);
    if(!trackable(job))throw fail('This booking is closed.',409);
    row=await find(db,job,body.approval_id);
    if(!matches(row,job)||row.progress_review_state!=='sent')throw fail('This approval link is no longer available.',404);
  }
  if (['approval-decide','approval-message'].includes(body.action)) {
    const messageOnly=body.action==='approval-message';
    if (!messageOnly&&!['approved','declined'].includes(body.decision)) throw fail('Choose Approve or Decline.');
    const changes=body.decision==='approved'&&row.status==='pending'?approvedJobChanges(job,row):null;
    const reply=typeof body.reply==='string'?body.reply.trim():'';
    const withReply=body.reply_id!==undefined||body.reply!==undefined||messageOnly;
    if(withReply&&((body.reply!==undefined&&typeof body.reply!=='string')||!uuid.test(body.reply_id||'')||reply.length>3000||(messageOnly&&!reply)))throw fail('Enter a message of up to 3,000 characters, or retry your decision.');
    const result = await db(withReply?'rpc/vecta_respond_progress_quote':'rpc/vecta_decide_progress_work',{method:'POST',body:JSON.stringify({
      p_job_id:job.id,p_approval_id:row.id,p_decision:messageOnly?null:body.decision,
      ...(withReply?{p_reply_id:body.reply_id,p_reply:reply}:{}),
      p_expected:changes?{updated_at:job.updated_at??null,work_required:job.work_required??null,customer_note:job.customer_note??null,amount_quoted:job.amount_quoted??null,vat_mode:job.vat_mode??null}:null,
      p_changes:changes
    })});
    if (result.code !== 200) throw fail(result.error,result.code);
    if((messageOnly||row.status==='pending')&&!result.replayed)try{
      const [event]=await db('customer_portal_events?'+new URLSearchParams({...(result.event_id?{id:'eq.'+result.event_id}:{dedupe_key:'eq.approval:'+row.id+':'+result.status}),select:'id,mechanic_at',limit:1}));
      if(event){await sendPortalPush({audience:'manager',eventId:event.id});if(event.mechanic_at)await sendPortalPush({audience:'mechanic',eventId:event.id});}
    }
    catch{console.warn('Customer decision saved; its notification will retry.');}
    if(!messageOnly){row.status = result.status;row.decided_at = result.decided_at;}
  }
  return {approval:summary(row,job)};
}
