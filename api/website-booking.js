import {sendBookingBadges} from './_push.js';
import {databaseEnvironment} from './_database-environment.js';

function cfg(){return databaseEnvironment({requireService:true})}
function reg(v){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}
async function rest(url,key,path,method='GET',body,prefer='return=representation'){const r=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:prefer},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json().catch(()=>null)}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Booking service is not configured'});
 try{
  const b=req.body||{};for(const f of ['customer_name','email','phone','registration','vehicle','work_required'])if(!String(b[f]||'').trim())return res.status(400).json({error:`Missing ${f}`});
  const id=b.request_id||crypto.randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid booking request identity'});
  // Public submissions are requests only. A planner job must only be created by
  // the workshop's explicit "Accept & create job" action in Workshop Pro.
  const request={id,customer_name:String(b.customer_name).trim(),email:String(b.email).trim(),phone:String(b.phone).trim(),registration:reg(b.registration),vehicle:String(b.vehicle).trim(),mileage:String(b.mileage||'').trim(),mot_due:b.mot_due||null,job_types:Array.isArray(b.job_types)?b.job_types:[],work_required:String(b.work_required).trim(),preferred_date_1:b.appointment_date||b.preferred_date_1||new Date().toISOString().slice(0,10),preferred_date_2:null,preferred_date_3:null,completion_deadline:String(b.completion_deadline||'').trim(),contact_preference:String(b.contact_preference||'Email'),source:'Website booking',status:'awaiting_review',confirmed_date:b.appointment_date||null,approximate_cost:Number.isFinite(Number(b.approximate_cost))?Number(b.approximate_cost):null,created_at:new Date().toISOString()};
  // The primary key makes concurrent retries atomic without overwriting a request.
  const inserted=await rest(url,key,'website_booking_requests?on_conflict=id','POST',request,'resolution=ignore-duplicates,return=representation');
  const created=Array.isArray(inserted)&&inserted.length>0;
  if(!created){
   const rows=await rest(url,key,`website_booking_requests?id=eq.${id}&limit=1`);
   const existing=rows?.[0];
   const fields=['customer_name','email','phone','registration','vehicle','mileage','mot_due','job_types','work_required','preferred_date_1','completion_deadline','contact_preference','approximate_cost'];
   if(!existing||fields.some(field=>JSON.stringify(existing[field])!==JSON.stringify(request[field])))return res.status(409).json({error:'This request identity belongs to different booking details'});
  }
  if(created)await sendBookingBadges();
  return res.status(created?201:200).json({ok:true,confirmed:false,request_id:id,date:b.appointment_date||null,time:b.appointment_time||null});
 }catch(e){if(String(e.message).includes('VECTA_BOOKING_MONDAY'))return res.status(409).json({error:'Mondays are not available for online bookings. Please choose another day.'});if(String(e.message).includes('VECTA_BOOKING_FRIDAY_CAPACITY'))return res.status(409).json({error:'Alfie’s Friday online booking capacity is now full. Please choose another date.'});console.error(e);return res.status(500).json({error:'Unable to complete booking'});}
}
