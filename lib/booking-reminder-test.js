import { validManagerSession, managerGate } from '../middleware.js';
import { reminderContent, staffReminderContent, sender, staffSender } from './nmuk-service-reminders.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'POST required'});
  const host = String(req.headers.host || '');
  if (!host || req.headers.origin !== `https://${host}` || !String(req.headers['content-type'] || '').startsWith('application/json')) {
    return res.status(403).json({error:'Open the reminder test from Workshop Pro.'});
  }
  const request = new Request(`https://${host}/reminder-test.html`, {headers:req.headers});
  const credentials = {user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
  if (!(await validManagerSession(request,credentials)) && managerGate(request,credentials)) {
    return res.status(401).json({error:'Manager sign-in required.'});
  }
  const kind = req.body?.kind;
  if (!['staff','nmuk'].includes(kind)) return res.status(400).json({error:'Choose a reminder type.'});
  if (!process.env.RESEND_API_KEY) return res.status(503).json({error:'Email sender is not configured.'});
  const from = kind === 'staff' ? staffSender : sender;
  const content = (kind === 'staff' ? staffReminderContent : reminderContent)({registration:'TEST CAR',customer_name:'Chris'});
  content.subject = '[TEST] ' + content.subject;
  content.text = 'TEST ONLY — this is not a real booking.\n\n' + content.text;
  content.html = '<p><strong>TEST ONLY — this is not a real booking.</strong></p>' + content.html;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':`vecta-reminder-test-${kind}-${Math.floor(Date.now()/300000)}`},
      body:JSON.stringify({from,reply_to:from,to:['chris@nissan-fleet.co.uk'],...content}),
      signal:AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok || !result.id) return res.status(502).json({error:`Email provider rejected the test (${response.status}). Check the sender domain is verified.`});
    return res.status(200).json({recipient:'chris@nissan-fleet.co.uk',from,provider_id:result.id,message:'Email provider accepted the test. Check your inbox and junk folder; acceptance does not prove delivery.'});
  } catch {
    return res.status(502).json({error:'Could not confirm the send. Wait five minutes before trying again, and check your inbox first.'});
  }
}
