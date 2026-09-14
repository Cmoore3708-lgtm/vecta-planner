import {
  databaseEnvironment,
  isAuditPreviewEnvironment,
  isPreviewEnvironment
} from './_database-environment.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
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
