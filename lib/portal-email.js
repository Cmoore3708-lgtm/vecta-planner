import {createHash} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {trackingUrl,trackable} from './job-progress.js';
import {customerWork} from './customer-portal.js';
import {storedImageSource} from './haynes-image-source.js';
import {sceneModelSvg} from './progress-scene-svg.js';
import {deliver} from './nmuk-completion-email.js';
const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const portalEmailWording='Your personalised customer portal lets you make amendments to your booking, request additional work and message us. On the day of your booking, you can view the full progress of your car. Open your portal below.';
export function confirmationContent(job,link,image=null){
 const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(job.booking_date+'T12:00:00Z'));
 const amount=job.amount_quoted==null?'To be confirmed':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(job.amount_quoted))+(job.vat_mode==='ex_vat'?' + VAT':job.vat_mode==='no_vat'?' (no VAT)':' including VAT');
 const work=customerWork(job.work_required||job.job_type),subject='Vecta booking confirmation — '+job.registration;
 const text='Your booking is confirmed\n\n'+job.registration+' · '+(job.vehicle||'')+'\n'+date+'\n\n'+work+'\n\nEstimated cost: '+amount+'\n\n'+portalEmailWording+'\n'+link+'\n\nYou can cancel online up to 24 hours before your booking, giving a reason.\n\nPlease park in a designated customer space and leave your keys at reception, or use the Key Drop letterbox before we open. Leave your service book (if required) and locking wheel nut key on the passenger seat.\n\nKind regards,\nChris\nVecta Motors\n07721 722622';
 const html='<html><body style="margin:0;background:#f4f3f0;font-family:Arial,sans-serif;color:#202323"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="580" style="max-width:100%;background:#ffffff;border-radius:16px" cellspacing="0" cellpadding="28"><tr><td style="border-bottom:1px solid #e7e4df"><strong style="font-size:30px;letter-spacing:5px;color:#ba172c">VECTA</strong><p style="color:#777;font-size:11px;letter-spacing:2px">YOUR PERSONALISED CUSTOMER PORTAL</p><h1 style="font-size:27px">Your booking is confirmed</h1><p style="font-size:20px;font-weight:bold">'+escape(job.registration)+' · '+escape(job.vehicle)+'</p><p>'+escape(date)+'</p>'+(image?'<img src="cid:booking-vehicle" alt="'+escape(job.vehicle||'Your vehicle')+'" width="480" style="width:100%;max-width:480px;height:auto">':'')+'<p style="white-space:pre-line;line-height:1.6">'+escape(work)+'</p><p><b>Estimated cost: '+escape(amount)+'</b></p></td></tr><tr><td style="line-height:1.7"><p>'+portalEmailWording+'</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#bd1830" style="border-radius:8px"><a href="'+escape(link)+'" style="display:inline-block;padding:15px 45px;color:#fff;text-decoration:none;font-weight:bold;letter-spacing:2px">HERE</a></td></tr></table><p style="font-size:13px;color:#666">You can cancel online up to 24 hours before your booking, giving a reason.</p><p>Please park in a designated customer space and leave your keys at reception, or use the Key Drop letterbox before we open.</p><p>Leave your service book (if required) and locking wheel nut key on the passenger seat.</p><p>Kind regards,<br>Chris<br><b>Vecta Motors</b><br>07721 722622</p></td></tr></table></td></tr></table></body></html>';
 return {text,html,subject,...(image?{attachments:[{filename:'your-vehicle.png',content:image,content_id:'booking-vehicle'}]}:{})};
}
async function savedImage(db,job){
 try{
  const reg=String(job.registration).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const [art]=await db('workshop_settings?'+new URLSearchParams({id:'eq.vehicle_artwork:'+reg,select:'value',limit:1}));
  const asset=String(art?.value?.imageUrl||'').match(/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/(\d{1,12}\.svgz?)$/)?.[1];
  if(!asset)return null;
  const source=await storedImageSource(asset);if(!source)return null;
  const {Resvg}=await import('@resvg/resvg-js');
  const bytes=new Resvg(sceneModelSvg(source),{fitTo:{mode:'width',value:720},background:'#ffffff'}).render().asPng();
  return bytes.length<=750000?Buffer.from(bytes).toString('base64'):null;
 }catch{return null;}
}
export async function bookingConfirmation(db,job,send=false){
 if(!trackable(job))throw Object.assign(Error('Save and confirm the booking first.'),{status:409});
 const to=String(job.customer_email||'').trim();if(!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(to))throw Object.assign(Error('Save a valid customer email first.'),{status:400});
 const link=trackingUrl(job),id='portal-confirmation:'+createHash('sha256').update(job.id+':'+job.booking_date+':'+to.toLowerCase()).digest('hex');
 const [previous]=await db('nmuk_service_reminder_sends?'+new URLSearchParams({id:'eq.'+id,select:'status,message_payload',limit:1}));
 const frozen=previous?.message_payload;
 const content=frozen?{text:frozen.text,html:frozen.html,subject:frozen.subject,...(frozen.attachments?{attachments:frozen.attachments}:{})}:confirmationContent(job,link,await savedImage(db,job));
 if(!send)return {email:to,subject:content.subject,html:content.html.replace('cid:booking-vehicle','data:image/png;base64,'+(content.attachments?.[0]?.content||'')),text:content.text,test:isTestProject(),status:previous?.status||'unsent',has_image:!!content.attachments};
 if(isTestProject())throw Object.assign(Error('Test preview only. No customer email has been sent.'),{status:409});
 if(!process.env.RESEND_API_KEY)throw Object.assign(Error('Email service is not configured.'),{status:503});
 const {subject,...body}=content;
 return deliver({id,job,stamp:new Date().toISOString(),to:[to]},content.text,subject,'chris@vectamotors.co.uk',body);
}
