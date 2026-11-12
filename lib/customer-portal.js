import '../public/js/vecta-booking-rules.js';
import {uuid,londonDay,trackable,verifyProgressToken,claimMatchesJob,progressSecret,requestProgressSecret,requestProgressJob} from './job-progress.js';
import {approvalAccess} from './progress-approvals.js';
import {mechanicApprovalSummary} from './approved-work.js';
import {imageUrl} from './haynes-vehicle.js';
import {sendPortalPush} from '../api/_push.js';
import {sendCustomerPortalAlerts,portalAlertReceipts} from './portal-message-alerts.js';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const normalise=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const email=value=>String(value||'').trim().toLowerCase();
const read=(db,table,params)=>db(table+'?'+new URLSearchParams(params));
const cancelled=record=>['cancelled','canceled'].includes(record?.status);
// Cancellation closes actions, but the same private link retains its receipt.
const readable=job=>trackable(cancelled(job)?{...job,status:'booked'}:job);
const bindingJob=job=>cancelled(job)?{...job,status:'booked'}:job;
export const stripPrices=message=>mechanicApprovalSummary({message}).message;
export function customerWork(value){return String(value||'').split(/\n\s*\n/).filter(section=>!/(?:^|\n)\s*(?:Service (?:guide price|price agreed):|Quote:\s*[\da-f-]{36}|Oil specification:|Guide price — includes estimated parts costs\.)/im.test(section)&&!/(?:GSF vehicle-applied oil recommendation|\[[A-Z0-9-]+\]\s*(?:·|×)|\bRequired\s+\d+(?:\.\d+)?L;\s*charged\s+\d+)/i.test(section)).join('\n\n').replace(/\[\[VECTA_[\s\S]*?\]\]/g,'').trim();}
export async function portalAccess(db,token,now=Date.now()){
 let job=null,request=null;
 if(typeof token!=='string')throw fail('Open your personalised portal link.',404);
 if(token.startsWith('approval.'))({job}=await approvalAccess(db,token,now,{allowCancelled:true}));
 else if(token.startsWith('request.')){
  const claim=verifyProgressToken(token.slice(8),requestProgressSecret(),now,{deferExpiryToJob:true});
  if(!claim)throw fail('This portal link is unavailable.',404);
  [request]=await read(db,'website_booking_requests',{id:'eq.'+claim.id,select:'*',limit:1});
  if(!request||!['awaiting_review','contacted','booked','confirmed','cancelled','canceled'].includes(request.status))throw fail('This portal link is unavailable.',404);
  if(request.job_id)[job]=await read(db,'jobs',{id:'eq.'+request.job_id,select:'*',limit:1});
  if(request.job_id&&!job)throw fail('This portal link is unavailable.',404);
  if(job&&(!readable(job)&&!(job.status==='provisional'&&!job.archived&&['awaiting_review','contacted'].includes(request.status))))throw fail('This portal link is unavailable.',404);
  if(job&&(normalise(job.registration)!==normalise(request.registration)||email(job.customer_email)!==email(request.email)))throw fail('Please use your latest booking email.',404);
  const binding={...requestProgressJob(request),status:'booked',booking_date:job?.booking_date||request.confirmed_date||request.preferred_date_1};
  if(!claimMatchesJob(claim,binding,now))throw fail('This portal link is unavailable.',404);
 }else{
  const claim=verifyProgressToken(token,progressSecret(),now,{deferExpiryToJob:true});
  if(!claim)throw fail('This portal link is unavailable.',404);
  [job]=await read(db,'jobs',{id:'eq.'+claim.id,select:'*',limit:1});
  if(!job||!claimMatchesJob(claim,bindingJob(job),now))throw fail('This portal link is unavailable.',404);
 }
 if(job&&!request){
  const [candidate]=await read(db,'website_booking_requests',{job_id:'eq.'+job.id,select:'*',order:'created_at.asc',limit:1});
  if(candidate&&normalise(candidate.registration)===normalise(job.registration)&&email(candidate.email)===email(job.customer_email))request=candidate;
 }
 return {job,request};
}
function recordFor(context){return context.job||{...context.request,...requestProgressJob(context.request),customer_preferences:context.request.customer_preferences};}
export function bookingRules(context,now=Date.now()){
 const record=recordFor(context),day=record.booking_date,today=londonDay(now);
 const time=String(context.request?.confirmed_time||record.drop_time||'08:00').slice(0,5);
 // Convert London wall time with Intl (handles British Summer Time).
 const wall=Date.parse(day+'T'+time+':00Z');
 const london=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(new Date(wall));
 const offset=((Number(london)-new Date(wall).getUTCHours()+24)%24)*3600000;
 const starts=wall-offset,closed=cancelled(record)||['work_complete','ready_to_invoice','completed','invoiced','invoice_created'].includes(record.status)||record.archived;
 return {booking_date:day,booking_time:time,cancellation_deadline:new Date(starts-86400000).toISOString(),can_cancel:!closed&&record.status!=='in_progress'&&now<=starts-86400000,can_amend:!closed&&record.status!=='in_progress'&&day>today,can_message:!cancelled(record),cancelled:cancelled(record),images_allowed:!cancelled(record)&&day===today};
}
function eventParams(context){
 const record=recordFor(context),params={registration:'eq.'+normalise(record.registration),customer_email:'eq.'+email(record.customer_email)};
 if(context.job&&context.request)params.or='(job_id.eq.'+context.job.id+',request_id.eq.'+context.request.id+')';
 else params[context.job?'job_id':'request_id']='eq.'+(context.job?.id||context.request.id);
 return params;
}
function publicEvent(row,mechanic=false,staff=false){
 const details={...row.details};if(details.work_required)details.work_required=customerWork(details.work_required);
 return {id:row.id,seq:row.seq,kind:row.kind,actor:row.actor,...(staff?{read_at:row[mechanic?'mechanic_read_at':'manager_read_at']||null}:{}),...(mechanic&&details.status?{decision:details.status}:{}),...(mechanic&&details.preferences?{authorised:details.preferences.serious_repairs==='change_parts'}:{}),message:mechanic?stripPrices(row.mechanic_message||row.message):row.message,created_at:row.created_at,forwarded:!!row.mechanic_at,
  ...(mechanic?{}:{details}),...(row.job_id?{job_id:row.job_id}:{}),registration:row.registration};
}
// A saved model illustration is available before the booking day. This only
// reads cached artwork; workshop progress scenes retain their own date gate.
async function bookingArtwork(db,registration){
 const empty={image_url:'',image_colour:''},reg=normalise(registration);
 if(!/^[A-Z0-9]{2,8}$/.test(reg))return empty;
 try{
  const rows=await read(db,'workshop_settings',{id:'in.(vehicle_artwork:'+reg+',vehicle_colour:'+reg+')',select:'id,value',limit:2});
  const artwork=rows.find(row=>row.id==='vehicle_artwork:'+reg)?.value;
  const colour=rows.find(row=>row.id==='vehicle_colour:'+reg)?.value?.colour||artwork?.colour||'';
  return {image_url:imageUrl(artwork?.imageUrl),image_colour:typeof colour==='string'?colour.slice(0,40):''};
 }catch{return empty;}
}
export async function portalSnapshot(db,context,{before,mechanic=false,staff=false,now=Date.now()}={}){
 if(before!==undefined&&!/^\d{1,18}$/.test(String(before)))throw fail('Invalid history page.');
 const record=recordFor(context),params={...eventParams(context),select:'*',order:'seq.desc',limit:101};
 if(before)params.seq='lt.'+before;if(mechanic)params.mechanic_at='not.is.null';
 const rows=await read(db,'customer_portal_events',params),page=rows.slice(0,100);
 const original=context.request?.portal_original||record.portal_original||{created_at:context.request?.created_at||record.created_at,booking_date:record.booking_date,work_required:record.work_required,legacy:true};
 const prefs=globalThis.VectaBookingRules.customerPreferences(record);
 let approvals=[];
 if(context.job&&!mechanic&&!cancelled(record)){
  const list=await read(db,'additional_work_approvals',{job_id:'eq.'+record.id,progress_review_state:'eq.sent',select:'id,registration,customer_email,customer_phone,progress_booking_date,progress_message,progress_estimate_pence,status,expires_at',order:'created_at.asc',limit:100});
  approvals=list.filter(a=>normalise(a.registration)===normalise(record.registration)&&email(a.customer_email)===email(record.customer_email)&&a.progress_booking_date===record.booking_date&&(a.customer_phone==null||String(a.customer_phone).replace(/\D/g,'')===String(record.customer_phone||'').replace(/\D/g,''))).map(a=>({id:a.id,message:a.progress_message,estimated_pence:a.progress_estimate_pence,status:a.status==='pending'&&Date.parse(a.expires_at)<=now?'closed':a.status}));
 }
 let alerts=[];
 if(staff&&!mechanic&&context.job)try{alerts=await portalAlertReceipts(db,context.job,page);}catch{alerts=page.filter(e=>e.actor==='workshop'&&e.kind==='message').map(e=>({event_id:e.id,channels:{email:'unavailable',whatsapp:'unavailable'}}));}
 const artwork=!staff&&!mechanic?await bookingArtwork(db,record.registration):{};
 return {...(staff&&!mechanic?{alerts}:{}),booking:{registration:record.registration,vehicle:record.vehicle,work_required:mechanic?stripPrices(customerWork(record.work_required)):customerWork(record.work_required),...bookingRules(context,now),...artwork},
  preferences:prefs,original:mechanic?null:{created_at:original.created_at||null,booking_date:original.booking_date,work_required:customerWork(original.work_required),legacy:original.legacy===true},
  events:page.map(row=>publicEvent(row,mechanic,staff)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.seq-b.seq),older_cursor:rows.length>100?String(page.at(-1).seq):null,approvals};
}
export async function portalWrite(db,context,body,actor='customer'){
 const record=recordFor(context),kind=actor==='workshop'?'message':body.kind;
 if(!uuid.test(body.id||'')||!['message','amendment','additional_work','cancelled','preferences'].includes(kind))throw fail('Choose a valid portal action.');
 let message=typeof body.message==='string'?body.message.trim():'',details={};
 if(kind==='preferences'){
  if(!globalThis.VectaBookingRules.validCustomerPreferences(body.preferences))throw fail('Choose your parts and repair preferences.');
  details={preferences:{version:1,parts:body.preferences.parts,serious_repairs:body.preferences.serious_repairs}};
  message=globalThis.VectaBookingRules.customerPreferenceLines({customer_preferences:details.preferences}).join('\n');
 }
 if(kind==='amendment'&&body.requested_date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(body.requested_date)||body.requested_date<=londonDay()||new Date(body.requested_date+'T12:00:00Z').toISOString().slice(0,10)!==body.requested_date)throw fail('Choose a future booking date.');
  details.requested_date=body.requested_date;details.status='requested';
 }
 if(!message||message.length>3000)throw fail(kind==='cancelled'?'Please give a reason for cancelling.':'Enter a message of up to 3,000 characters.');
 const result=await db('rpc/vecta_customer_portal_write',{method:'POST',body:JSON.stringify({p_job_id:context.job?.id||null,p_request_id:context.request?.id||null,p_id:body.id,p_actor:actor,p_kind:kind,p_message:message,p_details:details,p_expected:{registration:normalise(record.registration),email:email(record.customer_email),booking_date:record.booking_date}})});
 if(result.code!==200)throw fail(result.error,result.code);
 if(actor==='customer'&&!result.replayed)await sendPortalPush({audience:'manager',eventId:result.event_id});
 let alerts;
 if(actor==='workshop')try{alerts=await sendCustomerPortalAlerts(db,result.event_id,{jobId:context.job.id});}catch{alerts={event_id:result.event_id,channels:{email:'unavailable',whatsapp:'unavailable'}};}
 return {ok:true,...result,...(alerts?{alerts}:{})};
}
export async function portalQueue(db,role='manager',after,before){
 if(after!==undefined&&!/^\d{1,18}$/.test(String(after)))throw fail('Invalid notification cursor.');
 if(before!==undefined&&!/^\d{1,18}$/.test(String(before)))throw fail('Invalid notification page.');
 const params={select:'*',order:'seq.desc',limit:250};if(before)params.seq='lt.'+before;
 if(role==='mechanic')params.mechanic_at='not.is.null';else params.manager_alert='eq.true';
 // Shared receipts use event UUIDs within each workshop role. Include forwards of
 // older messages: seq is creation order, so don't filter by notification time.
 const rows=await read(db,'customer_portal_events',params);
 const jobIds=[...new Set(rows.map(x=>x.job_id).filter(Boolean))],requestIds=[...new Set(rows.filter(x=>!x.job_id).map(x=>x.request_id).filter(Boolean))];
 const [jobs,requests]=await Promise.all([jobIds.length?read(db,'jobs',{id:'in.('+jobIds.join(',')+')',select:'id,registration,customer_email'}):[],requestIds.length?read(db,'website_booking_requests',{id:'in.('+requestIds.join(',')+')',select:'id,registration,email'}):[]]);
 const records=new Map([...jobs,...requests].map(x=>[x.id,x]));
 const verified=rows.filter(row=>{const record=records.get(row.job_id||row.request_id);return record&&normalise(record.registration)===row.registration&&email(record.customer_email??record.email)===row.customer_email;}).map(row=>publicEvent(row,role==='mechanic',true));
 return {events:verified,older_cursor:rows.length===250?String(rows.at(-1).seq):null};
}
export async function forwardPortalEvent(db,id){
 if(!uuid.test(id||''))throw fail('Choose a message.');
 const [event]=await read(db,'customer_portal_events',{id:'eq.'+id,select:'*',limit:1});
 if(!event)throw fail('Message unavailable.',404);
 const result=await db('rpc/vecta_forward_portal_event',{method:'POST',body:JSON.stringify({p_id:id,p_message:stripPrices(event.message)})});
 if(result.code!==200)throw fail(result.error,result.code);
 if(!result.already_forwarded)await sendPortalPush({audience:'mechanic',eventId:id});
 return {ok:true};
}
export async function workshopPortalContext(db,id){
 if(!uuid.test(id||''))throw fail('Choose a saved job.');
 const [job]=await read(db,'jobs',{id:'eq.'+id,select:'*',limit:1});
 if(!job)throw fail('Booking unavailable.',404);
 const [request]=await read(db,'website_booking_requests',{job_id:'eq.'+id,registration:'eq.'+job.registration,email:'eq.'+email(job.customer_email),select:'*',limit:1});
 return {job,request};
}
