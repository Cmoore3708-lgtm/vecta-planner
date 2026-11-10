import {trackingUrl} from './job-progress.js';
import { databaseEnvironment, isTestProject } from '../api/_database-environment.js';
import {deliver} from './nmuk-completion-email.js';

const londonDate = (date) => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const londonHour = (date) => Number(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(date));
const validEmail = (value) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(value || '').trim());
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sender = 'Chris@Nissan-Fleet.co.uk';
export const staffSender = 'chris@vectamotors.co.uk';
const normalizeRegistration = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function reminderContent(job) {
  const registration = String(job.registration || '').trim().toUpperCase();
  const name = String(job.contact_name || job.customer_name || '').trim();
  const greeting = name && !/^NMUK(?: Internal| Pool)?$/i.test(name) ? `Hi ${name}` : 'Hi';
  const subject = `${registration} Service tomorrow`;
  const message = `${greeting},\n\nThis is an automatic reminder that your internal car ${registration} is\ndue at our workshop tomorrow morning for its yearly Service. Please park it\noutside and if we are not there, either leave the key in it or put them through\nour Key Drop letterbox.\n\nKind\nRegards,\n\nChris.\n07721722622\n\nVECTA\nNissan Fleet Support\nContractors compound\nVectaMotors.co.uk`;
  const html = escapeHtml(message).replace(/\n/g, '<br>')
    .replace('VECTA<br>Nissan Fleet Support', '<strong style="color:#c8102e;font-size:24px;line-height:1.3;">VECTA</strong><br><strong>Nissan Fleet Support</strong>')
    .replace('VectaMotors.co.uk', '<a href="https://www.vectamotors.co.uk/"><strong>VectaMotors.co.uk</strong></a>');
  return {subject,text:message,html};
}

export function eligible(job, bookingDate, vehicle) {
  return job.booking_date === bookingDate && job.archived === false
    && !/^(provisional|quote|completed|cancelled|canceled|deleted|ready to invoice|ready_to_invoice)$/i.test(String(job.status || ''))
    && String(job.customer_name || '').trim().toUpperCase() === 'NMUK'
    && vehicle?.fleetGroup === 'Nissan Internal'
    && normalizeRegistration(vehicle.registration) === normalizeRegistration(job.registration)
    && /(?:^|\|\|)\s*(?:Internal|Full|Major|On-Site) Service\s*(?:\|\||$)/i.test(String(job.job_type || ''))
    && validEmail(job.recipient) && Boolean(normalizeRegistration(job.registration));
}

export function staffEligible(job, bookingDate) {
  return customerEligible(job,bookingDate) && String(job.customer_account || '').trim().toUpperCase() === 'STAFF';
}
export function customerEligible(job, bookingDate) {
  return job.booking_date === bookingDate && job.archived === false
    && /^(booked|in progress|in_progress)$/i.test(String(job.status || ''))
    && String(job.card_type || 'job') === 'job'
    && !job.completed_at && !job.no_vehicle && !job.deleted && !job.deleted_at
    && !/\[\[VECTA_(?:SOFT_DELETE|DELETED)[:\]]/i.test(String(job.customer_note || ''))
    && !/vehicle tax|pool car tax/i.test(String(job.job_type || ''))
    && validEmail(job.recipient) && Boolean(normalizeRegistration(job.registration));
}
export function staffReminderContent(job) {
  return bookingReminderContent(job);
}
export function bookingReminderContent(job) {
  const registration = String(job.registration || '').trim().toUpperCase();
  const name = String(job.contact_name || job.customer_name || '').trim();
  const greeting = name && !/^NMUK(?: Internal| Pool)?$/i.test(name) ? 'Hi '+name : 'Hi';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(job.booking_date||'') ? ' ('+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(job.booking_date+'T12:00:00Z'))+')' : '';
  const arrival = 'Please park outside the workshop in one of our designated customer parking spaces before you start your day. Put your keys through our Key Drop letterbox if we are closed. If we are open, please hand your keys in at reception.';
  const portal = 'Keep an eye on your personalised customer portal for updates. On the day of your booking, you can follow the progress of the work and respond to any messages or requests for authorisation.';
  // Only send a private job link to the contact saved on that job. Fleet-only
  // recipients can still open the public portal entry without disclosing a token.
  let link='https://www.vectamotors.co.uk/track';
  if(String(job.recipient||job.customer_email||'').trim().toLowerCase()===String(job.customer_email||'').trim().toLowerCase())try{link=trackingUrl(job);}catch{/* Keep the reminder useful if a private link cannot be issued. */}
  const signature='Kind regards,\nChris\n07721722622\n\nVECTA Motors\nContractors compound\nVectaMotors.co.uk';
  const text=`${greeting},\n\nThis is a reminder that your car ${registration} is booked in at VECTA tomorrow${date}.\n\n${arrival}\n\n${portal}\n\nOpen your customer portal:\n${link}\n\nIf you need help with your booking, please reply to this email or call 07721722622.\n\n${signature}`;
  const html='<div style="font-family:Arial,sans-serif;color:#252525;line-height:1.6;max-width:580px;margin:auto"><strong style="color:#c8102e;font-size:24px;letter-spacing:4px">VECTA</strong><h1 style="font-size:24px">Your booking is tomorrow</h1><p>'+escapeHtml(greeting)+',</p><p><strong>'+escapeHtml(registration)+'</strong> is booked in at VECTA tomorrow'+escapeHtml(date)+'.</p><p>'+escapeHtml(arrival)+'</p><p>'+escapeHtml(portal)+'</p><p><a href="'+escapeHtml(link)+'" style="display:inline-block;padding:14px 36px;background:#bd1830;color:#fff;font-weight:bold;text-decoration:none;border-radius:8px">HERE</a></p><p>If you need help with your booking, please reply to this email or call 07721722622.</p><p>'+escapeHtml(signature).replace(/\n/g,'<br>')+'</p></div>';
  return {subject: `${registration} Booking tomorrow`, text, html};
}

