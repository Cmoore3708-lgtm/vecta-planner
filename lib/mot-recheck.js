import {address,motSender,motInbox,parseMotConfirmation,emailText,registration} from './mot-confirmation.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const retryable=new Set(['no_unallocated_mot','multiple_unallocated_mots']);
export function matchesSavedMot(job,event){
 const time=String(job?.customer_note||'').match(/\[\[MOT_TIME:([^\]]+)\]\]/i)?.[1]||
  (String(job?.technician||'').trim().toLowerCase()==='chris'?String(job.drop_time||'').slice(0,5):'');
 return !!job&&!job.archived&&job.status==='booked'&&(job.card_type||'job')==='job'&&
  String(job.job_type||'').split(/[,;|]/).some(type=>/^mot(?: test)?$/i.test(type.trim()))&&
  registration(job.registration)===event.registration&&job.booking_date===event.date&&time===event.time;
}

// The browser supplies only a job ID. All appointment details and the original
// authenticated email are read server-side before the atomic database recheck.
export async function recheckEarlierMot(jobId,{database,emailApi}){
 if(!uuid.test(String(jobId||'')))return {status:400,error:'Invalid job ID'};
 const job=(await database('jobs?select=*&id=eq.'+jobId))?.[0];
 if(!job)return {status:404,error:'Job not found'};
 const query=new URLSearchParams({select:'value',id:'like.mot-email:*','value->>registration':'eq.'+registration(job.registration),'value->>date':'eq.'+job.booking_date});
 const rows=await database('workshop_settings?'+query);
 const candidates=rows.map(row=>row.value).filter(e=>retryable.has(e?.allocation_status)&&matchesSavedMot(job,e))
  .sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at));
 for(const saved of candidates.slice(0,5)){
  if(!uuid.test(saved.email_id))continue;
  // Resend is authoritative, including for historical records which predate
  // this feature. Never turn a review flag into confirmation by itself.
  const email=await emailApi('emails/receiving/'+saved.email_id);
  if(address(email.from)!==motSender||!(email.to||[]).some(to=>address(to)===motInbox)||
    email.authentication?.dkim!=='pass'||email.authentication?.dmarc==='fail')continue;
  const parsed=parseMotConfirmation(email);
  if(parsed.state!=='confirmed'||!matchesSavedMot(job,parsed)||parsed.reference!==saved.reference||
    !Number.isFinite(Date.parse(email.created_at))||Date.parse(email.created_at)!==Date.parse(saved.received_at))continue;
  const record={...parsed,email_id:saved.email_id,received_at:email.created_at,
   email_subject:String(email.subject||'Booking confirmation').slice(0,500),email_text:emailText(email).slice(0,100000)};
  const event=await database('rpc/vecta_recheck_mot_confirmation',{method:'POST',body:JSON.stringify({p_job_id:jobId,p_record:record})});
  if(event?.allocation_status==='allocated'&&event.job_id===jobId)return {status:200,matched:true,event};
 }
 return {status:200,matched:false};
}
