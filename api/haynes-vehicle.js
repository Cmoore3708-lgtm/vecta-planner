import { normaliseReg, validReg, vehicleResult } from '../lib/haynes-vehicle.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // This development endpoint cannot be enabled on production by a query parameter.
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ status: 'DISABLED' });
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ status: 'METHOD_NOT_ALLOWED' }); }
  if (Array.isArray(req.query.reg)) return res.status(400).json({ status: 'INVALID_REGISTRATION' });
  const registration = normaliseReg(req.query.reg);
  if (!validReg(registration)) return res.status(400).json({ status: 'INVALID_REGISTRATION' });
  const token = process.env.HAYNES_WORKER_TOKEN, endpoint = process.env.HAYNES_WORKER_URL;
  if (!token || token.length < 32 || !endpoint) return res.status(200).json({ status: 'NOT_CONFIGURED' });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Invalid worker URL');
    const response = await fetch(new URL('/lookup', url), {
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registration }), signal: AbortSignal.timeout(28000)
    });
    const data = await response.json();
    if (!response.ok || data.status !== 'MATCHED') {
      const status = ['LOGIN_REQUIRED', 'VERIFICATION_REQUIRED', 'AMBIGUOUS', 'BUSY', 'DAILY_LIMIT'].includes(data.status) ? data.status : 'UNAVAILABLE';
      return res.status(200).json({ status });
    }
    return res.status(200).json({ status: 'MATCHED', vehicle: vehicleResult(data.vehicle, registration) });
  } catch { return res.status(200).json({ status: 'UNAVAILABLE' }); }
}
