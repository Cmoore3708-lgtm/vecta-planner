# Vecta Planner v1.8 Production Safe

Production-safe recovery based on the real Vecta source project.

Changes:
- Removes demo/fake job seeding.
- Blocks local browser job storage for live data.
- Adds missing lucide icons that caused blank screens.
- Requires Supabase connection before use.
- Saves jobs to Supabase `jobs` and also syncs basic customer/vehicle records.

Deploy: upload the contents of this folder to GitHub. Vercel will build with Vite.
