import {sendBookingBadges} from './_push.js';

function cfg(){return {url:process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY}}
function reg(v){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}
async function rest(url,key,path,method='GET',body){const r=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json().catch(()=>null)}
function primaryType(body){const j=Array.isArray(body.job_types)?body.job_types:[];return body.service_choice||j[0]||'Other'}
function isWeekday(d){const n=d.getUTCDay();return n!==0&&n!==6}
function hasMot(body){return (Array.isArray(body.job_types)?body.job_types:[]).some(x=>/^mot$/i.test(String(x||'').trim()))}
function earliestMotDate(){const d=new Date();d.setUTCHours(12,0,0,0);let skipped=0;while(skipped<4){d.setUTCDate(d.getUTCDate()+1);if(isWeekday(d))skipped++;}do{d.setUTCDate(d.getUTCDate()+1)}while(!isWeekday(d));return d.toISOString().slice(0,10)}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Booking service is not configured'});
 try{
  const b=req.body||{};for(const f of ['customer_name','email','phone','registration','vehicle','work_required'])if(!String(b[f]||'').trim())return res.status(400).json({error:`Missing ${f}`});
  const id=crypto.randomUUID(), jobId=crypto.randomUUID(), confirmed=Boolean(b.appointment_date&&b.appointment_time&&b.technician);
  if(confirmed&&hasMot(b)&&String(b.appointment_date)<earliestMotDate())return res.status(409).json({error:`MOT appointments require at least 4 weekdays' notice. Please choose a later date.`});
  const request={id,customer_name:String(b.customer_name).trim(),email:String(b.email).trim(),phone:String(b.phone).trim(),registration:reg(b.registration),vehicle:String(b.vehicle).trim(),mileage:String(b.mileage||'').trim(),mot_due:b.mot_due||null,job_types:Array.isArray(b.job_types)?b.job_types:[],work_required:String(b.work_required).trim(),preferred_date_1:b.appointment_date||b.preferred_date_1||new Date().toISOString().slice(0,10),preferred_date_2:null,preferred_date_3:null,completion_deadline:String(b.completion_deadline||'').trim(),contact_preference:String(b.contact_preference||'Email'),source:'Website booking',status:'awaiting_review',created_at:new Date().toISOString()};
  await rest(url,key,'website_booking_requests','POST',request);
  await sendBookingBadges();
  if(!confirmed)return res.status(201).json({ok:true,confirmed:false,request_id:id});
  const job={id:jobId,booking_date:b.appointment_date,card_type:'job',registration:reg(b.registration),vehicle:String(b.vehicle).trim(),mot_due:b.mot_due||null,engine_size:String(b.engine_size||'')||null,work_required:String(b.work_required).trim(),customer_name:String(b.customer_name).trim(),customer_phone:String(b.phone).trim(),customer_email:String(b.email).trim(),drop_time:String(b.appointment_time).slice(0,5),technician:String(b.technician),ramp:null,status:'in_progress',job_type:primaryType(b),job_colour:/service/i.test(primaryType(b))?'service':(/^mot$/i.test(primaryType(b))?'mot':'other'),estimated_hours:Number(b.estimated_hours||1),source:'Website booking',sort_order:0,archived:false};
  const sameDay=await rest(url,key,`jobs?select=drop_time,estimated_hours&id=neq.${jobId}&booking_date=eq.${encodeURIComponent(job.booking_date)}&technician=eq.${encodeURIComponent(job.technician)}&archived=eq.false`);
  const start=Number(job.drop_time.slice(0,2))*60+Number(job.drop_time.slice(3,5)), end=start+Math.ceil(job.estimated_hours*60/30)*30;
  const clash=(sameDay||[]).some(x=>{const s=Number(String(x.drop_time||'00:00').slice(0,2))*60+Number(String(x.drop_time||'00:00').slice(3,5)),e=s+Math.ceil(Number(x.estimated_hours||1)*60/30)*30;return start<e&&end>s});
  if(clash)return res.status(409).json({error:'That appointment has just been taken. Please choose another available time.'});
  await rest(url,key,'jobs','POST',job);
  let matches=job.customer_email?await rest(url,key,`customers?select=id&email=eq.${encodeURIComponent(job.customer_email)}&limit=1`):[];if(!matches?.length&&job.customer_phone)matches=await rest(url,key,`customers?select=id&phone=eq.${encodeURIComponent(job.customer_phone)}&limit=1`);
  const customerId=matches?.[0]?.id||crypto.randomUUID();
  if(matches?.length)await rest(url,key,`customers?id=eq.${customerId}`,'PATCH',{name:job.customer_name,phone:job.customer_phone,email:job.customer_email});else await rest(url,key,'customers','POST',{id:customerId,name:job.customer_name,phone:job.customer_phone,email:job.customer_email});
  const vehicleRows=await rest(url,key,`vehicles?select=registration&registration=eq.${encodeURIComponent(job.registration)}&limit=1`);
  if(vehicleRows?.length)await rest(url,key,`vehicles?registration=eq.${encodeURIComponent(job.registration)}`,'PATCH',{customer_id:customerId,vehicle:job.vehicle});else await rest(url,key,'vehicles','POST',{registration:job.registration,customer_id:customerId,vehicle:job.vehicle,notes:'Website booking'});
  await rest(url,key,`website_booking_requests?id=eq.${id}`,'PATCH',{status:'awaiting_review',confirmed_date:b.appointment_date,job_id:jobId,approximate_cost:Number.isFinite(Number(b.approximate_cost))?Number(b.approximate_cost):null});
  return res.status(201).json({ok:true,confirmed:true,request_id:id,job_id:jobId,date:b.appointment_date,time:b.appointment_time});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to complete booking'});}
}
