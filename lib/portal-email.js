import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isTestProject} from '../api/_database-environment.js';
import {trackingUrl,trackable} from './job-progress.js';
import {customerWork} from './customer-portal.js';
import {storedImageSource} from './haynes-image-source.js';
import {paintedVehicleSvg} from './vehicle-paint-svg.js';
import {normaliseReg, imageUrl, vehicleMatches} from './haynes-vehicle.js';
import {deliver} from './nmuk-completion-email.js';
const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const portalEmailWording='Your personalised customer portal lets you make amendments to your booking, request additional work and message us. On the day of your booking, you can view the full progress of your car. Open your portal below.';
const logoImage=readFileSync(new URL('../public/assets/vecta-header.png',import.meta.url)).toString('base64');
const authorisationText='If we discover any additional work that requires doing we will contact you via your customer portal for authorisation first, so please check your phone/email when possible.';
export function confirmationContent(job,link,image=null){
 const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(job.booking_date+'T12:00:00Z'));
 const amount=job.amount_quoted==null?'To be confirmed':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(job.amount_quoted))+(job.vat_mode==='ex_vat'?' + VAT':job.vat_mode==='no_vat'?' (no VAT)':' including VAT');
 const work=customerWork(job.work_required||job.job_type),subject='Vecta booking confirmation — '+job.registration;
 const text='Your booking is confirmed\n\n'+job.registration+' · '+(job.vehicle||'')+'\n'+date+'\n\nJob Description\n'+work+'\n\nEstimated cost: '+amount+'\n\n'+portalEmailWording+'\n'+link+'\n\nYou can cancel online up to 24 hours before your booking, giving a reason.\n\n'+authorisationText+'\n'+link+'\n\nPlease park in a designated customer space and leave your keys at reception, or use the Key Drop letterbox before we open. Leave your service book (if required) and locking wheel nut key on the passenger seat.\n\nKind regards,\nChris\nVecta Motors\n07721 722622';
 const plate='<table role="presentation" cellspacing="0" cellpadding="0" style="border:2px solid #111111;border-radius:7px;border-spacing:0;background:#ffd83d"><tr><td bgcolor="#0752a5" align="center" width="28" style="padding:8px 3px;color:#ffffff;font-size:11px;font-weight:900;line-height:24px">GB</td><td bgcolor="#ffd83d" style="padding:7px 10px;color:#111111;font-size:22px;font-weight:900;line-height:26px;letter-spacing:1px;white-space:nowrap">'+escape(normaliseReg(job.registration))+'</td></tr></table>';
 const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:Arial,sans-serif;color:#202323">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:16px 8px">