async function db(path, options = {}) {
  const {url,key} = databaseEnvironment({requireService:true});
  const response = await fetch(`${String(url).replace(/\/$/,'')}/rest/v1/${path}`, {
    ...options,
    headers:{apikey:key,Authorization:`Bearer ${key}`,'content-type':'application/json',...(options.headers || {})},signal:AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Database ${response.status}: ${body?.message || body?.error || 'request failed'}`);
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'GET required'});
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Unauthorized'});
  if (isTestProject()) return res.status(200).json({skipped:'Test environment: no customer emails sent'});
  const now = new Date();
  if (londonHour(now) !== 12) return res.status(200).json({skipped:'Outside UK midday'});
  const today = londonDate(now);
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = londonDate(new Date(Date.UTC(year,month - 1,day + 1,12)));
  if (!process.env.RESEND_API_KEY) return res.status(503).json({error:'Email sender not configured'});
  try {
    const rows=[];
    for(let offset=0;;offset+=200){
      const page=await db(`jobs?select=*&booking_date=eq.${tomorrow}&archived=eq.false&order=id.asc&limit=200&offset=${offset}`);
      rows.push(...page);if(page.length<200)break;
    }
    // Missing fleet data must not prevent reminders to other saved customers.
    const fleetRows=await db('workshop_settings?select=value&id=eq.fleet_state_v77').catch(()=>[]);
    const fleetAvailable = Array.isArray(fleetRows?.[0]?.value?.vehicles);
    const vehicles = new Map((fleetAvailable ? fleetRows[0].value.vehicles : [])
      .filter(vehicle => vehicle.fleetGroup === 'Nissan Internal' && !vehicle.archived_at && vehicle.status !== 'Archived')
      .map(vehicle => [normalizeRegistration(vehicle.registration),vehicle]));
    const memories = new Map();
    for (let offset = 0; offset < (rows || []).length; offset += 100) {
      const ids = rows.slice(offset, offset + 100).map(job => '"jobcustomer:' + String(job.id).replace(/["\\]/g, '') + '"').join(',');
      const saved = await db('workshop_settings?select=id,value&id=in.' + encodeURIComponent('(' + ids + ')'));
      for (const row of saved || []) if (row.id) memories.set(String(row.id).slice('jobcustomer:'.length), row.value || {});
    }
    const jobs = (rows || []).map(job => {
      const memory = memories.get(String(job.id)) || {};
      const account = String(memory.customer_account || job.customer_account || job.customer_name || '').trim().toUpperCase();
      const nmuk = account === 'NMUK';
      const vehicle = vehicles.get(normalizeRegistration(job.registration));
      // Fleet Manager holds the current internal driver contact; the job email is a fallback.
      return {...job,no_vehicle:job.no_vehicle||memory.no_vehicle,customer_account:account,nmuk,recipient:String(nmuk ? (vehicle?.contactEmail || job.customer_email || memory.customer_email || '') : (job.customer_email || memory.customer_email || '')).trim(),contact_name:nmuk?vehicle?.contactName:undefined,reminder_vehicle:vehicle};
    }).filter(job => job.nmuk ? eligible(job,tomorrow,job.reminder_vehicle) : customerEligible(job, tomorrow));
    const failures = [];
    let sent = 0;
    for (const job of jobs) {
      const id = `${job.id}:${tomorrow}`;
      try {
        const [previous]=await db('nmuk_service_reminder_sends?'+new URLSearchParams({id:'eq.'+id,select:'status,recipient,message_payload',limit:1}));
        if(previous?.status==='sent'||previous?.status==='pending')continue;
        if(previous&&String(previous.recipient).toLowerCase()!==job.recipient.toLowerCase())throw Error('Customer contact changed since the original reminder attempt.');
        const content = previous?.message_payload || (job.nmuk ? reminderContent(job) : bookingReminderContent(job));
        const {subject,text,html}=content,from=job.nmuk?sender:staffSender;
        const result=await deliver({id,job,stamp:tomorrow+'T12:00:00Z',to:[job.recipient]},text,subject,from,{text,html});
        if(!result.already_sent)sent++;
      } catch (error) {
        failures.push({job_id:job.id,error:String(error)});
      }
    }
    return res.status(failures.length ? 502 : 200).json({date:tomorrow,eligible:jobs.length,sent,failures,...(!fleetAvailable ? {warning:'Fleet data unavailable; NMUK reminders withheld.'} : {})});
  } catch (error) {
    return res.status(500).json({error:String(error)});
  }
}
