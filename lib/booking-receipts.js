import {databaseEnvironment} from '../api/_database-environment.js';
import {requestTrackingPath} from './job-progress.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sender='VECTA Motors <chris@vectamotors.co.uk>';
export function receiptContent(booking,{trackingPath=requestTrackingPath}={}){
 const date=new Date(booking.confirmed_date+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const reference=String(booking.id).slice(0,8).toUpperCase();
 const guide=/guide price|guide total|estimated parts/i.test(booking.work_required||'');
 const amount=booking.approximate_cost;
 const hasPrice=amount!==null&&amount!==undefined&&amount!==''&&Number.isFinite(Number(amount))&&Number(amount)>=0;
 let link='';try{link='https://www.vectamotors.co.uk'+trackingPath(booking);}catch{/* The booking receipt is useful even if tracking is unavailable. */}
 const work=Array.isArray(booking.job_types)?booking.job_types.join(', '):'Your requested work';
 const text=`Hi ${booking.customer_name||'there'},\n\nYour booking is confirmed for ${date}. We’ll contact you if we need to discuss any details.\n\nBooking reference: ${reference}\nRegistration: ${booking.registration}\nVehicle: ${booking.vehicle}\nWork: ${work}\n`+
  (hasPrice?`${guide?'Guide total':'Website total'}: £${Number(amount).toFixed(2)} including VAT.\n`:'Price: to be confirmed.\n')+
  (guide?'This is an estimate. We will confirm the price with you before any work.\n':'')+
  (booking.completion_deadline?`Requested collection deadline: ${booking.completion_deadline}. Please contact us if this is essential.\n`:'')+
  '\nFind us at the NMUK Contractors Compound, via the SOUTH GATE security entrance. Park in a VECTA bay outside the workshop. Before 8am, put your keys through the key-drop letterbox.\n\nPlease leave your service book and locking wheel nut key on the passenger seat.\n'+
  (link?'\nTrack your car on the day of your booking:\n'+link+'\n':'')+
  '\nYou may receive updates on the day about your car via WhatsApp, so please keep an eye out for them.\n\nTo change any booking details, reply to this email or contact us on WhatsApp: https://wa.me/447721722622\n\nThank you,\nChris\nVECTA Motors';
 let html=escape(text).replace(/\n/g,'<br>');
 if(link)html=html.replace(escape(link),'<a href="'+escape(link)+'">View your car’s progress</a>');
 html=html.replace('https://wa.me/447721722622','<a href="https://wa.me/447721722622">WhatsApp VECTA</a>');
 return {from:sender,reply_to:'chris@vectamotors.co.uk',to:[String(booking.email).trim()],subject:`${String(booking.registration).replace(/[\r\n]/g,'')} — VECTA booking confirmed · ${reference}`,text,html};
}
export async function receiptRpc(action,id=null,lease=null,payload={}){
 const {url,key}=databaseEnvironment({requireService:true});
 const response=await fetch(url+'/rest/v1/rpc/vecta_booking_receipt',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_id:id,p_lease:lease,p_payload:payload}),signal:AbortSignal.timeout(action==='status'?1500:10000)});
 if(!response.ok)throw Error('Receipt queue unavailable');return response.json();
}
export async function processBookingReceipts({id=null,limit=10,env=process.env,rpc=receiptRpc,fetcher=fetch,content=receiptContent,now=Date.now}={}){
 // Tests and previews never send customer emails, even if production keys exist.
 if(env.VERCEL_ENV!=='production'||/test|synthetic/i.test(env.VERCEL_PROJECT_NAME||'')||!env.RESEND_API_KEY)return {sent:0,skipped:'Email delivery is disabled in this environment'};
 const config=databaseEnvironment({requireService:true});
 if(config.testProject||!config.url.includes('jywufozycuwuoshlulwl.supabase.co'))return {sent:0,skipped:'Test database'};
 let sent=0,failed=0;
 for(let n=0;n<Math.min(limit,10);n++){
  let row=await rpc('claim',id);if(!row)break;
  try{
   if(now()-Date.parse(row.first_attempt_at)>=23*3600000)throw Error('Delivery needs review');
   if(!row.payload){
    const payload=content(row.snapshot);
    if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(payload.to[0]))throw Error('Invalid customer email');
    row=await rpc('prepare',row.id,row.lease,payload);if(!row?.payload)throw Error('Receipt reservation expired');
   }
   const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'website-booking/'+row.id},body:JSON.stringify(row.payload),signal:AbortSignal.timeout(12000)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.id)throw Object.assign(Error('Email provider rejected delivery ('+response.status+')'),{review:response.status>=400&&response.status<500&&![409,429].includes(response.status)});
   const saved=await rpc('sent',row.id,row.lease,{provider_id:result.id});
   if(!saved?.saved)throw Error('Delivery result needs reconciling');sent++;
  }catch(error){
   failed++;if(row?.id)await rpc('failed',row.id,row.lease,{error:error.message,review:!!error.review}).catch(()=>{});
  }
  if(id)break;
 }
 return {sent,failed};
}
