import { readBookingAnalyticsReceipt } from './website-analytics-receipt.js';
import { createHmac } from 'node:crypto';
import { databaseEnvironment, isTestProject } from '../api/_database-environment.js';
import { managerAuthorised } from '../api/message-centre.js';

const origins = new Set(['https://vectamotors.co.uk', 'https://www.vectamotors.co.uk', 'https://vecta-website.vercel.app', 'https://vecta-planner.vercel.app']);
const pages = new Set(['/', '/index.html', '/booking', '/booking/', '/booking.html', '/track', '/track/', '/track.html', '/vecta-site-index.html', '/vecta-site-booking.html']);
const bots = /bot|crawler|spider|headless|lighthouse|pagespeed|facebookexternalhit|preview|monitor|curl|wget/i;
export const londonDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function visitorFingerprint(headers, secret, day) {
  const agent = String(headers['user-agent'] || '').slice(0, 1000);
  const ip = String(headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!agent || !ip || bots.test(agent) || headers.dnt === '1' || headers['sec-gpc'] === '1') return null;
  // Only a daily, keyed hash is stored. No IP, user agent, URL or customer details.
  return createHmac('sha256', secret).update(JSON.stringify(['vecta-website-visitors-v1', day, ip, agent])).digest('hex');
}

export function publicVisit(headers) {
  if (!origins.has(headers.origin)) return false;
  try {
    const referrer = new URL(headers.referer);
    if (referrer.origin !== headers.origin || !pages.has(referrer.pathname)) return false;
    // The planner's home page is the workshop, not the public website.
    return referrer.origin !== 'https://vecta-planner.vercel.app' || !['/', '/index.html'].includes(referrer.pathname);
  } catch { return false; }
}

async function rpc(name, body) {
  const { url, key } = databaseEnvironment({ requireService: true });
  const response = await fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Visitor counts unavailable');
  return response.status === 204 ? null : response.json();
}

export async function websiteVisitorsHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!origins.has(origin)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method === 'GET' && !await managerAuthorised(req)) return res.status(401).json({ error: 'Manager sign-in required.' });
  try {
    if (req.method === 'POST') {
      if (!publicVisit(req.headers)) return res.status(403).json({ error: 'Public website visits only.' });
      // Preview/Test traffic never contributes to the live totals.
      if (isTestProject()) return res.status(204).end();
      let day = londonDay();
      const { key } = databaseEnvironment({ requireService: true });
      let body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};
      let receipt = null;
      if (body.receipt && req.query?.exclude !== '1') {
        receipt = readBookingAnalyticsReceipt(body.receipt, key);
        if (!receipt) return res.status(400).json({ error: 'Invalid booking receipt.' });
        day = receipt.day;
      }
      const hash = visitorFingerprint(req.headers, key, day);
      if (hash) {
        if (req.query?.exclude === '1') await rpc('exclude_website_visit', { p_day: day, p_hash: hash });
        else if (receipt || ['browse', 'progress'].includes(body.kind)) await rpc('record_website_activity', {
          p_day: day, p_hash: hash, p_kind: receipt ? 'booking' : body.kind, p_request: receipt?.id || null
        });
        else await rpc('record_website_visit', { p_day: day, p_hash: hash });
      }
      return res.status(204).end();
    }
    return res.status(200).json(req.query?.history === '1'
      ? await rpc('website_visitor_history', { p_days: req.query?.days === '30' ? 30 : 7 })
      : await rpc('website_visitor_summary', {}));
  } catch {
    return res.status(503).json({ error: 'Website visitor counts are temporarily unavailable.' });
  }
}
