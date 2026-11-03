import {createHmac,createHash} from 'node:crypto';
import {databaseEnvironment} from '../api/_database-environment.js';
import {requireWorkshopLogin,sameOriginRequest} from './workshop-access.js';
import {managerAuthorised} from '../api/message-centre.js';
import {imageUrl} from './haynes-vehicle.js';
import {uuid,londonDay,trackable,progressSecret,verifyProgressToken,claimMatchesJob,trackingUrl,progressSnapshot} from './job-progress.js';

const fail=(message,status=400)=>Object.assign(Error(message),{status});
export async function progressDb(path,options={}){
  const {url,key}=databaseEnvironment({requireService:true});
  const response=await fetch(url+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw fail('Workshop updates are temporarily unavailable. Please try again.',503);
  return response.status===204?null:response.json();
}
async function getJob(id){return (await progressDb('jobs?'+new URLSearchParams({id:'eq.'+id,select:'*',limit:'1'})))?.[0];}
export function progressRegistration(value){
  if(typeof value!=='string'||value.length>15||!/^[a-z0-9\s-]+$/i.test(value))throw fail('Enter a valid registration.');
  const registration=value.toUpperCase().replace(/[\s-]/g,'');
  if(!/^[A-Z0-9]{2,8}$/.test(registration))throw fail('Enter a valid registration.');
  return registration;
}
export async function registrationStatus(value,now=Date.now()){
  const registration=progressRegistration(value),today=londonDay(now);
  // The date is always supplied by the server. Spaces/case in historic plates
  // are tolerated, then every candidate is compared exactly before use.
  const params=new URLSearchParams({booking_date:'eq.'+today,registration:'ilike.'+registration.split('').join('*'),select:'id,registration,booking_date,status,archived,customer_note,job_type,card_type',limit:'101'});
  const rows=await progressDb('jobs?'+params);
  const jobs=(rows||[]).filter(job=>job.booking_date===today&&trackable(job)&&(!job.archived||['completed','invoiced','invoice_created','ready_to_invoice'].includes(job.status))&&String(job.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===registration);
  if(!jobs.length||rows.length>100)throw fail('No booking was found for this registration today. Please check the registration or contact the workshop.',404);
  // Multiple jobs for one car: never announce collection while another is open.
  const order={waiting:0,underway:1,checking:2,ready:3};
  const snapshots=jobs.map(job=>progressSnapshot(job,{now}));
  const current=snapshots.reduce((a,b)=>order[a.stage]<=order[b.stage]?a:b);
  let image='';
  try{const artwork=await progressDb('workshop_settings?'+new URLSearchParams({id:'eq.vehicle_artwork:'+registration,select:'value',limit:'1'}));image=imageUrl(artwork?.[0]?.value?.imageUrl)||'';}catch{/* Tracking works even when artwork is unavailable. */}
  // Registration-only access exposes no identifiers, notes, work, prices,
  // customer data, invoice links, tokens, dates or previous/future bookings.
  return {registration,stage:current.stage,title:current.title,image_url:image};
}
const lookupAttempts=new Map();
export function allowRegistrationLookup(ip,now=Date.now()){
  const key=String(ip||'unknown').slice(0,100),previous=lookupAttempts.get(key);
  if(previous&&now-previous.start<60000){if(previous.count>=30)return false;previous.count++;return true;}
  if(lookupAttempts.size>=2000)lookupAttempts.delete(lookupAttempts.keys().next().value);
  lookupAttempts.set(key,{start:now,count:1});return true;
}
async function accountFor(job){
  const memory=(await progressDb('workshop_settings?'+new URLSearchParams({id:'eq.jobcustomer:'+job.id,select:'value',limit:'1'})))?.[0]?.value;
  return String(memory?.customer_account||job.customer_account||'').toUpperCase();
}
const active=inv=>inv&&!['draft','void','cancelled','deleted'].includes(String(inv.status||'').toLowerCase());
async function invoiceFor(job){
  const invoices=await progressDb('invoices?'+new URLSearchParams({job_id:'eq.'+job.id,select:'*',limit:'10'}));
  return invoices?.find(inv=>active(inv)&&String(inv.registration||'').replace(/\W/g,'').toUpperCase()===String(job.registration||'').replace(/\W/g,'').toUpperCase());
}
async function invoiceUrl(invoice){
  const {issueInvoiceToken}=await import('../api/_invoice-pdf.js');
  const {key}=databaseEnvironment({requireService:true});
  const secret=process.env.VECTA_INVOICE_LINK_SECRET||createHmac('sha256',key).update('VECTA invoice links v1').digest('hex');
  return '/invoice?token='+issueInvoiceToken(invoice,secret);
}
export async function customerStatus(token,now=Date.now()){
  const claim=verifyProgressToken(token,progressSecret(),now);
  if(!claim)throw fail('This tracking link is unavailable or has expired. Please use the latest booking email.',404);
  const job=await getJob(claim.id);
  if(!claimMatchesJob(claim,job))throw fail('This tracking link is unavailable or has expired. Please use the latest booking email.',404);
  const account=await accountFor(job),ready=['ready_to_invoice','completed','invoiced','invoice_created'].includes(String(job.status||'').toLowerCase());
  const invoice=ready&&account==='STAFF'?await invoiceFor(job):null;
  const result=progressSnapshot(job,{account,hasInvoice:!!invoice,now});
  if(invoice&&result.stage==='ready')result.invoice_url=await invoiceUrl(invoice);
  return result;
}
export async function startWork(job,now=Date.now()){
  if(!trackable(job)||job.booking_date!==londonDay(now)||job.archived||!['booked','arrived'].includes(String(job.status||'').toLowerCase()))return {started:false};
  const params=new URLSearchParams({id:'eq.'+job.id,status:'eq.'+job.status,booking_date:'eq.'+job.booking_date,archived:'eq.false',updated_at:job.updated_at?'eq.'+job.updated_at:'is.null',select:'id,status,updated_at'});
  const rows=await progressDb('jobs?'+params,{method:'PATCH',body:JSON.stringify({status:'in_progress',updated_at:new Date(now).toISOString()})});
  if(rows?.length!==1)throw fail('This job changed on another device. Reopen it before starting work.',409);
  return {started:true,job:rows[0]};
}
export async function sendInvoice(job){
  if(await accountFor(job)!=='STAFF')throw fail('Automatic invoice emails are for staff customer bookings only.');
  if(!['ready_to_invoice','completed','invoiced','invoice_created'].includes(job.status))throw fail('Confirm the completed work before sending the invoice.',409);
  const invoice=await invoiceFor(job);if(!invoice)throw fail('Save the invoice before sending it.',409);
  const to=String(job.customer_email||'').trim();
  if(!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(to))throw fail('Add a valid customer email to this job before emailing the invoice.');
  if(!process.env.RESEND_API_KEY)throw fail('The workshop email service is not configured.',503);
  const {isTestProject}=await import('../api/_database-environment.js');
  if(isTestProject())throw fail('Customer email delivery is disabled on Test. The invoice and tracking can still be checked.',409);
  const origin='https://www.vectamotors.co.uk',link=origin+await invoiceUrl(invoice);
  // Identity is stable for the saved invoice: repeated clicks cannot send duplicates.
  const id='completion:'+createHash('sha256').update('staff-invoice:'+invoice.id).digest('hex');
  const context={id,job,stamp:new Date().toISOString(),to:[to]};
  const body='Hi '+String(job.customer_name||'Customer').split(/\s+/)[0]+',\n\nThe work on your car '+job.registration+' is complete and it is ready for payment and collection.\n\nYour invoice total is £'+Number(invoice.total||0).toFixed(2)+'.\n\nView your invoice:\n'+link+'\n\nWe will send a payment link from BeePaid via text message shortly.';
  const {deliver}=await import('./nmuk-completion-email.js');
  const previous=(await progressDb('nmuk_service_reminder_sends?'+new URLSearchParams({id:'eq.'+id,select:'*',limit:'1'})))?.[0];
  let frozen;try{frozen=JSON.parse(previous?.error||'null')?.payload;}catch{}
  if(frozen&&JSON.stringify(frozen.to)!==JSON.stringify(context.to))throw fail('The customer email changed after an earlier send attempt. Check Message Centre before sending again.',409);
  const text=body+'\n\nKind regards,\nChris\nVecta Motors\n07721722622';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const content=frozen?{text:frozen.text,html:frozen.html}:{text,html:escape(text).replace(/\n/g,'<br>')};
  return deliver(context,body,frozen?.subject||job.registration+' — work complete and invoice','chris@vectamotors.co.uk',content);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON required'});
  const b=req.body||{};
  try{
    if(b.action==='registration'){
      if(!allowRegistrationLookup(req.headers?.['x-real-ip']||req.headers?.['x-forwarded-for']?.split(',')[0])){res.setHeader('Retry-After','60');throw fail('Please wait a minute before checking again.',429);}
      return res.status(200).json(await registrationStatus(b.registration));
    }
    if(b.action==='status')return res.status(200).json(await customerStatus(b.token));
    if(!['link','start','send-invoice'].includes(b.action))throw fail('Invalid progress action.');
    if(!sameOriginRequest(req))throw fail('Use Workshop Pro to update this booking.',403);
    if(!await requireWorkshopLogin(req,res))return;
    if(b.action!=='start'&&!await managerAuthorised(req))throw fail('Manager sign-in required.',401);
    if(!uuid.test(b.job_id||''))throw fail('Choose a saved booking.');
    const job=await getJob(b.job_id);if(!trackable(job))throw fail('Booking not available.',404);
    if(b.action==='start')return res.status(200).json(await startWork(job));
    if(b.action==='send-invoice')return res.status(200).json(await sendInvoice(job));
    const {isTestProject}=await import('../api/_database-environment.js');
    const origin=isTestProject()?'https://'+req.headers.host:'https://www.vectamotors.co.uk';
    return res.status(200).json({url:trackingUrl(job,{origin})});
  }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Workshop updates are temporarily unavailable. Please try again.'});}
}
