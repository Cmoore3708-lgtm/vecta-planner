import {sendBookingBadges} from './_push.js';
import {databaseEnvironment} from './_database-environment.js';

function cfg(){return databaseEnvironment({requireService:true})}
function reg(v){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}
async function rest(url,key,path,method='GET',body){const r=await fetch(`${url}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json().catch(()=>null)}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Booking service is not configured'});
 try{
  const b=req.body||{};for(const f of ['customer_name','email','phone','registration','vehicle','work_required'])if(!String(b[f]||'').trim())return res.status(400).json({error:`Missing ${f}`});
  const id=crypto.randomUUID();
  // Public submissions are requests only. A planner job must only be created by
  // the workshop's explicit "Accept & create job" action in Workshop Pro.
  const request={id,customer_name:String(b.customer_name).trim(),email:String(b.email).trim(),phone:String(b.phone).trim(),registration:reg(b.registration),vehicle:String(b.vehicle).trim(),mileage:String(b.mileage||'').trim(),mot_due:b.mot_due||null,job_types:Array.isArray(b.job_types)?b.job_types:[],work_required:String(b.work_required).trim(),preferred_date_1:b.appointment_date||b.preferred_date_1||new Date().toISOString().slice(0,10),preferred_date_2:null,preferred_date_3:null,completion_deadline:String(b.completion_deadline||'').trim(),contact_preference:String(b.contact_preference||'Email'),source:'Website booking',status:'awaiting_review',confirmed_date:b.appointment_date||null,approximate_cost:Number.isFinite(Number(b.approximate_cost))?Number(b.approximate_cost):null,created_at:new Date().toISOString()};
  await rest(url,key,'website_booking_requests','POST',request);
  await sendBookingBadges();
  return res.status(201).json({ok:true,confirmed:false,request_id:id,date:b.appointment_date||null,time:b.appointment_time||null});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to complete booking'});}
}
