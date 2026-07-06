# Vecta Planner 2.0 - Cloud Safe Starter

Static deploy: upload all contents to GitHub. Vercel can serve this without npm install.

Before live use:
1. Run `supabase/schema.sql` in Supabase SQL Editor.
2. Open the site.
3. Go to Settings.
4. Paste Supabase Project URL and anon public key.
5. Create one fake customer, vehicle and job.
6. Confirm records appear in Supabase tables.

This version refuses to save garage data unless Supabase is connected.
