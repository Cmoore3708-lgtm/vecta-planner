import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {databaseEnvironment} from '../api/_database-environment.js';

export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const londonDay=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const reg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function trackable(job){
  return !!job&&uuid.test(job.id||'')&&!!reg(job.registration)&&!job.no_vehicle&&
    (!job.card_type||job.card_type==='job')&&!job.deleted_at&&!job.deleted&&
    !['quote','provisional','cancelled','canceled','deleted'].includes(String(job.status||'').toLowerCase())&&
    !/\[\[VECTA_(?:SOFT_DELETE|DELETED)[:\]]/i.test(String(job.customer_note||''))&&
    !/vehicle tax|pool car tax/i.test(String(job.job_type||''))&&/^\d{4}-\d{2}-\d{2}$/.test(job.booking_date||'');
}
function binding(job){return createHash('sha256').update(JSON.stringify([job.id,job.booking_date,reg(job.registration),String(job.customer_email||'').trim().toLowerCase()])).digest('hex');}
export function progressSecret(){const config=databaseEnvironment({requireService:true});return createHmac('sha256',config.key).update('VECTA customer progress v1\n'+config.url).digest('hex');}
export function issueProgressToken(job,secret,now=Date.now()){
  if(!trackable(job))throw Error('Choose a saved vehicle booking.');
  const exp=Math.floor((Date.parse(job.booking_date+'T00:00:00Z')+8*86400000)/1000);
  if(!Number.isFinite(exp)||exp*1000<=now)throw Error('This booking tracking period has ended.');
  const p=Buffer.from(JSON.stringify({id:job.id,exp,b:binding(job)})).toString('base64url');
  return p+'.'+createHmac('sha256',secret).update('vecta-progress-v1.'+p).digest('base64url');
}
export function verifyProgressToken(token,secret,now=Date.now()){
  if(typeof token!=='string'||token.length>700||!/^[-\w]+\.[-\w]{43}$/.test(token))return null;
  const [p,s]=token.split('.'),expected=createHmac('sha256',secret).update('vecta-progress-v1.'+p).digest(),actual=Buffer.from(s,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{const c=JSON.parse(Buffer.from(p,'base64url').toString());return uuid.test(c.id||'')&&/^[a-f0-9]{64}$/.test(c.b)&&Number.isInteger(c.exp)&&c.exp*1000>now?c:null;}catch{return null;}
}
export function claimMatchesJob(claim,job){return trackable(job)&&claim.id===job.id&&claim.b===binding(job);}
export function trackingUrl(job,{origin='https://www.vectamotors.co.uk',secret=progressSecret(),now=Date.now()}={}){
  return origin+'/track#'+issueProgressToken(job,secret,now);
}
// A receipt link is issued only after the booking request is saved. Its signing
// context is distinct from job links, so request IDs cannot grant job access.
export function requestProgressJob(request){
  return {id:request.id,registration:request.registration,vehicle:request.vehicle,
    booking_date:request.confirmed_date||request.preferred_date_1,customer_email:request.email,
    status:['cancelled','canceled','rejected','declined','archived','deleted'].includes(request.status)?'cancelled':'booked'};
}
export const requestProgressSecret=()=>createHmac('sha256',progressSecret()).update('booking-receipt-v1').digest('hex');
export function requestTrackingPath(request,now=Date.now()){
  return '/track#request.'+issueProgressToken(requestProgressJob(request),requestProgressSecret(),now);
}
export function progressSnapshot(job,{account='',hasInvoice=false,now=Date.now()}={}){
  const status=String(job.status||'').toLowerCase(),staff=String(account).toUpperCase()==='STAFF';
  let stage='waiting',title='Waiting for the workshop',description='Your car is booked in and waiting to enter the workshop.';
  if(job.booking_date>londonDay(now)){stage='scheduled';title='Your booking is confirmed';description='Progress updates will be available on the day of your booking.';}
  else if(status==='in_progress'||status==='in progress'){stage='underway';title='In the workshop';description='Work on your car is underway.';}
  else if(status==='work_complete'){stage='checking';title='Workshop work finished';description='The mechanic has finished. We are preparing your final paperwork. Please wait for confirmation that your car is ready to collect.';}
  else if(['ready_to_invoice','completed','invoiced','invoice_created'].includes(status)){
    stage='ready';title=staff?'Work complete — ready for payment and collection':'Work complete — ready for collection';
    description=hasInvoice?'Your invoice is available below.':staff?'We are preparing your invoice.':'Your car is ready to collect from the workshop.';
  }
  // Explicit allowlist: no work notes, contact data, parts costs or other bookings.
  return {registration:String(job.registration||'').slice(0,12),vehicle:String(job.vehicle||'').slice(0,200),booking_date:job.booking_date,stage,title,description,updated_at:job.updated_at||null};
}
