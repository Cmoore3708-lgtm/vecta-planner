import '../public/js/vecta-booking-rules.js';
import {createHmac,createHash} from 'node:crypto';
import {waitUntil} from '@vercel/functions';
import {databaseEnvironment,isTestProject} from '../api/_database-environment.js';
import {workshopLoginRole,sameOriginRequest} from './workshop-access.js';
import {managerAuthorised} from '../api/message-centre.js';
import {imageUrl} from './haynes-vehicle.js';
import {sceneIdentity,publishedScenes,curatedScenes} from './progress-scene-model.js';
import {requestScenePreparation} from './progress-scene-demand.js';
import {uuid,londonDay,trackable,progressSecret,verifyProgressToken,claimMatchesJob,trackingUrl,progressSnapshot} from './job-progress.js';
import {requestProgressJob,requestProgressSecret} from './job-progress.js';
import {isMechanicHost} from './mechanic-auth.js';
import {saveWhatsappPermission} from './approval-whatsapp.js';
import {approvalAccess,customerApproval,requestApproval,reviewQueue,stageFinding,workshopApprovalList} from './progress-approvals.js';
import {portalAccess,portalSnapshot,portalWrite,portalQueue,forwardPortalEvent,workshopPortalContext} from './customer-portal.js';
import {customerPhotos,workshopPhotoAction} from './job-workshop-photos.js';
import {emailPortalEntry,allowPortalEntry,portalEntryOrigin,portalEntryAcknowledgement} from './portal-entry.js';
import {sendCustomerPortalAlerts} from './portal-message-alerts.js';

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
export async function registrationStatus(value,now=Date.now(),options={}){
  const registration=progressRegistration(value),today=londonDay(now);
  // The date is always supplied by the server. Spaces/case in historic plates
  // are tolerated, then every candidate is compared exactly before use.
  const params=new URLSearchParams({booking_date:'eq.'+today,registration:'ilike.'+registration.split('').join('*'),select:'id,registration,vehicle,make,model,work_required,booking_date,status,archived,customer_note,job_type,card_type,customer_email',limit:'101'});
  const rows=await progressDb('jobs?'+params);
  const jobs=(rows||[]).filter(job=>job.booking_date===today&&trackable(job)&&(!job.archived||['completed','invoiced','invoice_created','ready_to_invoice'].includes(job.status))&&String(job.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===registration);
  if(!jobs.length||rows.length>100)throw fail('No booking was found for this registration today. Please check the registration or contact the workshop.',404);
  // Multiple jobs for one car: never announce collection while another is open.
  const order={waiting:0,underway:1,checking:2,ready:3};
  const snapshots=jobs.map(job=>progressSnapshot(job,{now}));
  const current=snapshots.reduce((a,b)=>order[a.stage]<=order[b.stage]?a:b);
  const artwork=await progressArtwork(registration,{...options,source:{kind:'job',id:jobs[0].id},bookingDate:today,now});
  // Only the requested vehicle and booked-work summary are public; never
  // expose customer notes, contact details, prices or other bookings.
  const vehicle=jobs.map(job=>String(job.vehicle||[job.make,job.model].filter(Boolean).join(' ')).trim()).find(Boolean)||'';
  const job_description=[...new Set(jobs.map(job=>String(job.work_required||job.job_type||'').trim()).filter(Boolean))].join('\n').slice(0,2000);
  return {registration,vehicle,job_description,customer_instructions:[...new Set(jobs.flatMap(job=>globalThis.VectaBookingRules.customerPreferenceLines(job)))],stage:current.stage,title:current.title,...artwork,...await customerPhotos(jobs)};
}
const scheduleScenes=registration=>waitUntil(import('./progress-scene-worker.js').then(worker=>worker.runRequestedScenes(registration)).catch(()=>console.warn('Requested progress scenes will resume on the next worker run.')));
async function progressArtwork(registration,{requestScenes=false,schedule=scheduleScenes,source,bookingDate,now=Date.now()}={}){
  const today=londonDay(now);
  if(!bookingDate||bookingDate!==today)return {images_allowed:false,image_url:'',image_colour:'',scene_state:'scheduled'};
  requestScenes=requestScenes&&bookingDate===today;
  try{
    const rows=await progressDb('workshop_settings?'+new URLSearchParams({id:'in.(vehicle_artwork:'+registration+',vehicle_colour:'+registration+',vehicle_identity:'+registration+',progress_scenes_v1:'+registration+')',select:'id,value',limit:'4'}));
    const artwork=rows?.find(row=>row.id==='vehicle_artwork:'+registration)?.value;
    const colour=String(rows?.find(row=>row.id==='vehicle_colour:'+registration)?.value?.colour||'').trim().toUpperCase();
    const identity=sceneIdentity(registration,rows),manifest=rows.find(row=>row.id==='progress_scenes_v1:'+registration)?.value;
    const scenes=publishedScenes(identity||(manifest?.registration===registration?manifest.identity:null),manifest,databaseEnvironment({requireService:true}).url);
    let scene_state='unavailable';
    if(requestScenes&&!scenes&&identity&&!curatedScenes(identity)&&process.env.VECTA_PROGRESS_SCENES_ENABLED==='1'&&!isTestProject()){
      scene_state=await requestScenePreparation({db:progressDb,identity,source,now});
      if(scene_state==='preparing')schedule(registration);
    }
    return {images_allowed:true,...(scenes?{scenes}:process.env.VECTA_PROGRESS_SCENES_ENABLED==='1'?{scene_state}:{}),image_url:imageUrl(artwork?.imageUrl)||'',image_colour:/^(BLACK|WHITE|SILVER|GREY|GRAY|BLUE|RED|GREEN|YELLOW|ORANGE|BROWN|BEIGE|GOLD|PURPLE|PINK|BRONZE|MAROON|TURQUOISE)$/.test(colour)?colour:''};
  }catch{return {image_url:'',image_colour:''};}
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
export async function customerStatus(token,now=Date.now(),options={}){
  if(typeof token==='string'&&token.startsWith('request.'))return requestStatus(token.slice(8),now,options);
  if(typeof token==='string' && token.startsWith('approval.')){
    const {job}=await approvalAccess(progressDb,token,now);
    return jobSnapshot(job,now,options,true);
  }
  const claim=verifyProgressToken(token,progressSecret(),now,{deferExpiryToJob:true});
  if(!claim)throw fail('This tracking link is unavailable or has expired. Please use the latest booking email.',404);
  const job=await getJob(claim.id);
  if(!claimMatchesJob(claim,job,now))throw fail('This tracking link is unavailable or has expired. Please use the latest booking email.',404);
  return jobSnapshot(job,now,options,true);
}
async function jobSnapshot(job,now,options,includeInvoice){
  const account=await accountFor(job),ready=['ready_to_invoice','completed','invoiced','invoice_created'].includes(String(job.status||'').toLowerCase());
  const invoice=includeInvoice&&ready&&account==='STAFF'?await invoiceFor(job):null;
  const result=progressSnapshot(job,{account,hasInvoice:!!invoice,now});
  result.customer_instructions=globalThis.VectaBookingRules.customerPreferenceLines(job);
  result.job_description=String(job.work_required||job.job_type||'').trim().slice(0,2000);
  if(job.booking_date===londonDay(now))Object.assign(result,await customerPhotos([job]));
  Object.assign(result,await progressArtwork(progressRegistration(job.registration),{...options,source:{kind:'job',id:job.id},bookingDate:job.booking_date,now}));
  if(invoice&&result.stage==='ready')result.invoice_url=await invoiceUrl(invoice);
  return result;
}
export async function requestStatus(token,now=Date.now(),options={}){
  const claim=verifyProgressToken(token,requestProgressSecret(),now,{deferExpiryToJob:true});
  if(!claim)throw fail('This booking tracking link is unavailable or has expired.',404);
  const request=(await progressDb('website_booking_requests?'+new URLSearchParams({id:'eq.'+claim.id,select:'id,registration,vehicle,email,confirmed_date,preferred_date_1,status,job_id,customer_preferences',limit:'1'})))?.[0];
  if(!request||!trackable(requestProgressJob(request)))throw fail('This booking tracking link is unavailable or has expired.',404);
  let job=requestProgressJob(request),provisional=!request.job_id&&['awaiting_review','contacted'].includes(request.status);
  if(request.job_id){
    const saved=await getJob(request.job_id);
    provisional=!!saved&&saved.status==='provisional'&&!saved.archived&&['awaiting_review','contacted'].includes(request.status)&&/\[\[VECTA_WEB_DETAILS:/.test(String(saved.customer_note||''));
    if((!provisional&&!trackable(saved))||!saved||progressRegistration(saved.registration)!==progressRegistration(request.registration)||String(saved.customer_email||'').trim().toLowerCase()!==String(request.email||'').trim().toLowerCase())throw fail('Please use the latest booking confirmation link.',404);
    job=saved;
  }
  // Once accepted, the planner date is authoritative even if the original
  // website receipt still records the old requested/confirmed date.
  if(!claimMatchesJob(claim,{...requestProgressJob(request),booking_date:job.booking_date},now))throw fail('This booking tracking link is unavailable or has expired.',404);
  // Accepted bookings share the same private invoice access as direct job links.
  if(request.job_id&&!provisional)return jobSnapshot(job,now,options,true);
  const result=progressSnapshot(job,{now});
  if(provisional || !request.job_id){
    result.stage='scheduled';
    result.title='Your booking is confirmed';
    if(job.booking_date<=londonDay(now))result.description='Your workshop visit is booked. Progress updates will appear here when work starts.';
  }
  result.customer_instructions=globalThis.VectaBookingRules.customerPreferenceLines(request.job_id?job:request);
  result.job_description=request.job_id?String(job.work_required||job.job_type||'').trim().slice(0,2000):'';
  return {...result,...await progressArtwork(progressRegistration(job.registration),{...options,...(provisional?{requestScenes:false}:{}),source:{kind:request.job_id?'job':'request',id:job.id},bookingDate:job.booking_date,now}),...await customerPhotos(request.job_id&&!provisional&&job.booking_date===londonDay(now)?[job]:[])};
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
    if(['portal-status','portal-write'].includes(b.action)){
      if(!allowRegistrationLookup('portal:'+String(req.headers?.['x-real-ip']||req.headers?.['x-forwarded-for']||'unknown')))throw fail('Please wait a minute before trying again.',429);
      const context=await portalAccess(progressDb,b.token);
      return res.status(200).json(b.action==='portal-status'?await portalSnapshot(progressDb,context,{before:b.before}):await portalWrite(progressDb,context,b));
    }
    if(['portal-queue','portal-job','portal-reply','portal-forward','portal-alert-retry','confirmation-preview','confirmation-send'].includes(b.action)){
      if(!sameOriginRequest(req))throw fail('Use Workshop Pro.',403);
      const role=await workshopLoginRole(req,res);if(!role)return;
      if(!['portal-queue','portal-job'].includes(b.action)&&role!=='manager')throw fail('Use Workshop Pro to contact the customer.',403);
      if(b.action==='portal-queue')return res.status(200).json(await portalQueue(progressDb,role,b.after,b.before));
      if(b.action==='portal-forward')return res.status(200).json(await forwardPortalEvent(progressDb,b.event_id));
      const context=await workshopPortalContext(progressDb,b.job_id);
      if(b.action==='portal-alert-retry')return res.status(200).json(await sendCustomerPortalAlerts(progressDb,b.event_id,{jobId:context.job.id,retry:true}));
      if(b.action.startsWith('confirmation-'))return res.status(200).json(await (await import('./portal-email.js')).bookingConfirmation(progressDb,context.job,b.action==='confirmation-send'));
      return res.status(200).json(b.action==='portal-job'?await portalSnapshot(progressDb,context,{before:b.before,mechanic:role==='mechanic',staff:true}):await portalWrite(progressDb,context,b,'workshop'));
    }
    if(b.action==='portal-entry'){
      if(!portalEntryOrigin(req))throw fail('Open the customer portal from the Vecta website.',403);
      const registration=progressRegistration(b.registration);
      if(!allowPortalEntry(req.headers?.['x-real-ip']||req.headers?.['x-forwarded-for']?.split(',')[0])){res.setHeader('Retry-After','600');throw fail('Please wait ten minutes before requesting another link.',429);}
      if(isTestProject())throw fail('This is a preview. Customer access emails are disabled here.',409);
      databaseEnvironment({requireService:true});
      if(!process.env.RESEND_API_KEY)throw fail('Portal emails are temporarily unavailable. Please use your booking email or contact the workshop.',503);
      waitUntil(emailPortalEntry(progressDb,registration).catch(()=>console.warn('Customer portal access email could not be confirmed; check the email ledger.')));
      return res.status(200).json(portalEntryAcknowledgement);
    }
    if(b.action==='registration'){
      if(!allowRegistrationLookup(req.headers?.['x-real-ip']||req.headers?.['x-forwarded-for']?.split(',')[0])){res.setHeader('Retry-After','60');throw fail('Please wait a minute before checking again.',429);}
      return res.status(200).json(await registrationStatus(b.registration,Date.now(),{requestScenes:b.request_scenes===true}));
    }
    if(b.action==='status')return res.status(200).json(await customerStatus(b.token,Date.now(),{requestScenes:b.request_scenes===true}));
    if (['approval-status','approval-decide'].includes(b.action)) return res.status(200).json(await customerApproval(progressDb,b));
    const approvalAction = ['approval-stage','approval-queue','approval-decisions','approval-request','approval-retry','approval-list','approval-whatsapp-permission'].includes(b.action);
    const photoAction=['photos-list','photos-upload','photos-caption','photos-delete'].includes(b.action);
    if(!['link','start','send-invoice'].includes(b.action)&&!photoAction&&!approvalAction)throw fail('Invalid progress action.');
    if(!sameOriginRequest(req))throw fail('Use Workshop Pro to update this booking.',403);
    const role=await workshopLoginRole(req,res);
    if(!role)return;
    const workshopAction=photoAction||['start','approval-stage','approval-list','approval-decisions'].includes(b.action);
    if(!workshopAction && (isMechanicHost(req.headers.host)||!await managerAuthorised(req)))throw fail('Send prices and customer messages from Workshop Pro.',403);
    if(b.action==='approval-decisions')return res.status(200).json(await reviewQueue(progressDb,'mechanic'));
    if(b.action==='approval-queue')return res.status(200).json(await reviewQueue(progressDb));
    if(!uuid.test(b.job_id||''))throw fail('Choose a saved booking.');
    const job=await getJob(b.job_id);if(!trackable(job))throw fail('Booking not available.',404);
    if (b.action === 'approval-stage') return res.status(200).json(await stageFinding(progressDb,job,b,role));
    if (b.action === 'approval-whatsapp-permission') return res.status(200).json(await saveWhatsappPermission(progressDb,job,b));
    if (b.action === 'approval-list') return res.status(200).json(await workshopApprovalList(progressDb,job,role));
    if (approvalAction) {
      const origin = isTestProject() ? 'https://' + req.headers.host : 'https://www.vectamotors.co.uk';
      return res.status(200).json(await requestApproval(progressDb,job,b,origin));
    }
    if(photoAction){
      const canPublish=b.action==='photos-list'||(!isMechanicHost(req.headers.host)&&await managerAuthorised(req));
      return res.status(200).json(await workshopPhotoAction(b.action,job,b,{canPublish}));
    }
    if(b.action==='start')return res.status(200).json(await startWork(job));
    if(b.action==='send-invoice')return res.status(200).json(await sendInvoice(job));
    const origin=isTestProject()?'https://'+req.headers.host:'https://www.vectamotors.co.uk';
    return res.status(200).json({url:trackingUrl(job,{origin})});
  }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Workshop updates are temporarily unavailable. Please try again.'});}
}