<!--[if mso]><table role="presentation" width="580" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<div style="max-width:580px;margin:0 auto"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;border-radius:12px;text-align:left">
<tr><td align="center" bgcolor="#000000" style="padding:12px 20px;border-radius:12px 12px 0 0;background:#000000;text-align:center"><img src="cid:booking-logo" alt="VECTA — Vehicle Servicing and repairs" width="280" border="0" style="display:inline-block;width:280px;max-width:100%;height:auto;vertical-align:middle"></td></tr>
<tr><td align="left" style="padding:18px 20px 12px;text-align:left">
<p style="margin:0 0 7px;color:#777777;font-size:10px;line-height:14px;letter-spacing:1.5px">YOUR PERSONALISED CUSTOMER PORTAL</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:29px">Your booking is confirmed</h1>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td valign="top"${image?' width="56%"':''} style="padding:0${image?' 10px':''} 0 0">${plate}
<p style="margin:8px 0 4px;font-size:15px;font-weight:bold;line-height:20px">${escape(job.vehicle)}</p>
<p style="margin:0;font-size:13px;line-height:19px">${escape(date)}</p></td>
${image?'<td width="44%" align="right" valign="top" style="padding:0"><img src="cid:booking-vehicle" alt="'+escape(job.vehicle||'Your vehicle')+'" width="240" border="0" style="display:block;width:100%;max-width:240px;height:auto"></td>':''}
</tr></table>
<h2 style="margin:16px 0 5px;font-size:15px;line-height:20px">Job Description</h2>
<p style="margin:0 0 10px;white-space:pre-line;font-size:14px;line-height:21px">${escape(work).replace(/\r?\n/g,'<br>')}</p>
<p style="margin:0;font-size:14px;line-height:21px"><b>Estimated cost: ${escape(amount)}</b></p>
</td></tr>
<tr><td align="left" style="text-align:left;padding:14px 20px 18px;border-top:1px solid #e7e4df;font-size:14px;line-height:21px">
<p style="margin:0 0 12px">${portalEmailWording}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#bd1830" style="border-radius:7px"><a href="${escape(link)}" style="display:inline-block;padding:11px 38px;color:#ffffff;text-decoration:none;font-weight:bold;letter-spacing:2px">HERE</a></td></tr></table>
<p style="margin:10px 0;color:#666666;font-size:12px;line-height:18px">You can cancel online up to 24 hours before your booking, giving a reason.</p>
<p style="margin:0 0 10px">${escape(authorisationText).replace('customer portal','<a href="'+escape(link)+'">customer portal</a>')}</p>
<p style="margin:0 0 10px">Please park in a designated customer space and leave your keys at reception, or use the Key Drop letterbox before we open.</p>
<p style="margin:0 0 12px">Leave your service book (if required) and locking wheel nut key on the passenger seat.</p>
<p style="margin:0">Kind regards,<br>Chris<br><b>Vecta Motors</b><br>07721 722622</p>
</td></tr></table></div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
 return {text,html,subject,attachments:[...(image?[{filename:'your-vehicle.png',content:image,content_id:'booking-vehicle'}]:[]),{filename:'vecta-logo.png',content:logoImage,content_id:'booking-logo'}]};
}
export function confirmationPreviewHtml(content){
 let html=content.html;
 for(const attachment of content.attachments||[]){
  if(['booking-vehicle','booking-logo'].includes(attachment.content_id))html=html.replaceAll('cid:'+attachment.content_id,'data:image/png;base64,'+attachment.content);
 }
 return html;
}
export async function savedBookingImage(db,job,readSource=storedImageSource){
 try{
  const reg=normaliseReg(job.registration);
  const ids=['vehicle_artwork:','vehicle_identity:','vehicle_colour:'].map(prefix=>prefix+reg);
  const rows=await db('workshop_settings?'+new URLSearchParams({id:'in.('+ids.join(',')+')',select:'id,value'}));
  const values=new Map(rows.map(row=>[row.id,row.value]));
  const art=values.get(ids[0]),identity=values.get(ids[1]),paint=values.get(ids[2]);
  const candidates=art?.manual?[art,identity]:[identity,art];
  const matches=value=>normaliseReg(value?.registration)===reg&&vehicleMatches(value,{make:job.make,model:job.model});
  const shape=candidates.find(value=>matches(value)&&imageUrl(value.imageUrl));
  const colour=art?.manual&&shape===art?art.colour:
   (normaliseReg(paint?.registration)===reg&&vehicleMatches(paint,{make:shape?.make})?paint.colour:'')||shape?.colour||(matches(art)?art.colour:'');
  const asset=String(shape?.imageUrl||'').match(/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/(\d{1,12}\.svgz?)$/)?.[1];
  if(!asset)return null;
  const source=await readSource(asset);if(!source)return null;
  const {Resvg}=await import('@resvg/resvg-js');
  const rendered=new Resvg(paintedVehicleSvg(source,colour),{fitTo:{mode:'width',value:720},background:'#ffffff'}).render().asPng();
  // Supplier canvases have substantial empty space above the car. Remove it
  // before sizing the email image so the visible vehicle aligns with the plate.
  const {default:sharp}=await import('sharp');
  const bytes=await sharp(rendered).trim({background:'#ffffff',threshold:8}).png().toBuffer();
  return bytes.length<=750000?Buffer.from(bytes).toString('base64'):null;
 }catch{return null;}
}
export async function bookingConfirmation(db,job,send=false){
 if(!trackable(job))throw Object.assign(Error('Save and confirm the booking first.'),{status:409});
 const to=String(job.customer_email||'').trim();if(!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(to))throw Object.assign(Error('Save a valid customer email first.'),{status:400});
 const link=trackingUrl(job),id='portal-confirmation:'+createHash('sha256').update(job.id+':'+job.booking_date+':'+to.toLowerCase()).digest('hex');
 const [previous]=await db('nmuk_service_reminder_sends?'+new URLSearchParams({id:'eq.'+id,select:'status,message_payload,error',limit:1}));
 const frozen=previous?.message_payload;
 const content=frozen?{text:frozen.text,html:frozen.html,subject:frozen.subject,...(frozen.attachments?{attachments:frozen.attachments}:{})}:confirmationContent(job,link,await savedBookingImage(db,job));
 let sendError='';
 if(previous?.status==='failed'){
  let reason='';try{reason=JSON.parse(previous.error||'{}').error||'';}catch{}
  sendError=/domain.*not verified/i.test(reason)?'Email not sent: vectamotors.co.uk is not verified for sending. Verify the domain in the email service, then retry.':'The previous email attempt failed. You can retry the saved confirmation.';
 }
 if(!send)return {email:to,subject:content.subject,html:confirmationPreviewHtml(content),text:content.text,test:isTestProject(),status:previous?.status||'unsent',has_image:!!content.attachments?.some(a=>a.content_id==='booking-vehicle'),send_error:sendError};
 if(isTestProject())throw Object.assign(Error('Test preview only. No customer email has been sent.'),{status:409});
 if(!process.env.RESEND_API_KEY)throw Object.assign(Error('Email service is not configured.'),{status:503});
 const {subject,...body}=content;
 return deliver({id,job,stamp:new Date().toISOString(),to:[to]},content.text,subject,'chris@vectamotors.co.uk',body);
}
