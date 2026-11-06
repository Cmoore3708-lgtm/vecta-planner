import {isDeepStrictEqual} from 'node:util';
import {bookingAnalyticsReceipt} from '../lib/website-analytics-receipt.js';
import {waitUntil} from '@vercel/functions';
import {processBookingReceipts,receiptRpc} from '../lib/booking-receipts.js';
import {managerAuthorised} from './message-centre.js';
import {bookingPhotos,readBookingPhotos} from './_booking-photos.js';
import {bookingTypes} from '../lib/booking-input.js';
import {sendBookingBadges} from './_push.js';
import {databaseEnvironment} from './_database-environment.js';
import {bookingServicePrice} from '../lib/booking-service-price.js';
import {bookingTyreParts} from '../lib/tyre-cost-token.js';
import {bookingServiceParts} from '../lib/booking-service-parts.js';
import {bookingServiceExtra,serviceExtraSnapshot} from '../lib/service-extras.js';
import {requestProgressJob,requestTrackingPath} from '../lib/job-progress.js';

const miniValetLine='\n\nMini valet · £30 including VAT: snow-foam pressure wash, hoover inside, Dashboard & Media screens cleaned.';
function cfg(){return databaseEnvironment({requireService:true})}
function reg(v){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}
async function rest(url,key,path,method='GET',body,prefer='return=representation'){const r=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:prefer},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json().catch(()=>null)}
// Compare the values Postgres persists, including JSONB objects whose keys may be reordered.
function sameBookingField(field, saved, submitted) {
  if (field === 'gsf_parts') return isDeepStrictEqual(saved ?? [], submitted ?? []);
  if (field === 'approximate_cost' && saved != null && submitted != null) {
    return Number(saved) === Number(submitted);
  }
  return isDeepStrictEqual(saved ?? null, submitted ?? null);
}
export default async function handler(req,res){
 if(req.method==='GET'&&req.query?.receipts==='1'){
  if(!process.env.CRON_SECRET||req.headers?.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).json({error:'Unauthorized'});
  try{return res.status(200).json(await processBookingReceipts());}catch{return res.status(503).json({error:'Receipt delivery will retry on the next run.'});}
 }
 const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Booking service is not configured'});
 if(req.method==='GET'&&req.query?.receiptIssues==='1'){
  res.setHeader('Cache-Control','no-store');
  if(!await managerAuthorised(req))return res.status(401).json({error:'Manager sign-in required.'});
  try{
   const params=new URLSearchParams({select:'id,status,created_at,error,snapshot',status:'in.(pending,sending,failed,needs_review)',order:'created_at.asc',limit:'50'});
   const rows=await rest(url,key,'website_booking_receipts?'+params);
   return res.status(200).json({receipts:(rows||[]).map(r=>({id:r.id,status:r.status,created_at:r.created_at,error:r.error,registration:r.snapshot?.registration,email:r.snapshot?.email,date:r.snapshot?.confirmed_date}))});
  }catch{return res.status(503).json({error:'Email delivery details unavailable.'});}
 }
 if(req.method==='GET'&&req.query?.photos)return readBookingPhotos(req,res,{url,key});
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const b=req.body||{};for(const f of ['customer_name','email','phone','registration','vehicle','work_required'])if(!String(b[f]||'').trim())return res.status(400).json({error:`Missing ${f}`});
  for(const [field,limit] of Object.entries({customer_name:200,email:254,phone:40,registration:12,vehicle:200,work_required:10000,mileage:20,completion_deadline:500,contact_preference:30})){
   if(b[field]!=null&&(typeof b[field]!=='string'||b[field].length>limit))return res.status(400).json({error:'Invalid '+field});
  }
  const photos=bookingPhotos(b.work_photos);
  const types=bookingTypes(b);
  const extra=bookingServiceExtra(b);
  let servicePrice;
  try {servicePrice=bookingServicePrice(b,types);}catch{return res.status(409).json({error:'Your service price has expired or the service details have changed. Please review the service price and try again.'});}
  let tyreParts;
  try{tyreParts=bookingTyreParts(b,types);}catch{return res.status(409).json({error:'Your tyre selection has changed or expired. Please refresh the tyre prices and try again.'});}
  const appointment=String(b.appointment_date||b.preferred_date_1||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(appointment)||!Number.isFinite(Date.parse(appointment+'T12:00:00Z'))||new Date(appointment+'T12:00:00Z').toISOString().slice(0,10)!==appointment)return res.status(400).json({error:'Choose an available appointment date'});
  if(b.appointment_time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(b.appointment_time)))return res.status(400).json({error:'Invalid appointment time'});
  const id=b.request_id||crypto.randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid booking request identity'});
  // The database reserves a one-hour provisional planner job atomically.
  // Only the workshop can confirm it internally. The successful reservation confirms the customer’s appointment.
  const suppliedTotal=b.approximate_cost;
  const hasTotal=(typeof suppliedTotal==='number'||(typeof suppliedTotal==='string'&&suppliedTotal.trim()!==''))&&Number.isFinite(Number(suppliedTotal))&&Number(suppliedTotal)>=0;
  const request={id,customer_name:String(b.customer_name).trim(),email:String(b.email).trim(),phone:String(b.phone).trim(),registration:reg(b.registration),vehicle:String(b.vehicle).trim(),mileage:String(b.mileage||'').trim(),mot_due:b.mot_due||null,job_types:types,work_required:String(b.work_required).trim(),preferred_date_1:appointment,preferred_date_2:null,preferred_date_3:null,completion_deadline:String(b.completion_deadline||'').trim(),contact_preference:String(b.contact_preference||'Email'),source:'Website booking',status:'awaiting_review',confirmed_date:appointment,confirmed_time:b.appointment_time||null,approximate_cost:hasTotal?Number(suppliedTotal):null,created_at:new Date().toISOString()};
  // The primary key makes concurrent retries atomic without overwriting a request.
  if(servicePrice){
   request.approximate_cost=servicePrice.approximateCost;request.work_required+=servicePrice.snapshot;
   const quote=servicePrice.quote;
   const filter=new URLSearchParams({status:'eq.MATCHED','request->>registration':'eq.'+quote.request.registration,'request->>range':'eq.'+quote.request.range,'result->>checkedAt':'eq.'+quote.checkedAt,select:'result',limit:'5'});
   const costs=quote.costSnapshot?[]:await rest(url,key,'gsf_service_jobs?'+filter);
   request.gsf_parts=bookingServiceParts(quote,costs||[]);
  }
  if(tyreParts.length)request.gsf_parts=[...(request.gsf_parts||[]),...tyreParts];
  // The website supplies the base estimate. Apply the fixed valet price after verifying any service quote.
  const baseEstimate=request.approximate_cost;
  if(b.mini_valet===true){
   // Keep the paid extra in the receipt and distinguish this from an MOT-only job.
   request.job_types=[...types,'Mini valet'];
   request.approximate_cost=(Math.round((baseEstimate||0)*100)+3000)/100;
   request.work_required+=miniValetLine;
  }
  if(!servicePrice){
   if(types.some(type=>/Service|Oil & Filter/i.test(type))&&baseEstimate>0)request.work_required+='\n\nBooking guide total: £'+request.approximate_cost.toFixed(2)+' including VAT.\nGuide price based on engine size.';
   request.work_required+=serviceExtraSnapshot(extra,null);
  }
  const inserted=photos.length
   ? await rest(url,key,'rpc/insert_website_booking_with_photos','POST',{p_request:request,p_photos:photos})
   : await rest(url,key,'website_booking_requests?on_conflict=id','POST',request,'resolution=ignore-duplicates,return=representation');
  const created=Array.isArray(inserted)&&inserted.length>0;let receipt=inserted?.[0];
  if(!created){
   const rows=await rest(url,key,`website_booking_requests?id=eq.${id}&limit=1`);
   const existing=rows?.[0];receipt=existing;
   // A retry can straddle the wording change. Compare the generated note only,
   // so an edit to the customer's own description still conflicts.
   if(b.mini_valet===true && existing && existing.work_required!==request.work_required){
    const customerWork=b.work_required.trim();
    const previousLine=miniValetLine.replace('Dashboard & Media','dash &');
    const previousWork=customerWork+request.work_required.slice(customerWork.length).replace(miniValetLine,previousLine);
    if(existing.work_required===previousWork)request.work_required=previousWork;
   }
   // Earlier bookings recorded the valet in work_required only. The work and price still have to match.
   const comparison=b.mini_valet===true&&Array.isArray(existing?.job_types)&&!existing.job_types.includes('Mini valet')
    ? {...request,job_types:types} : request;
   const fields=['customer_name','email','phone','registration','vehicle','mileage','mot_due','job_types','work_required','preferred_date_1','completion_deadline','contact_preference','approximate_cost','gsf_parts'];
   if(photos.length!==Number(existing?.work_photo_count||0))return res.status(409).json({error:'This request identity belongs to different booking photos'});
   if(photos.length){const saved=await rest(url,key,`website_booking_photos?request_id=eq.${id}&select=photos&limit=1`);if(!isDeepStrictEqual(saved?.[0]?.photos,photos))return res.status(409).json({error:'This request identity belongs to different booking photos'});}
   if(!existing||(b.appointment_time&&String(existing.confirmed_time||'').slice(0,5)!==b.appointment_time)||fields.some(field=>!sameBookingField(field,existing[field],comparison[field])))return res.status(409).json({error:'This request identity belongs to different booking details'});
   if(requestProgressJob(existing).status==='cancelled')return res.status(409).json({error:'This booking has been cancelled. Please choose an available date to book again.'});
  }
  // A saved booking is successful even if push or email is slow or unavailable.
  if(created)waitUntil(sendBookingBadges());
  let receipt_email='unavailable';
  try{const status=await receiptRpc('status',id);if(status?.status)receipt_email=status.status;}catch{/* Keep the saved booking successful. */}
  if(['pending','failed'].includes(receipt_email))waitUntil(processBookingReceipts({id,limit:1}).catch(()=>console.warn('Booking receipt retained for retry.')));
  let tracking_url;try{tracking_url=requestTrackingPath(receipt||request);}catch{/* A past receipt must not turn a saved booking into a failed submission. */}
  let analytics_receipt;try{analytics_receipt=bookingAnalyticsReceipt(receipt||request,key);}catch{/* Analytics must never affect a saved booking. */}
  return res.status(created?201:200).json({analytics_receipt,receipt_email,ok:true,confirmed:false,request_id:id,date:receipt?.confirmed_date||appointment,time:String(receipt?.confirmed_time||b.appointment_time||'').slice(0,5)||null,tracking_url});
 }catch(e){if(e.message==='INVALID_SERVICE_EXTRA')return res.status(400).json({error:'Select a valid optional service item.'});if(e.code==='BOOKING_INPUT')return res.status(400).json({error:e.message});if(String(e.message).includes('VECTA_BOOKING_UNAVAILABLE'))return res.status(409).json({error:'That appointment is no longer available or does not meet the booking notice period. Please choose another available date.'});if(String(e.message).includes('VECTA_BOOKING_MONDAY'))return res.status(409).json({error:'Mondays are not available for online bookings. Please choose another day.'});if(String(e.message).includes('VECTA_BOOKING_FRIDAY_CAPACITY'))return res.status(409).json({error:'Alfie’s Friday online booking capacity is now full. Please choose another date.'});console.error(e);return res.status(500).json({error:'Unable to complete booking'});}
}
