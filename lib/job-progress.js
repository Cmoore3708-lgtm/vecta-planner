import '../public/js/vecta-visit-rules.js';
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
const trackingPeriod=8*86400000;
const trackingExpiry=job=>Date.parse(job.booking_date+'T00:00:00Z')+trackingPeriod;
function signedBookingDate(claim){
  if(!Number.isSafeInteger(claim?.exp))return null;
  const timestamp=claim.exp*1000-trackingPeriod;
  if(!Number.isSafeInteger(timestamp)||timestamp<0||timestamp>253402214400000||timestamp%86400000!==0)return null;
  return new Date(timestamp).toISOString().slice(0,10);
}
export function progressSecret(){const config=databaseEnvironment({requireService:true});return createHmac('sha256',config.key).update('VECTA customer progress v1\n'+config.url).digest('hex');}
export function issueProgressToken(job,secret,now=Date.now()){
  if(!trackable(job))throw Error('Choose a saved vehicle booking.');
  const exp=Math.floor(trackingExpiry(job)/1000);
  if(!Number.isFinite(exp)||exp*1000<=now)throw Error('This booking tracking period has ended.');
  const p=Buffer.from(JSON.stringify({id:job.id,exp,b:binding(job)})).toString('base64url');
  return p+'.'+createHmac('sha256',secret).update('vecta-progress-v1.'+p).digest('base64url');
}
// Rescheduled links must be checked against the saved job's current expiry by
// claimMatchesJob before returning any customer data. Keep strict expiry as the
// default for callers that only need to verify a newly issued token.
export function verifyProgressToken(token,secret,now=Date.now(),{deferExpiryToJob=false}={}){
  if(typeof token!=='string'||token.length>700||!/^[-\w]+\.[-\w]{43}$/.test(token))return null;
  const [p,s]=token.split('.'),expected=createHmac('sha256',secret).update('vecta-progress-v1.'+p).digest(),actual=Buffer.from(s,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{const c=JSON.parse(Buffer.from(p,'base64url').toString());return uuid.test(c.id||'')&&/^[a-f0-9]{64}$/.test(c.b)&&signedBookingDate(c)&&(deferExpiryToJob||c.exp*1000>now)?c:null;}catch{return null;}
}
export function claimMatchesJob(claim,job,now=Date.now()){
  if(!claim||!trackable(job)||claim.id!==job.id||!(trackingExpiry(job)>now))return false;
  // Existing links already sign an expiry exactly eight days after their
  // original date. Recover that date to verify the ORIGINAL binding, retaining
  // the saved job ID, registration and customer checks after a reschedule.
  const booking_date=signedBookingDate(claim);
  return !!booking_date&&claim.b===binding({...job,booking_date});
}
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
export function progressSnapshot(job,{account='',hasInvoice=false,invoice=null,now=Date.now()}={}){
  const staff=String(account).toUpperCase()==='STAFF';
  const billing=globalThis.VectaVisitRules.invoiceState(invoice,job)||job.visit_billing||(hasInvoice?'due':null);
  const state=globalThis.VectaVisitRules.state(job,{today:londonDay(now),billing,staff});
  const copy={
    scheduled:['scheduled','Your booking is confirmed','We’re preparing everything for your visit, including any parts needed.\n\nOn the day of your booking, check this page to follow your car’s progress. We’ll share your workshop updates here.'],
    missing:['waiting','Awaiting your vehicle','We’re expecting your car at the workshop.'],
    waiting:['waiting','On site · waiting','Your car is on today’s workshop list and is waiting for work to start.'],
    underway:['underway','In the workshop','Work on your car is underway.'],
    checking:['checking','Workshop work finished','We are preparing your final paperwork. Please wait for confirmation that your car is ready to collect.'],
    due:['ready','Work complete — awaiting payment','Your car is ready to collect.'+(hasInvoice?' Your invoice is available below.':'')],
    paid:['ready','Paid — ready for collection','We’ve received your payment. Your car is ready to collect.'],
    ready:['ready','Work complete — ready for collection','Your car is ready to collect from the workshop.'],
    collected:['ready','Vehicle collected',staff&&billing==='due'?'Your car has been collected. Payment is outstanding.':'Your car has been collected. Thank you.']
  };
  const [stage,title,description]=copy[state];
  return {registration:String(job.registration||'').slice(0,12),vehicle:String(job.vehicle||'').slice(0,200),booking_date:job.booking_date,stage,title,description,updated_at:job.updated_at||null};
}
