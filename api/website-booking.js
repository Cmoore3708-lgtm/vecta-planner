import {bookingPhotos,readBookingPhotos} from './_booking-photos.js';
import {bookingTypes} from '../lib/booking-input.js';
import {sendBookingBadges} from './_push.js';
import {databaseEnvironment} from './_database-environment.js';
import {bookingServicePrice} from '../lib/booking-service-price.js';

function cfg(){return databaseEnvironment({requireService:true})}
function reg(v){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}
async function rest(url,key,path,method='GET',body,prefer='return=representation'){const r=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:prefer},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json().catch(()=>null)}
export default async function handler(req,res){
 const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Booking service is not configured'});
 if(req.method==='GET'&&req.query?.photos)return readBookingPhotos(req,res,{url,key});
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const b=req.body||{};for(const f of ['customer_name','email','phone','registration','vehicle','work_required'])if(!String(b[f]||'').trim())return res.status(400).json({error:`Missing ${f}`});
  for(const [field,limit] of Object.entries({customer_name:200,email:254,phone:40,registration:12,vehicle:200,work_required:10000,mileage:20,completion_deadline:500,contact_preference:30})){
   if(b[field]!=null&&(typeof b[field]!=='string'||b[field].length>limit))return res.status(400).json({error:'Invalid '+field});
  }
  const photos=bookingPhotos(b.work_photos);
  const types=bookingTypes(b);
  let servicePrice;
  try {servicePrice=bookingServicePrice(b,types);}catch{return res.status(409).json({error:'Your service price has expired or the service details have changed. Please review the service price and try again.'});}
  const appointment=String(b.appointment_date||b.preferred_date_1||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(appointment)||!Number.isFinite(Date.parse(appointment+'T12:00:00Z'))||new Date(appointment+'T12:00:00Z').toISOString().slice(0,10)!==appointment)return res.status(400).json({error:'Choose an available appointment date'});
  if(b.appointment_time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(b.appointment_time)))return res.status(400).json({error:'Invalid appointment time'});
  const id=b.request_id||crypto.randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid booking request identity'});
  // Public submissions are requests only. A planner job must only be created by
  // the workshop's explicit "Accept & create job" action in Workshop Pro.
  const request={id,customer_name:String(b.customer_name).trim(),email:String(b.email).trim(),phone:String(b.phone).trim(),registration:reg(b.registration),vehicle:String(b.vehicle).trim(),mileage:String(b.mileage||'').trim(),mot_due:b.mot_due||null,job_types:types,work_required:String(b.work_required).trim(),preferred_date_1:appointment,preferred_date_2:null,preferred_date_3:null,completion_deadline:String(b.completion_deadline||'').trim(),contact_preference:String(b.contact_preference||'Email'),source:'Website booking',status:'awaiting_review',confirmed_date:appointment,confirmed_time:b.appointment_time||null,approximate_cost:Number.isFinite(Number(b.approximate_cost))?Number(b.approximate_cost):null,created_at:new Date().toISOString()};
  // The primary key makes concurrent retries atomic without overwriting a request.
  if(servicePrice){request.approximate_cost=servicePrice.approximateCost;request.work_required+=servicePrice.snapshot;}
  const inserted=photos.length
   ? await rest(url,key,'rpc/insert_website_booking_with_photos','POST',{p_request:request,p_photos:photos})
   : await rest(url,key,'website_booking_requests?on_conflict=id','POST',request,'resolution=ignore-duplicates,return=representation');
  const created=Array.isArray(inserted)&&inserted.length>0;let receipt=inserted?.[0];
  if(!created){
   const rows=await rest(url,key,`website_booking_requests?id=eq.${id}&limit=1`);
   const existing=rows?.[0];receipt=existing;
   const fields=['customer_name','email','phone','registration','vehicle','mileage','mot_due','job_types','work_required','preferred_date_1','completion_deadline','contact_preference','approximate_cost'];
   if(photos.length!==Number(existing?.work_photo_count||0))return res.status(409).json({error:'This request identity belongs to different booking photos'});
   if(photos.length){const saved=await rest(url,key,`website_booking_photos?request_id=eq.${id}&select=photos&limit=1`);if(JSON.stringify(saved?.[0]?.photos)!==JSON.stringify(photos))return res.status(409).json({error:'This request identity belongs to different booking photos'});}
   if(!existing||(b.appointment_time&&String(existing.confirmed_time||'').slice(0,5)!==b.appointment_time)||fields.some(field=>JSON.stringify(existing[field])!==JSON.stringify(request[field])))return res.status(409).json({error:'This request identity belongs to different booking details'});
  }
  if(created)await sendBookingBadges();
  return res.status(created?201:200).json({ok:true,confirmed:false,request_id:id,date:receipt?.confirmed_date||appointment,time:String(receipt?.confirmed_time||b.appointment_time||'').slice(0,5)||null});
 }catch(e){if(e.code==='BOOKING_INPUT')return res.status(400).json({error:e.message});if(String(e.message).includes('VECTA_BOOKING_UNAVAILABLE'))return res.status(409).json({error:'That appointment is no longer available or does not meet the booking notice period. Please choose another available date.'});if(String(e.message).includes('VECTA_BOOKING_MONDAY'))return res.status(409).json({error:'Mondays are not available for online bookings. Please choose another day.'});if(String(e.message).includes('VECTA_BOOKING_FRIDAY_CAPACITY'))return res.status(409).json({error:'Alfie’s Friday online booking capacity is now full. Please choose another date.'});console.error(e);return res.status(500).json({error:'Unable to complete booking'});}
}
