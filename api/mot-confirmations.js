import {databaseEnvironment} from './_database-environment.js';
import {requireWorkshopLogin} from '../lib/workshop-access.js';
import {address,motSender,motInbox,copyInbox,emailText,parseMotConfirmation,verifyMotWebhook} from '../lib/mot-confirmation.js';

export const config={api:{bodyParser:false}};
const prefix='mot-email:';
const fail=(message,status=503)=>Object.assign(new Error(message),{status});
async function db(path,options={}){
  const {url,key}=databaseEnvironment({requireService:true});
  const response=await fetch(url+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw fail('MOT confirmation records could not be saved or retrieved');
  return response.status===204?null:response.json();
}
async function resend(path,options={}){
  if(!process.env.RESEND_API_KEY)throw fail('Email service is not configured');
  const r=await fetch('https://api.resend.com/'+path,{...options,headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw fail('Email service request failed');return r.json();
}
async function readRaw(req){const chunks=[];let size=0;for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>262144)throw fail('Payload too large',413);chunks.push(bytes)}return Buffer.concat(chunks).toString('utf8')}
export function createMotHandler({database=db,emailApi=resend,login=requireWorkshopLogin,env=process.env}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
   if(req.method==='GET'){
    if(!await login(req,res))return;
    const events=[];let offset=0;
    for(;;){const rows=await database('workshop_settings?select=value&id=like.mot-email%3A*&order=id&limit=500&offset='+offset);events.push(...rows.map(row=>row.value));if(rows.length<500)break;offset+=rows.length;}
    return res.status(200).json({events,configured:!!env.RESEND_MOT_WEBHOOK_SECRET});
   }
   if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
   if(!env.RESEND_MOT_WEBHOOK_SECRET)return res.status(503).json({error:'MOT receiving is not configured'});
   let event;try{event=verifyMotWebhook(await readRaw(req),req.headers,env.RESEND_MOT_WEBHOOK_SECRET)}catch(error){if(error.status===413)throw error;return res.status(401).json({error:'Invalid email webhook'})}
   if(event.type!=='email.received')return res.status(200).json({ignored:true});
   const id=String(event.data?.email_id||'');if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:'Invalid email ID'});
   const saved=(await database('workshop_settings?select=value&id=eq.'+prefix+id))?.[0]?.value;
   if(saved?.forwarded)return res.status(200).json({ok:true,duplicate:true});
   // Fetch the original from the provider; never trust text supplied in a webhook.
   const email=await emailApi('emails/receiving/'+id);
   if(address(email.from)!==motSender||!(email.to||[]).some(to=>address(to)===motInbox))return res.status(200).json({ignored:true});
   const authenticated=email.authentication?.dkim==='pass'&&email.authentication?.dmarc!=='fail';
   const parsed=parseMotConfirmation(email),record={...parsed,email_id:id,received_at:email.created_at||event.created_at,forwarded:false};
   if(!record.received_at||!Number.isFinite(Date.parse(record.received_at)))throw fail('Missing received timestamp');
   // An authenticated sender is required both for automatic green and for forwarding.
   if(!authenticated)record.state='review';
   await database('workshop_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:prefix+id,value:record,updated_at:new Date().toISOString()})});
   if(!authenticated)return res.status(200).json({ok:true,review:true});
   const forwarded=await emailApi('emails',{method:'POST',headers:{'Idempotency-Key':'mot-copy-'+id},body:JSON.stringify({from:copyInbox,to:[copyInbox],reply_to:motSender,subject:('MOT centre: '+String(email.subject||'Booking confirmation')).slice(0,200),text:'Copy of the MOT centre email received by Workshop Pro.\n\n'+emailText(email)})});
   if(!forwarded.id)throw fail('Email copy was not accepted');
   await database('workshop_settings?id=eq.'+prefix+id,{method:'PATCH',body:JSON.stringify({value:{...record,forwarded:true,forwarded_id:forwarded.id},updated_at:new Date().toISOString()})});
   return res.status(200).json({ok:true,state:record.state});
  }catch(error){console.error('MOT email processing failed:',error.message);return res.status(error.status||503).json({error:'MOT email processing could not complete. Retry required.'})}
 };
}
export default createMotHandler();
