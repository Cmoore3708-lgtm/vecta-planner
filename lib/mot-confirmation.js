import {createHmac,timingSafeEqual} from 'node:crypto';

export const motSender='confirmations@garagemail.motasoft.net';
export const motInbox='mot@faliiloi.resend.app';
export const copyInbox='chris@nissan-fleet.co.uk';
export const address=value=>String(value||'').match(/<([^<>]+)>/)?.[1]?.toLowerCase()||String(value||'').trim().toLowerCase();
export const registration=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

export function verifyMotWebhook(raw,headers,secret,now=Date.now()){
  if(!secret)throw new Error('MOT webhook is not configured');
  const stamp=String(headers['svix-timestamp']||''),id=String(headers['svix-id']||'');
  if(!id||!/^\d+$/.test(stamp)||Math.abs(now/1000-Number(stamp))>300)throw new Error('Invalid webhook timestamp');
  const expected=createHmac('sha256',Buffer.from(secret.replace(/^whsec_/,''),'base64')).update(id+'.'+stamp+'.'+raw).digest();
  const valid=String(headers['svix-signature']||'').split(' ').some(part=>{const [version,value]=part.split(',');if(version!=='v1'||!value)return false;const actual=Buffer.from(value,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected)});
  if(!valid)throw new Error('Invalid webhook signature');
  return JSON.parse(raw);
}

export function emailText(email){
  if(email.text)return String(email.text);
  return String(email.html||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:p|div|tr|h\d)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}

// Only the centre's explicit confirmation template can produce a green status.
export function parseMotConfirmation(email){
  const text=emailText(email),all=String(email.subject||'')+'\n'+text;
  const reference=all.match(/\bref\s*:\s*(\d+)\b/i)?.[1]||null;
  const base={reference,state:'review',registration:null,date:null,time:null};
  if(/\bcancel(?:led|lation|ed)\b|\breschedul(?:ed|ing)\b|\bbooking (?:changed|amended)\b/i.test(all))return {...base,state:'review'};
  if(!reference||!/Booking Confirmation\s*[-–]\s*MOT\s+IV\b/i.test(all)||!/Fault Finder MOT Centre/i.test(text))return base;
  const appointments=[...text.matchAll(/MOT\s+IV\s*[-–]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})/gi)];
  if(appointments.length!==1)return base;
  const m=appointments[0],month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[3].toLowerCase()),day=Number(m[2]),year=Number(m[4]),hour=Number(m[5]),minute=Number(m[6]);
  const date=new Date(Date.UTC(year,month,day));
  if(year<2020||date.getUTCMonth()!==month||date.getUTCDate()!==day||hour>23||minute>59||['sun','mon','tue','wed','thu','fri','sat'][date.getUTCDay()]!==m[1].toLowerCase())return base;
  const after=text.slice(m.index+m[0].length).split(/\bTechnician\b|\bNotes\b|\bPrice Summary\b/i)[0];
  const plate=after.trim().match(/\b([A-Z]{2}\d{2}\s*[A-Z]{3}|[A-Z]{1,3}\s*\d{1,4}\s*[A-Z]{0,3}|\d{1,4}\s*[A-Z]{1,3})\s*$/i)?.[1];
  if(!plate)return base;
  return {...base,state:'confirmed',registration:registration(plate),date:date.toISOString().slice(0,10),time:String(hour).padStart(2,'0')+':'+m[6]};
}
