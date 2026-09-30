const SANDBOX_BASE = 'https://sandbox.oneautoapi.com';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ONEAUTO_API_KEY;
  if (!key) return res.status(503).json({ error: 'ONEAUTO_API_KEY is not configured for this deployment' });

  const vrm = String(req.query.vrm || 'FX69XWU').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(vrm)) return res.status(400).json({ error: 'Invalid VRM' });

  // Intentionally sandbox-only. Never switch this endpoint to the live One Auto host.
  const candidates = [
    `/api/v1/solifi/vehicle-identification/vrm/${encodeURIComponent(vrm)}`,
    `/api/v1/solifi/ids-code/vrm/${encodeURIComponent(vrm)}`,
  ];

  const attempts = [];
  for (const path of candidates) {
    const response = await fetch(SANDBOX_BASE + path, {
      headers: { 'x-api-key': key, accept: 'application/json' },
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
    attempts.push({ path, status: response.status, body });
    if (response.ok) return res.status(200).json({ sandbox: true, vrm, matchedPath: path, result: body });
  }

  return res.status(502).json({ sandbox: true, vrm, error: 'Sandbox VRM lookup failed', attempts });
}