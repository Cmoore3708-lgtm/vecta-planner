import {databaseEnvironment} from './_database-environment.js';
import {buildStaffReminderQueue,normalizeRegistration,reminderContent,validEmail} from '../lib/staff-reminders.js';
async function db(path,options={}){
 const {url,key}=databaseEnvironment({requireService:true});
 const r=await fetch(`${String(url).replace(/\/$/,'')}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'content-type':'application/json',...(options.headers||{})}});
 const body=await r.json().catch(()=>null); if(!r.ok)throw Error(`Database ${r.status}: ${body?.message||body?.error||'request failed'}`); return body;
}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function data(){
 const d=today();
 const [fleetRows,jobs,sends]=await Promise.all([
  db('workshop_settings?select=value&id=eq.fleet_state_v77'),
  db(`jobs?select=id,registration,booking_date,archived,status,job_type,work_required&booking_date=gte.${d}&limit=5000`),
  db('staff_reminder_sends?select=registration,kind,due_date,stage,status&limit=5000').catch(()=>[])
 ]);
 const vehicles=fleetRows?.[0]?.value?.vehicles||[];
 return {date:d,queue:buildStaffReminderQueue(vehicles,jobs||[],sends||[],d)};
}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET or POST required'});
 if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized'});
 try{
  const state=await data();
  if(req.method==='GET')return res.status(200).json(state);
  if(process.env.VERCEL_ENV!=='production')return res.status(409).json({error:'Staff reminder sending is disabled outside production.',queue:state.queue});
  const wanted=state.queue.find(x=>normalizeRegistration(x.registration)===normalizeRegistration(req.body?.registration)&&x.kind===req.body?.kind&&x.stage===req.body?.stage);
  if(!wanted)return res.status(409).json({error:'Reminder is no longer eligible. Refresh the queue.'});
  if(!wanted.canSend||!validEmail(wanted.email))return res.status(422).json({error:'No valid staff email address.'});
  if(!process.env.RESEND_API_KEY)return res.status(503).json({error:'Email sender not configured'});
  const id=[wanted.registration,wanted.kind,wanted.due,wanted.stage].join(':');
  try{await db('staff_reminder_sends',{method:'POST',body:JSON.stringify({id,registration:wanted.registration,kind:wanted.kind,due_date:wanted.due,stage:wanted.stage,recipient:wanted.email,status:'pending'})});}
  catch(e){if(/409|23505/.test(String(e)))return res.status(409).json({error:'This reminder has already been reserved or sent.'});throw e;}
  const content=reminderContent(wanted);
  try{
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:'Chris@Nissan-Fleet.co.uk',to:[wanted.email],...content})});
   if(!r.ok)throw Error(`Email provider ${r.status}`); const result=await r.json();
   await db(`staff_reminder_sends?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'sent',provider_id:result.id,sent_at:new Date().toISOString()})});
   return res.status(200).json({sent:true,item:wanted});
  }catch(e){await db(`staff_reminder_sends?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:String(e)})});throw e;}
 }catch(e){return res.status(500).json({error:String(e)});}
}
