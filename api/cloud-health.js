function config() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not configured.');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return { url: String(url).replace(/\/$/, ''), key };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const { url, key } = config();
    const response = await fetch(`${url}/rest/v1/jobs?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      },
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

    return res.status(200).json({
      ok: true,
      supabase_status: response.status,
      checked_at: new Date().toISOString()
    });
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
