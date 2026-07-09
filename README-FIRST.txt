VECTA Workshop Pro v41 Stable Recovery
======================================

This package is deliberately boring and stable.
It is a static, single-file deployment. There is no React build, no npm install, no hidden dependency chain, and no Vercel build command needed.

FILES
-----
index.html
  The full app. Upload this to the root of the GitHub repo.

vecta-supabase-schema-safe-v41.sql
  Safe Supabase schema. Run this in Supabase SQL Editor before connecting the app to Supabase.
  It creates/extends tables only. It does not drop tables or wipe data.

vercel.json
  Small Vercel config to prevent stale cached index.html.

HOW TO DEPLOY
-------------
1. Unzip this package on your computer.
2. Open your GitHub repository for vecta-planner.
3. Go to the repo root, not inside a subfolder.
4. Upload index.html, vercel.json and this README.
5. Commit changes.
6. Vercel should deploy automatically.
7. Visit https://vecta-planner.vercel.app and hard refresh with Ctrl + F5.

SUPABASE SETUP
--------------
1. Open Supabase.
2. Open SQL Editor.
3. Paste and run vecta-supabase-schema-safe-v41.sql.
4. In the app, go to Settings.
5. Paste the Supabase anon key.
6. Click Test / Connect.

IMPORTANT
---------
The app works even if Supabase is not connected. It saves to the browser first.
That is intentional. A broken database connection should never again give you a blank screen.

If you already have real data in Supabase, do not run random old SQL files. Use only the safe v41 schema in this package.


V41.1 CONTROLLED FIXES
- Created after v41 was confirmed working with Supabase.
- Visual/layout patch only: no database schema change required.
- Fixes: fallback preserved, dashboard label restored to Unallocated Jobs, schedule row time overlap improved, tasks moved to bottom of planner, compact job card modal, preset job template editor restored in Settings.
