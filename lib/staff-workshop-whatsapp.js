import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {databaseEnvironment,isTestProject} from '../api/_database-environment.js';
import {londonDay,trackable,trackingUrl,uuid} from './job-progress.js';
import {deliverWhatsapp,whatsappConfig,whatsappNumber,whatsappPermission} from './approval-whatsapp.js';
import {curatedScenes,publishedScenes,sceneIdentity} from './progress-scene-model.js';
import {requestScenePreparation} from './progress-scene-demand.js';

const table='staff_workshop_start_alerts';
const retryable=['queued','waiting_image','failed','unavailable'];
const read=(db,name,params)=>db(name+'?'+new URLSearchParams(params));
const patch=(db,params,body)=>db(table+'?'+new URLSearchParams(params),{method:'PATCH',body:JSON.stringify(body)});
const registration=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const email=value=>String(value||'').trim().toLowerCase();
export const workshopStartedMessage='Good news, your vehicle is now in the workshop. Keep an eye out for any updates.';
export const workshopStartedConfig=(env=process.env)=>env.WHATSAPP_WORKSHOP_STARTED_ENABLED==='1'
 ?whatsappConfig({...env,WHATSAPP_APPROVAL_TEMPLATE:env.WHATSAPP_WORKSHOP_STARTED_TEMPLATE}):null;

async function currentJob(db,row,now){
 const [job]=await read(db,'jobs',{id:'eq.'+row.job_id,select:'*',limit:1});
 if(!job||registration(job.registration)!==row.registration||email(job.customer_email)!==row.customer_email||whatsappNumber(job.customer_phone)!==whatsappNumber(row.customer_phone)||job.booking_date!==row.booking_date)return {state:'contact_changed'};
 if(!trackable(job)||job.archived||job.status!=='in_progress'||job.completed_at)return {state:'closed'};
 // Do not send a delayed "now in the workshop" after the day or two hours end.
 const age=now-Date.parse(row.created_at);
 if(job.booking_date!==londonDay(now)||!Number.isFinite(age)||age<0||age>7200000)return {state:'expired'};
 const [setting]=await read(db,'workshop_settings',{id:'eq.jobcustomer:'+job.id,select:'value',limit:1});
 if(String(setting?.value?.customer_account||job.customer_account||'').trim().toUpperCase()!=='STAFF')return {state:'not_staff'};
 const permission=await whatsappPermission(db,job);
 if(!permission.phone)return {state:'missing_contact'};
 if(!permission.allowed)return {state:'no_permission'};
 return {job,phone:permission.phone};
}

// Only approved, identity-matched scenes are accepted. No arbitrary customer URL
// is fetched; redirects are refused. WhatsApp images must be JPEG/PNG, not WebP.
export async function workshopImage(db,job,now=Date.now()){
 const reg=registration(job.registration),base=databaseEnvironment({requireService:true}).url;
 const rows=await read(db,'workshop_settings',{id:'in.(vehicle_artwork:'+reg+',vehicle_colour:'+reg+',vehicle_identity:'+reg+',progress_scenes_v1:'+reg+')',select:'id,value',limit:4});
 const identity=sceneIdentity(reg,rows),manifest=rows.find(row=>row.id==='progress_scenes_v1:'+reg)?.value;
 if(!identity)return null;
 const scenes=publishedScenes(identity,manifest,base);
 if(curatedScenes(identity))return {local:true};
 if(scenes)return {url:scenes.underway};
 // A consented Staff arrival explicitly requests its image. Reuse the existing
 // cache, budget, quality review and attempt caps; never reset saved drafts.
 if(process.env.VECTA_PROGRESS_SCENES_ENABLED==='1')await requestScenePreparation({db,identity,source:{kind:'job',id:job.id},now});
 return null;
}

