import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {isTestProject} from '../api/_database-environment.js';
import {trackingUrl,trackable} from './job-progress.js';
import {customerWork} from './customer-portal.js';
import {storedImageSource} from './haynes-image-source.js';
import {paintedVehicleSvg} from './vehicle-paint-svg.js';
import {normaliseReg, imageUrl, vehicleMatches} from './haynes-vehicle.js';
import {deliver} from './nmuk-completion-email.js';
const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const portalEmailWording='Your personalised customer portal lets you make amendments to your booking, request additional work and message us. On the day of your booking, you can view the full progress of your car. Open your portal below.';
const logoImage=readFileSync(new URL('../public/assets/vecta-reminder-logo-white.png',import.meta.url)).toString('base64');
const directionsUrl='https://www.google.com/maps/dir/?api=1&destination=54.9165354%2C-1.470565&waypoints=54.9111134%2C-1.4865161%7C54.9144683%2C-1.482233&travelmode=driving';
const directionsText='Please enter via South Gate Security on Nissan Way, then continue to Vecta.';
const authorisationText='If we discover any additional work that requires doing we will contact you via your customer portal for authorisation first, so please check your phone/email when possible.';
function checkedEdits(edits,fields){
 if(edits==null)return {};
 if(typeof edits!=='object'||Array.isArray(edits))throw Object.assign(Error('Enter text in the email preview.'),{status:400});
 const result={};let size=0;
 for(const [key,value]of Object.entries(edits)){
  if(!Object.hasOwn(fields,key)||typeof value!=='string'||value.length>5000||(size+=value.length)>20000)throw Object.assign(Error('The email edits are invalid or too long. Shorten the wording and try again.'),{status:400});
  result[key]=value.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
 }
 return result;
}
function savedConfirmationFields(html){
 const {document}=parseHTML(html),fields={};
 for(const el of document.querySelectorAll('[data-confirmation-field]')){
  for(const br of el.querySelectorAll('br'))br.replaceWith('\n');
  fields[el.getAttribute('data-confirmation-field')]=el.textContent;
 }
 return fields;
}
export function confirmationContent(job,link,image=null,edits=null){
 const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(job.booking_date+'T12:00:00Z'));
 const amount=job.amount_quoted==null?'To be confirmed':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(job.amount_quoted))+(job.vat_mode==='ex_vat'?' + VAT':job.vat_mode==='no_vat'?' (no VAT)':' including VAT');
 const work=customerWork(job.work_required||job.job_type),subject='Vecta booking confirmation — '+job.registration;
 const defaults={
  eyebrow:'YOUR PERSONALISED CUSTOMER PORTAL',heading:'Your booking is confirmed',country:'GB',registration:normaliseReg(job.registration),vehicle:job.vehicle||'',date,
  work_heading:'Job Description',work,cost:'Estimated cost: '+amount,portal:portalEmailWording,portal_button:'HERE',
  cancellation:'You can cancel online up to 24 hours before your booking, giving a reason.',authorisation:authorisationText,
  directions:directionsText,directions_link:'Directions to Vecta via South Gate',
  parking:'Please park in a designated customer space and leave your keys at reception, or use the Key Drop letterbox before we open.',
  service_book:'Leave your service book (if required) and locking wheel nut key on the passenger seat.',
  signoff:'Kind regards,',sender:'Chris',business:'Vecta Motors',phone:'07721 722622'
 };
 const fields={...defaults,...checkedEdits(edits,defaults)},value=key=>escape(fields[key]).replace(/\n/g,'<br>');
 const text=fields.eyebrow+'\n'+fields.heading+'\n\n'+fields.country+' '+fields.registration+' · '+fields.vehicle+'\n'+fields.date+'\n\n'+fields.work_heading+'\n'+fields.work+'\n\n'+fields.cost+'\n\n'+fields.portal+'\n'+fields.portal_button+': '+link+'\n\n'+fields.cancellation+'\n\n'+fields.authorisation+'\n'+link+'\n\n'+fields.directions+'\n'+fields.directions_link+':\n'+directionsUrl+'\n\n'+fields.parking+'\n'+fields.service_book+'\n\n'+fields.signoff+'\n'+fields.sender+'\n'+fields.business+'\n'+fields.phone;
 const plate='<table role="presentation" cellspacing="0" cellpadding="0" style="border:2px solid #111111;border-radius:7px;border-spacing:0;background:#ffd83d"><tr><td bgcolor="#0752a5" align="center" width="28" style="padding:8px 3px;color:#ffffff;font-size:11px;font-weight:900;line-height:24px" data-confirmation-field="country">'+value('country')+'</td><td bgcolor="#ffd83d" style="padding:7px 10px;color:#111111;font-size:22px;font-weight:900;line-height:26px;letter-spacing:1px;white-space:nowrap" data-confirmation-field="registration">'+value('registration')+'</td></tr></table>';
 const html=`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:Arial,sans-serif;color:#202323">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:16px 8px">
<!--[if mso]><table role="presentation" width="580" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<div style="max-width:580px;margin:0 auto"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;border-radius:12px;text-align:left">
<tr><td align="center" bgcolor="#ffffff" style="padding:12px 20px;border-radius:12px 12px 0 0;background:#ffffff;text-align:center"><img src="cid:booking-logo" alt="VECTA — Vehicle Servicing and repairs" width="480" border="0" style="display:inline-block;width:480px;max-width:100%;height:auto;vertical-align:middle"></td></tr>
<tr><td align="left" style="padding:18px 20px 12px;text-align:left">
<p style="margin:0 0 7px;color:#777777;font-size:10px;line-height:14px;letter-spacing:1.5px" data-confirmation-field="eyebrow">${value('eyebrow')}</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:29px" data-confirmation-field="heading">${value('heading')}</h1>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td valign="top"${image?' width="56%"':''} style="padding:0${image?' 10px':''} 0 0">${plate}
<p style="margin:8px 0 4px;font-size:15px;font-weight:bold;line-height:20px" data-confirmation-field="vehicle">${value('vehicle')}</p>
<p style="margin:0;font-size:13px;line-height:19px" data-confirmation-field="date">${value('date')}</p></td>
${image?'<td width="44%" align="right" valign="top" style="padding:0"><img src="cid:booking-vehicle" alt="'+escape(job.vehicle||'Your vehicle')+'" width="240" border="0" style="display:block;width:100%;max-width:240px;height:auto"></td>':''}
</tr></table>
<h2 style="margin:16px 0 5px;font-size:15px;line-height:20px" data-confirmation-field="work_heading">${value('work_heading')}</h2>
<p style="margin:0 0 10px;white-space:pre-line;font-size:14px;line-height:21px" data-confirmation-field="work">${value('work')}</p>
<p style="margin:0;font-size:14px;line-height:21px"><b data-confirmation-field="cost">${value('cost')}</b></p>
</td></tr>
<tr><td align="left" style="text-align:left;padding:14px 20px 18px;border-top:1px solid #e7e4df;font-size:14px;line-height:21px">
<p style="margin:0 0 12px" data-confirmation-field="portal">${value('portal')}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#bd1830" style="border-radius:7px"><a href="${escape(link)}" style="display:inline-block;padding:11px 38px;color:#ffffff;text-decoration:none;font-weight:bold;letter-spacing:2px" data-confirmation-field="portal_button">${value('portal_button')}</a></td></tr></table>
<p style="margin:10px 0;color:#666666;font-size:12px;line-height:18px" data-confirmation-field="cancellation">${value('cancellation')}</p>
<p style="margin:0 0 10px" data-confirmation-field="authorisation">${value('authorisation').replace('customer portal','<a href="'+escape(link)+'">customer portal</a>')}</p>
<p style="margin:0 0 10px"> <span data-confirmation-field="directions">${value('directions')}</span> <a data-confirmation-field="directions_link" href="${escape(directionsUrl)}">${value('directions_link')}</a></p>
<p style="margin:0 0 10px" data-confirmation-field="parking">${value('parking')}</p>
<p style="margin:0 0 12px" data-confirmation-field="service_book">${value('service_book')}</p>
<p style="margin:0"><span data-confirmation-field="signoff">${value('signoff')}</span><br><span data-confirmation-field="sender">${value('sender')}</span><br><b data-confirmation-field="business">${value('business')}</b><br><span data-confirmation-field="phone">${value('phone')}</span></p>
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
export async function bookingConfirmation(db,job,send=false,edits=null){
 if(!trackable(job))throw Object.assign(Error('Save and confirm the booking first.'),{status:409});
 const to=String(job.customer_email||'').trim();if(!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(to))throw Object.assign(Error('Save a valid customer email first.'),{status:400});
 const link=trackingUrl(job),id='portal-confirmation:'+createHash('sha256').update(job.id+':'+job.booking_date+':'+to.toLowerCase()).digest('hex');
 const [previous]=await db('nmuk_service_reminder_sends?'+new URLSearchParams({id:'eq.'+id,select:'status,message_payload,error',limit:1}));
 const frozen=previous?.message_payload;
 // A reserved send must replay its exact payload; edits are only for a new email.
 if(send&&frozen&&edits){
  const original=savedConfirmationFields(frozen.html),changes=checkedEdits(edits,original);
  if(Object.entries(changes).some(([key,value])=>value!==original[key]))throw Object.assign(Error('This email has already been submitted. Reopen the preview to check its status before changing the wording.'),{status:409});
 }
 const content=frozen?{text:frozen.text,html:frozen.html,subject:frozen.subject,...(frozen.attachments?{attachments:frozen.attachments}:{})}:confirmationContent(job,link,await savedBookingImage(db,job),send?edits:null);
 let sendError='';
 if(previous?.status==='failed'){
  let reason='';try{reason=JSON.parse(previous.error||'{}').error||'';}catch{}
  sendError=/domain.*not verified/i.test(reason)?'Email not sent: vectamotors.co.uk is not verified for sending. Verify the domain in the email service, then retry.':'The previous email attempt failed. You can retry the saved confirmation.';
 }
 if(!send)return {editable:!frozen,email:to,subject:content.subject,html:confirmationPreviewHtml(content),text:content.text,test:isTestProject(),status:previous?.status||'unsent',has_image:!!content.attachments?.some(a=>a.content_id==='booking-vehicle'),send_error:sendError};
 if(isTestProject())throw Object.assign(Error('Test preview only. No customer email has been sent.'),{status:409});
 if(!process.env.RESEND_API_KEY)throw Object.assign(Error('Email service is not configured.'),{status:503});
 const {subject,...body}=content;
 return deliver({id,job,stamp:new Date().toISOString(),to:[to]},content.text,subject,'chris@vectamotors.co.uk',body);
}
