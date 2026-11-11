// Explicit operator-only example delivery. Never runs during normal builds.
// Uses production credentials in the hosting environment, without exporting them.
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {databaseEnvironment,isTestProject} from '../api/_database-environment.js';
import {savedBookingImage,confirmationContent} from '../lib/portal-email.js';
import {deliver} from '../lib/nmuk-completion-email.js';
import {trackingUrl,trackable,uuid} from '../lib/job-progress.js';

const {values}=parseArgs({options:{job:{type:'string'},to:{type:'string'},'example-id':{type:'string'},send:{type:'boolean',default:false}}});
const recipients=String(values.to||'').split(',').map(v=>v.trim().toLowerCase());
if(!uuid.test(values.job||'')||!values['example-id']||recipients.length>5||!recipients.every(v=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(v)))throw Error('Specify --job, --to and a stable --example-id. Add --send only when authorised.');
if(isTestProject())throw Error('Example delivery requires the production environment.');
const env=databaseEnvironment({requireService:true});
async function db(path){
  const response=await fetch(env.url+'/rest/v1/'+path,{headers:{apikey:env.key,Authorization:'Bearer '+env.key},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Could not read the saved booking/example.');
  return response.json();
}
const [job]=await db('jobs?'+new URLSearchParams({id:'eq.'+values.job,select:'*',limit:1}));
if(!trackable(job))throw Error('Select a confirmed, saved booking.');
const id='portal-example:'+createHash('sha256').update(JSON.stringify([values['example-id'],job.id,recipients])).digest('hex');
const [previous]=await db('nmuk_service_reminder_sends?'+new URLSearchParams({id:'eq.'+id,select:'status,message_payload,provider_id',limit:1}));
if(previous?.status==='sent'){
  console.log(JSON.stringify({example_id:id,already_sent:true,provider_id:previous.provider_id}));
}else{
  const frozen=previous?.message_payload;
  let content;
  if(frozen){
    content={subject:frozen.subject,text:frozen.text,html:frozen.html,attachments:frozen.attachments};
  }else{
    const image=await savedBookingImage(db,job);
    if(!image)throw Error('The example needs its saved vehicle illustration.');
    content=confirmationContent(job,trackingUrl(job),image);
    content.subject='EXAMPLE — '+content.subject;
  }
  if(!values.send){
    console.log(JSON.stringify({preview_only:true,registration:job.registration,to:recipients,subject:content.subject,has_image:!!content.attachments?.length}));
  }else{
    if(!process.env.RESEND_API_KEY)throw Error('The email service is not configured.');
    const {subject,...body}=content;
    const result=await deliver({id,job,stamp:new Date().toISOString(),to:recipients},content.text,subject,'chris@vectamotors.co.uk',body);
    console.log(JSON.stringify({example_id:id,to:recipients,...result}));
  }
}
