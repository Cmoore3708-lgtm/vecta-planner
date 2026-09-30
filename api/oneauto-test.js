const SANDBOX_BASE = 'https://sandbox.oneautoapi.com';

async function oneAuto(path, key) {
  const response = await fetch(SANDBOX_BASE + path, {
    headers: { 'x-api-key': key, accept: 'application/json' },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
  return { path, status: response.status, ok: response.ok, body };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ONEAUTO_API_KEY;
  if (!key) return res.status(503).json({ error: 'ONEAUTO_API_KEY is not configured for this deployment' });

  const vrm = String(req.query.vrm || 'FX69XWU').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(vrm)) return res.status(400).json({ error: 'Invalid VRM' });

  const lookup = await oneAuto(`/solifi/vehiclelookupfromvrm/v2?vehicle_registration_mark=${encodeURIComponent(vrm)}`, key);
  if (!lookup.ok) return res.status(502).json({ sandbox: true, vrm, lookup });

  const idsCode = lookup.body?.result?.solifi?.ids_code;
  if (!idsCode) return res.status(502).json({ sandbox: true, vrm, error: 'No IDS code returned', lookup });

  const [schedule, technical] = await Promise.all([
    oneAuto(`/solifi/serviceschedulefromidscode/v2?ids_code=${encodeURIComponent(idsCode)}`, key),
    oneAuto(`/solifi/technicaldatafromidscode/v2?ids_code=${encodeURIComponent(idsCode)}`, key),
  ]);

  return res.status(200).json({ sandbox: true, vrm, idsCode, lookup: lookup.body, schedule, technical });
}