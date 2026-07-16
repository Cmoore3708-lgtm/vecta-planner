export default function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  res.setHeader('Cache-Control', 'no-store');

  if (!supabaseUrl || !supabasePublishableKey) {
    return res.status(500).json({
      error: 'Missing Supabase environment variables'
    });
  }

  return res.status(200).json({ supabaseUrl, supabasePublishableKey });
}
