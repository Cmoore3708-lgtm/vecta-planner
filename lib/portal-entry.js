import {createHash} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {londonDay,trackable,trackingUrl,requestProgressJob,requestTrackingPath} from './job-progress.js';
import {deliver} from './nmuk-completion-email.js';

const normalise=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const email=value=>String(value||'').trim().toLowerCase();
const validEmail=value=>/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=(db,table,params)=>db(table+'?'+new URLSearchParams(params));
const complete=job=>['completed','invoiced','invoice_created','ready_to_invoice'].includes(job.status);
const live=job=>trackable(job)&&(!job.archived||complete(job));
const unexpired=(job,now)=>Date.parse(job.booking_date+'T00:00:00Z')+8*86400000>now;
export const portalEntryAcknowledgement=Object.freeze({ok:true,message:'If we have a current booking and an email address for this registration, we’ll email your private portal link. Check your inbox and junk folder. If you have already requested a link, use the email we sent you.'});

// Public callers receive this same acknowledgement whether or not a match exists.
// Do the lookup/send in the background so response timing cannot reveal a booking.
export async function emailPortalEntry(db,registration,{now=Date.now(),send=deliver}={}){
  if(isTestProject())return; // Preview/Test must never send customer email.
  const today=londonDay(now),earliest=new Date(now-8*86400000).toISOString().slice(0,10);
  const match='ilike.'+registration.split('').join('*');
  const [jobs,requests]=await Promise.all([
    read(db,'jobs',{registration:match,booking_date:'gte.'+earliest,select:'*',order:'booking_date.asc,created_at.desc',limit:101}),
    read(db,'website_booking_requests',{registration:match,status:'in.(awaiting_review,contacted,booked,confirmed)',select:'id,registration,vehicle,email,confirmed_date,preferred_date_1,status,job_id,created_at',order:'created_at.desc',limit:101})
  ]);
  if(jobs.length>100||requests.length>100)return;
  const candidates=jobs.filter(job=>normalise(job.registration)===registration&&live(job)&&unexpired(job,now)).map(job=>({job}));
  for(const request of requests){
    if(normalise(request.registration)!==registration||!['awaiting_review','contacted','booked','confirmed'].includes(request.status))continue;
    let saved=request.job_id?jobs.find(job=>job.id===request.job_id):null;
    if(request.job_id&&!saved)[saved]=await read(db,'jobs',{id:'eq.'+request.job_id,select:'*',limit:1});
    // A linked job is authoritative. Never recover an obsolete customer's receipt.
    if(request.job_id&&(!saved||normalise(saved.registration)!==registration||email(saved.customer_email)!==email(request.email)))continue;
    if(saved&&live(saved))continue; // Use the job link already in the candidate list.
    if(saved&&!(saved.status==='provisional'&&!saved.archived&&['awaiting_review','contacted'].includes(request.status)&&/\[\[VECTA_WEB_DETAILS:/.test(String(saved.customer_note||''))))continue;
    const current={...request,confirmed_date:saved?.booking_date||request.confirmed_date};
    const job=requestProgressJob(current);
    if(trackable(job)&&unexpired(job,now))candidates.push({job,request:current});
  }
  // Today, then the nearest upcoming visit, then the most recent retained receipt.
  candidates.sort((a,b)=>{
    const pastA=a.job.booking_date<today,pastB=b.job.booking_date<today;
    return Number(pastA)-Number(pastB)||(pastA?b.job.booking_date.localeCompare(a.job.booking_date):a.job.booking_date.localeCompare(b.job.booking_date));
  });
  const selected=candidates[0];if(!selected)return;
  const {job,request}=selected,to=email(job.customer_email);
  if(!validEmail(to)||candidates.some(item=>item.job.booking_date===job.booking_date&&email(item.job.customer_email)!==to))return;
  const url=request?'https://www.vectamotors.co.uk'+requestTrackingPath(request,now):trackingUrl(job,{now});
  const date=job.booking_date.split('-').reverse().join('/');
  const body='Your Vecta customer portal\n\nRegistration: '+registration+'\nBooking date: '+date+'\n\nOpen your private portal:\n'+url+'\n\nKeep this link private. If you did not request this email, you can ignore it.\n\nKind regards,\nChris\nVecta Motors\n07721 722622';
  const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html='<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Your Vecta customer portal</h2><p>Registration: <strong>'+registration+'</strong><br>Booking date: '+date+'</p><p><a href="'+escape(url)+'" style="display:inline-block;background:#b8121d;color:#fff;padding:12px 20px;border-radius:8px">Open your customer portal</a></p><p>Keep this link private. If you did not request this email, you can ignore it.</p><p>Kind regards,<br>Chris<br>Vecta Motors<br>07721 722622</p></div>';
  // Durable primary-key reservation plus provider idempotency protects concurrent
  // requests across Vercel instances: at most one email per reg/recipient/hour.
  const id='portal-access:'+hash(registration+':'+to+':'+Math.floor(now/3600000));
  try{
    await send({id,job:{...job,id:request?'request:'+request.id:job.id},stamp:new Date(now).toISOString(),to:[to]},body,registration+' — your customer portal','chris@vectamotors.co.uk',{text:body,html});
  }catch(error){
    if(error.status!==409)throw error; // An existing/uncertain send must not be duplicated.
  }
}

const attempts=new Map();
export function allowPortalEntry(ip,now=Date.now()){
  const key=String(ip||'unknown').slice(0,100),previous=attempts.get(key);
  if(previous&&now-previous.start<600000){if(previous.count>=5)return false;previous.count++;return true;}
  if(attempts.size>=2000)attempts.delete(attempts.keys().next().value);
  attempts.set(key,{start:now,count:1});return true;
}
export function portalEntryOrigin(req){
  const origin=req.headers?.origin;
  if(typeof origin!=='string')return false;
  return ['https://www.vectamotors.co.uk','https://vectamotors.co.uk','https://'+req.headers.host].includes(origin)&&req.headers['sec-fetch-site']!=='cross-site';
}
