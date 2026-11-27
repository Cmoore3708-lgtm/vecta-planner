import {normaliseReg} from './haynes-vehicle.js';
import {bookingEmailLayout,bookingAttachments,savedBookingImage,escape} from './booking-email-layout.js';
export {savedBookingImage};
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {isTestProject} from '../api/_database-environment.js';
import {trackingUrl,trackable} from './job-progress.js';
import {customerEstimateText} from './approved-work.js';
import {customerWork} from './customer-portal.js';
import {deliver} from './nmuk-completion-email.js';
export const portalEmailWording='Your personalised customer portal lets you make amendments to your booking, request additional work and message us. On the day of your booking, you can view the full progress of your car. Open your portal below.';
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
function confirmationWork(job){
 const text=customerWork(job.work_required||job.job_type),sections=text.split(/\n\s*\n/);
 const mileage=section=>/^(?:Current mileage\b|Mileage\s*:)/i.test(section.trim());
 if(!sections.some(mileage))return text;
 const types=new Set(String(job.job_type||'').split(/\s*\|\|\s*/).map(type=>type.trim().toLowerCase()));
 const heading=section=>types.has(section.trim().toLowerCase());
 // Keep the selected work first, followed by the existing notes in their order.
 if(sections.some(heading))return [...sections.filter(heading),...sections.filter(section=>!heading(section))].join('\n\n');
 return [...sections.filter(section=>!mileage(section)),...sections.filter(mileage)].join('\n\n');
}
const workshopExteriorUrl='https://www.vectamotors.co.uk/assets/vecta-workshop-exterior-email.jpg';
export function confirmationContent(job,link,image=null,edits=null){
 const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(job.booking_date+'T12:00:00Z'));
 const amount=customerEstimateText(job);
 const work=confirmationWork(job),subject='Vecta booking confirmation — '+job.registration;
 const defaults={
  eyebrow:'YOUR PERSONALISED CUSTOMER PORTAL',heading:'Your booking is confirmed',country:'GB',registration:normaliseReg(job.registration),vehicle:job.vehicle||'',date,
  work_heading:'Job Description',work,cost:'Estimated cost: '+amount,portal:portalEmailWording,portal_button:'View my booking',
  install_heading:'Add VECTA to my phone for workshop updates',
  cancellation:'You can cancel online up to 24 hours before your booking, giving a reason.',authorisation:authorisationText,
  directions:directionsText,directions_link:'Directions to Vecta via South Gate',
  parking:'Please park in a designated customer space and leave your keys at reception, or use the Key Drop letterbox before we open.',
  service_book:'Leave your service book (if required) and locking wheel nut key on the passenger seat.',
  signoff:'Kind regards,',sender:'Chris',business:'Vecta Motors',phone:'07721 722622'
 };
 const fields={...defaults,...checkedEdits(edits,defaults)},value=key=>escape(fields[key]).replace(/\n/g,'<br>');
 const guideUrl=new URL(link).hash ? 'https://www.vectamotors.co.uk/app/booking?setup=1'+new URL(link).hash : 'https://www.vectamotors.co.uk/app/home?setup=1';
 const text=[fields.eyebrow,fields.heading,fields.country+' '+fields.registration+' · '+fields.vehicle,fields.date,fields.directions,fields.directions_link+': '+directionsUrl,fields.parking,fields.service_book,fields.work_heading+'\n'+fields.work,fields.cost,fields.portal,fields.portal_button+': '+link,fields.cancellation,fields.authorisation,fields.install_heading+': '+guideUrl,fields.signoff,fields.sender,fields.business,fields.phone,'Outside Vecta Workshop: '+workshopExteriorUrl].join('\n\n');
 const html=bookingEmailLayout(value,image,`<p style="margin:0 0 10px"> <span data-confirmation-field="directions">${value('directions')}</span> <a data-confirmation-field="directions_link" href="${escape(directionsUrl)}">${value('directions_link')}</a></p>
<p style="margin:0 0 10px" data-confirmation-field="parking">${value('parking')}</p>
<p style="margin:0 0 12px" data-confirmation-field="service_book">${value('service_book')}</p>
<h2 style="margin:16px 0 5px;font-size:15px;line-height:20px" data-confirmation-field="work_heading">${value('work_heading')}</h2>
<p style="margin:0 0 10px;white-space:pre-line;font-size:14px;line-height:21px" data-confirmation-field="work">${value('work')}</p>
<p style="margin:0;font-size:14px;line-height:21px"><b data-confirmation-field="cost">${value('cost')}</b></p>
</td></tr>
<tr><td align="left" style="text-align:left;padding:14px 20px 18px;border-top:1px solid #e7e4df;font-size:14px;line-height:21px">
<p style="margin:0 0 12px" data-confirmation-field="portal">${value('portal')}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#bd1830" style="border-radius:7px"><a href="${escape(link)}" style="display:inline-block;padding:11px 38px;color:#ffffff;text-decoration:none;font-weight:bold;letter-spacing:2px" data-confirmation-field="portal_button">${value('portal_button')}</a></td></tr></table>

<p style="margin:10px 0;color:#666666;font-size:12px;line-height:18px" data-confirmation-field="cancellation">${value('cancellation')}</p>
<p style="margin:0 0 10px" data-confirmation-field="authorisation">${value('authorisation').replace('customer portal','<a href="'+escape(link)+'">customer portal</a>')}</p>
<p><a href="${escape(guideUrl)}" data-confirmation-field="install_heading">${value('install_heading')}</a></p>
<p style="margin:0"><span data-confirmation-field="signoff">${value('signoff')}</span><br><span data-confirmation-field="sender">${value('sender')}</span><br><b data-confirmation-field="business">${value('business')}</b><br><span data-confirmation-field="phone">${value('phone')}</span></p>
<img src="${workshopExteriorUrl}" width="532" alt="Outside Vecta Workshop at NMUK, showing reception, the workshop entrance and the wash bay" style="display:block;width:100%;max-width:532px;height:auto;margin-top:16px;border:0">
`);
 return {text,html,subject,attachments:bookingAttachments(image)};
}
export function confirmationPreviewHtml(content){
 let html=content.html;
 for(const attachment of content.attachments||[]){
  if(['booking-vehicle','booking-logo'].includes(attachment.content_id))html=html.replaceAll('cid:'+attachment.content_id,'data:image/png;base64,'+attachment.content);
 }
 return html;
}
export async function bookingConfirmation(db,job,send=false,edits=null){
 if(!trackable(job))throw Object.assign(Error('Save and confirm the booking first.'),{status:409});
 const to=String(job.customer_email||'').trim();if(!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(to))throw Object.assign(Error('Save a valid customer email first.'),{status:400});
 const link=trackingUrl(job).replace('/track#','/app/booking#'),id='portal-confirmation:'+createHash('sha256').update(job.id+':'+job.booking_date+':'+to.toLowerCase()).digest('hex');
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
 if(!send)return {confirmation_id:id,editable:!frozen,email:to,subject:content.subject,html:confirmationPreviewHtml(content),text:content.text,test:isTestProject(),status:previous?.status||'unsent',has_image:!!content.attachments?.some(a=>a.content_id==='booking-vehicle'),send_error:sendError};
 if(isTestProject())throw Object.assign(Error('Test preview only. No customer email has been sent.'),{status:409});
 if(!process.env.RESEND_API_KEY)throw Object.assign(Error('Email service is not configured.'),{status:503});
 const {subject,...body}=content;
 return deliver({id,job,stamp:new Date().toISOString(),to:[to]},content.text,subject,'chris@vectamotors.co.uk',body);
}
