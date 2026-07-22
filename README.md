# VECTA Workshop Pro — V41.5

This is the lean static deployment package.

## Deploy
Upload the complete folder to the existing Vercel project. No npm install or build command is required: `index.html` is the live application.

## Files retained
- `index.html` — live workshop application
- `assets/vecta-logo.png` — shared logo used throughout the site and printed documents
- `api/` — Vercel serverless configuration and vehicle lookup endpoints
- `supabase/schema.sql` — full database schema reference
- `vercel.json` — routing and no-cache configuration

## V41.5 changes
- Consistent job-type colours across the planner, job lists, mobile cards, preset buttons, history and printed day planner.
- Full Service is red; Interim Service is light red; Six Month Safety Check is orange.
- No job type uses green.
- Live red current-time line across the planner.
- Today’s planner automatically hides completed blank hours, but retains any unfinished earlier job.
- “Show full day” and “Follow current time” controls.
- Removed obsolete release notes, duplicate builds, duplicate logos and unused source bundles.
