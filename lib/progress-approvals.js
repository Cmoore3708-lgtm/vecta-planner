import {randomUUID} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {claimMatchesJob, progressSecret, trackingUrl, uuid, verifyProgressToken} from './job-progress.js';
import {photoBinding} from './job-workshop-photos.js';
import {deliver} from './nmuk-completion-email.js';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const fields = 'id,job_id,registration,customer_email,customer_name,created_at,status,expires_at,decided_at,progress_booking_date,progress_message,progress_photo_ids';
const approvals = params => 'additional_work_approvals?' + new URLSearchParams({select:fields,progress_message:'not.is.null', ...params});
const email = value => String(value || '').trim().toLowerCase();
const reg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const closedJob = job => job.archived || ['work_complete','ready_to_invoice','completed','invoiced','invoice_created'].includes(job.status);
const matches = (row,job) => row && row.job_id === job.id && row.progress_booking_date === job.booking_date &&
  reg(row.registration) === reg(job.registration) && email(row.customer_email) === email(job.customer_email);
const validId = id => { if (typeof id !== 'string' || !uuid.test(id)) throw fail('Choose a valid approval request.'); return id; };
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function summary(row,job) {
  const expired = Date.parse(row.expires_at) <= Date.now() || closedJob(job);
  return {id:row.id,message:row.progress_message,photo_ids:row.progress_photo_ids,
    status:row.status === 'pending' && expired ? 'closed' : row.status,decided_at:row.decided_at};
}

async function find(db,job,id) {
  return (await db(approvals({job_id:'eq.' + job.id,id:'eq.' + validId(id),limit:'1'})))?.[0];
}

export async function workshopApprovalList(db,job) {
  const rows = (await db(approvals({job_id:'eq.' + job.id,order:'created_at.desc',limit:'50'}))).filter(row => matches(row,job));
  if (!rows.length) return {approvals:[]};
  const sends = await db('nmuk_service_reminder_sends?' + new URLSearchParams({
    select:'id,status',id:'in.(' + rows.map(row => 'approval:' + row.id).join(',') + ')'
  }));
  const states = new Map(sends.map(send => [send.id,send.status]));
  return {approvals:rows.map(row => ({...summary(row,job), delivery:states.get('approval:' + row.id) || (isTestProject()?'test':'unsent')}))};
}

async function storedRequest(db,job,body) {
  const id = validId(body.approval_id);
  const replay = await find(db,job,id);
  if (body.action === 'approval-retry') {
    if (!matches(replay,job)) throw fail('This approval request is no longer available.',404);
    return replay;
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const ids = body.photo_ids;
  if (!message || message.length > 1200) throw fail('Enter the work you would like the customer to approve (up to 1,200 characters).');
  if (!Array.isArray(ids) || ids.length > 12 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !uuid.test(id))) throw fail('Choose valid workshop photos.');
  if (ids.length && !replay) {
    const photos = await db('job_workshop_photos?' + new URLSearchParams({select:'id',job_id:'eq.' + job.id,
      id:'in.(' + ids.join(',') + ')',binding:'eq.' + photoBinding(job),ready:'eq.true',deleted_at:'is.null'}));
    if (photos.length !== ids.length) throw fail('Finish uploading the photos before requesting approval.',409);
  }
  if (!replay) {
    await db('additional_work_approvals?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({
      id,job_id:job.id,token:'progress:' + randomUUID(),registration:job.registration,vehicle:job.vehicle,
      customer_email:job.customer_email,customer_name:job.customer_name,items:[],total:0,status:'pending',
      progress_booking_date:job.booking_date,progress_message:message,progress_photo_ids:ids,
      expires_at:new Date(Math.min(Date.now()+7*86400000,Date.parse(job.booking_date+'T00:00:00Z')+8*86400000)).toISOString()
    })});
  }
  const row = replay || await find(db,job,id);
  if (!matches(row,job) || row.progress_message !== message || JSON.stringify(row.progress_photo_ids) !== JSON.stringify(ids))
    throw fail('This request changed. Reopen the job before sending.',409);
  return row;
}

export async function requestApproval(db,job,body,origin) {
  if (closedJob(job)) throw fail('This job has already finished.',409);
  const to = email(job.customer_email);
  if (!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(to)) throw fail('Save a customer email on this job, then reopen it to request approval.');
  const url = new URL(trackingUrl(job,{origin}));
  const row = await storedRequest(db,job,body);
  if (summary(row,job).status !== 'pending') throw fail('This request has already closed.',409);
  url.searchParams.set('approval',row.id);
  if (isTestProject()) return {approval_id:row.id,delivery:'test',url:url.href};
  if (!process.env.RESEND_API_KEY) throw fail('Approval saved. Customer email is not configured.',503);
  const first = String(row.customer_name || job.customer_name || '').trim().split(/\s+/)[0] || 'there';
  const message = 'Hi ' + first + '. There is a message relating to your car waiting for your approval, ';
  const text = message + 'click here to see it: ' + url.href;
  const html = '<p>' + escape(message) + '<a href="' + escape(url.href) + '">click here to see it</a>.</p>';
  const result = await deliver({id:'approval:' + row.id,job,stamp:row.created_at,to:[to]},text,
    row.registration + ' — your approval is needed','chris@vectamotors.co.uk',{text,html});
  return {approval_id:row.id,delivery:result.audit_pending?'unconfirmed':'sent'};
}

export async function customerApproval(db,body) {
  const claim = verifyProgressToken(body.token,progressSecret());
  if (!claim) throw fail('Open the private approval link in your message.',404);
  const job = (await db('jobs?' + new URLSearchParams({select:'*',id:'eq.' + claim.id,limit:'1'})))?.[0];
  if (!claimMatchesJob(claim,job)) throw fail('This approval link is no longer available.',404);
  const row = await find(db,job,body.approval_id);
  if (!matches(row,job)) throw fail('This approval link is no longer available.',404);
  if (body.action === 'approval-decide') {
    if (!['approved','declined'].includes(body.decision)) throw fail('Choose Approve or Decline.');
    const result = await db('rpc/vecta_decide_progress_approval',{method:'POST',body:JSON.stringify({
      p_job_id:job.id,p_approval_id:row.id,p_decision:body.decision
    })});
    if (result.code !== 200) throw fail(result.error,result.code);
    row.status = result.status;
    row.decided_at = result.decided_at;
  }
  return {approval:summary(row,job)};
}
