import {
  databaseEnvironment,
  isAuditPreviewEnvironment,
  isPreviewEnvironment
} from './_database-environment.js';

async function checkCloudHealth(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const { url, key } = databaseEnvironment({ requireService: true });
    const response = await fetch(`${url}/rest/v1/jobs?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(503).json({
        ok: false,
        supabase_status: response.status,
        error: body.slice(0, 300) || `Supabase returned ${response.status}`,
        checked_at: new Date().toISOString()
      });
    }
    return res.status(200).json({ ok: true, supabase_status: response.status, checked_at: new Date().toISOString() });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return res.status(503).json({
      ok: false,
      error: timedOut ? 'Supabase health check timed out' : String(error?.message || error),
      checked_at: new Date().toISOString()
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query?.health === '1') return checkCloudHealth(req, res);
  if (isAuditPreviewEnvironment()) {
    return res.status(200).json({ auditPreview: true });
  }
  try {
    const { url: supabaseUrl, publishableKey: supabasePublishableKey } = databaseEnvironment();
    if (!supabasePublishableKey) throw new Error('Supabase publishable access is not configured.');
    return res.status(200).json({ supabaseUrl, supabasePublishableKey });
  } catch (error) {
    /* A preview without its own database must remain useful for local testing,
       but must never fall back to credentials cached by the browser. */
    if (isPreviewEnvironment()) {
      return res.status(200).json({ auditPreview: true });
    }
    return res.status(503).json({ error: String(error?.message || error) });
  }
}
