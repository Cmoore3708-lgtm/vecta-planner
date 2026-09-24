import { databaseEnvironment } from './_database-environment.js';

const londonDate = (date) => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const londonHour = (date) => Number(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(date));
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sender = 'Chris@Nissan-Fleet.co.uk';
const normalizeRegistration = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function reminderContent(job) {
  const registration = String(job.registration || '').trim().toUpperCase();
  const name = String(job.customer_name || '').trim();
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
    && !/^(completed|cancelled|canceled|deleted|ready to invoice|ready_to_invoice)$/i.test(String(job.status || ''))
    && String(job.customer_name || '').trim().toUpperCase() === 'NMUK'
    && vehicle?.fleetGroup === 'Nissan Internal'
    && normalizeRegistration(vehicle.registration) === normalizeRegistration(job.registration)
    && /(?:^|\|\|)\s*(?:Internal|Full|Major) Service\s*(?:\|\||$)/i.test(String(job.job_type || ''))
    && validEmail(job.recipient) && Boolean(normalizeRegistration(job.registration));
}

async function db(path, options = {}) {
  const {url,key} = databaseEnvironment({requireService:true});
  const response = await fetch(`${String(url).replace(/\/$/,'')}/rest/v1/${path}`, {
    ...options,
    headers:{apikey:key,Authorization:`Bearer ${key}`,'content-type':'application/json',...(options.headers || {})}
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Database ${response.status}: ${body?.message || body?.error || 'request failed'}`);
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'GET required'});
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Unauthorized'});
  const now = new Date();
  if (londonHour(now) !== 12) return res.status(200).json({skipped:'Outside UK midday'});
  const today = londonDate(now);
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = londonDate(new Date(Date.UTC(year,month - 1,day + 1,12)));
  if (!process.env.RESEND_API_KEY) return res.status(503).json({error:'Email sender not configured'});
  try {
    const [rows, fleetRows] = await Promise.all([
      db(`jobs?select=id,booking_date,archived,status,job_type,customer_email,customer_name,registration&booking_date=eq.${tomorrow}&archived=eq.false&limit=1000`),
      db('workshop_settings?select=value&id=eq.fleet_state_v77')
    ]);
    if (!fleetRows?.[0]?.value || !Array.isArray(fleetRows[0].value.vehicles)) throw new Error('Fleet contact data unavailable; reminders withheld.');
    const vehicles = new Map(fleetRows[0].value.vehicles
      .filter(vehicle => vehicle.fleetGroup === 'Nissan Internal' && !vehicle.archived_at && vehicle.status !== 'Archived')
      .map(vehicle => [normalizeRegistration(vehicle.registration),vehicle]));
    const jobs = (rows || []).map(job => {
      const vehicle = vehicles.get(normalizeRegistration(job.registration));
      return {...job,recipient:String(job.customer_email || vehicle?.contactEmail || '').trim(),vehicle};
    }).filter(job => eligible(job, tomorrow, job.vehicle));
    const failures = [];
    let sent = 0;
    for (const job of jobs) {
      const id = `${job.id}:${tomorrow}`;
      // A unique primary key reserves the send across overlapping cron executions.
      try {
        await db('nmuk_service_reminder_sends', {method:'POST',body:JSON.stringify({id,job_id:job.id,booking_date:tomorrow,recipient:job.recipient,status:'pending'})});
      } catch (error) {
        if (/409|23505/.test(String(error))) continue;
        throw error;
      }
      const content = reminderContent(job);
      try {
        const response = await fetch('https://api.resend.com/emails', {method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:sender,to:[job.recipient],...content})});
        if (!response.ok) throw new Error(`Email provider ${response.status}`);
        const result = await response.json();
        await db(`nmuk_service_reminder_sends?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'sent',provider_id:result.id,sent_at:new Date().toISOString()})});
        sent++;
      } catch (error) {
        failures.push({job_id:job.id,error:String(error)});
        await db(`nmuk_service_reminder_sends?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:String(error)})});
      }
    }
    return res.status(failures.length ? 502 : 200).json({date:tomorrow,eligible:jobs.length,sent,failures});
  } catch (error) {
    return res.status(500).json({error:String(error)});
  }
}
