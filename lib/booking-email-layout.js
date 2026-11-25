import {readFileSync} from 'node:fs';
import {storedImageSource} from './haynes-image-source.js';
import {paintedVehicleSvg} from './vehicle-paint-svg.js';
import {normaliseReg, imageUrl, vehicleMatches} from './haynes-vehicle.js';
export const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logoImage=readFileSync(new URL('../public/assets/vecta-reminder-logo-white.png',import.meta.url)).toString('base64');

export function bookingEmailLayout(value,image,bodyHtml){
 const plate='<table role="presentation" cellspacing="0" cellpadding="0" style="border:2px solid #111111;border-radius:7px;border-spacing:0;background:#ffd83d"><tr><td bgcolor="#0752a5" align="center" width="28" style="padding:8px 3px;color:#ffffff;font-size:11px;font-weight:900;line-height:24px" data-confirmation-field="country">'+value('country')+'</td><td bgcolor="#ffd83d" style="padding:7px 10px;color:#111111;font-size:22px;font-weight:900;line-height:26px;letter-spacing:1px;white-space:nowrap" data-confirmation-field="registration">'+value('registration')+'</td></tr></table>';
 return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
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
${image?'<td width="44%" align="right" valign="top" style="padding:0"><img src="cid:booking-vehicle" alt="'+(value('vehicle')||'Your vehicle')+'" width="240" border="0" style="display:block;width:100%;max-width:240px;height:auto"></td>':''}
</tr></table>
${bodyHtml}</td></tr></table></div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

export function bookingAttachments(image){
 return [...(image?[{filename:'your-vehicle.png',content:image,content_id:'booking-vehicle'}]:[]),{filename:'vecta-logo.png',content:logoImage,content_id:'booking-logo'}];
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
