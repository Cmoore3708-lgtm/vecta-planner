import { databaseEnvironment } from './_database-environment.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { url: supabaseUrl, publishableKey: supabasePublishableKey } = databaseEnvironment();
    if (!supabasePublishableKey) throw new Error('Supabase publishable access is not configured.');
    return res.status(200).json({ supabaseUrl, supabasePublishableKey });
  } catch (error) {
    return res.status(503).json({ error: String(error?.message || error) });
  }
}
