const TABLES = [
  'jobs',
  'customers',
  'vehicles',
  'tasks',
  'notes',
  'invoices',
  'invoice_lines',
  'service_records',
  'service_reminders',
  'mot_history',
  'website_booking_requests',
  'job_parts',
  'mechanic_time_off',
  'additional_work_approvals',
  'workshop_settings'
];

function baseConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not configured.');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return { url: String(url).replace(/\/$/, ''), key };
}

async function fetchPage(table, offset, limit) {
  const { url, key } = baseConfig();
  const endpoint = `${url}/rest/v1/${encodeURIComponent(table)}?select=*&offset=${offset}&limit=${limit}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : []; } catch { body = text; }
  if (!response.ok) {
    const message = body?.message || body?.error || String(body || `Supabase ${response.status}`);
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return Array.isArray(body) ? body : [];
}

async function fetchAll(table) {
  const limit = 1000;
  let offset = 0;
  const all = [];
  while (true) {
    const rows = await fetchPage(table, offset, limit);
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
    if (offset > 250000) throw new Error(`Safety limit reached while exporting ${table}.`);
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not configured.' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  try {
    baseConfig();
    const startedAt = new Date().toISOString();
    const data = {};
    const counts = {};
    const skipped = {};

    for (const table of TABLES) {
      try {
        const rows = await fetchAll(table);
        data[table] = rows;
        counts[table] = rows.length;
      } catch (error) {
        // Older VECTA schemas may not contain every newer optional table.
        // A missing optional table must not prevent the rest of the database being backed up.
        const msg = String(error?.message || error);
        if (error?.status === 404 || /does not exist|not found|schema cache/i.test(msg)) {
          data[table] = [];
          counts[table] = 0;
          skipped[table] = msg;
          continue;
        }
        throw error;
      }
    }

    const finishedAt = new Date().toISOString();
    const totalRecords = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    const backup = {
      format: 'VECTA_WORKSHOP_PRO_FULL_BACKUP_V1',
      created_at: finishedAt,
      started_at: startedAt,
      supabase_project: (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0],
      counts,
      total_records: totalRecords,
      skipped_optional_tables: skipped,
      data
    };

    const stamp = finishedAt.slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="VECTA-FULL-BACKUP-${stamp}.json"`);
    return res.status(200).send(JSON.stringify(backup));
  } catch (error) {
    console.error('Full backup failed', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