export async function uploadWorkshopImage(image,config){
 let bytes;
 if(image.local)bytes=await readFile(new URL('../public/assets/progress/cm14kel-underway.webp',import.meta.url));
 else{
  const response=await fetch(image.url,{redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>10000000)throw Error('Workshop image unavailable');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>10000000)throw Error('Workshop image too large');chunks.push(chunk);}
  bytes=Buffer.concat(chunks);
 }
 const jpeg=await sharp(bytes,{limitInputPixels:20000000}).resize({width:1600,withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
 if(jpeg.length>5000000)throw Error('Workshop image too large');
 const body=new FormData();body.set('messaging_product','whatsapp');body.set('type','image/jpeg');body.set('file',new Blob([jpeg],{type:'image/jpeg'}),'workshop.jpg');
 const response=await fetch(config.url.replace(/\/messages$/,'/media'),{method:'POST',headers:{Authorization:'Bearer '+config.token},body,signal:AbortSignal.timeout(12000)});
 const result=await response.json();
 if(!response.ok||!/^\d+$/.test(result.id||''))throw Error('WhatsApp image upload unavailable');
 return result.id;
}

export async function sendWorkshopStarted(db,jobId,{now=Date.now(),imageFor=workshopImage,upload=uploadWorkshopImage}={}){
 // Previews and an unconfigured channel must never generate paid images or send.
 const config=workshopStartedConfig();
 if(isTestProject()||!config)return 'not_configured';
 if(!uuid.test(jobId||''))return 'unavailable';
 const [row]=await read(db,table,{job_id:'eq.'+jobId,select:'*',limit:1});
 if(!row||!retryable.includes(row.status)||Date.parse(row.next_attempt_at)>now)return row?.status||'unavailable';
 const stamp=new Date(now).toISOString(),lease=randomUUID();
 const claimed=await patch(db,{job_id:'eq.'+jobId,attempts:'eq.'+row.attempts,or:'(lease_until.is.null,lease_until.lt.'+stamp+')'},
  {lease_id:lease,lease_until:new Date(now+300000).toISOString(),attempts:row.attempts+1,next_attempt_at:new Date(now+300000).toISOString(),updated_at:stamp});
 if(!claimed?.length)return 'busy';
 let state='unavailable';
 try{
  const id='workshop-start-wa:'+jobId;
  const [prior]=await read(db,'nmuk_service_reminder_sends',{id:'eq.'+id,select:'status,recipient',limit:1});
  if(['sent','pending'].includes(prior?.status)){state=prior.status;return state;}
  const current=await currentJob(db,row,now);
  if(current.state){state=current.state;return state;}
  if(prior?.recipient&&prior.recipient!==current.phone){state='contact_changed';return state;}
  const image=await imageFor(db,current.job,now);
  if(!image){state='waiting_image';return state;}
  const mediaId=await upload(image,config);
  // Upload may take time: recheck account, status, consent and contact before send.
  const latest=await currentJob(db,row,Math.max(now,Date.now()));
  if(latest.state){state=latest.state;return state;}
  const url=trackingUrl(latest.job);
  state=await deliverWhatsapp(db,{row,job:latest.job,prior,phone:latest.phone,url,id,config,
   text:workshopStartedMessage+'\n\nTrack your car: '+url,subject:row.registration+' — vehicle in the workshop',
   components:[{type:'header',parameters:[{type:'image',image:{id:mediaId}}]},
    {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:new URL(url).hash.slice(1)}]}]});
  return state;
 }finally{
  // If this write fails, the durable provider reservation still prevents a duplicate.
  await patch(db,{job_id:'eq.'+jobId,lease_id:'eq.'+lease},{status:state,lease_id:null,lease_until:null,updated_at:new Date().toISOString()});
 }
}

export async function retryWorkshopStarted(db){
 if(isTestProject()||!workshopStartedConfig())return;
 const rows=await read(db,table,{select:'job_id',status:'in.('+retryable.join(',')+')',next_attempt_at:'lte.'+new Date().toISOString(),order:'next_attempt_at.asc',limit:5});
 await Promise.allSettled(rows.map(row=>sendWorkshopStarted(db,row.job_id)));
}
