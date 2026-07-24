VECTA WORKSHOP PRO — CONSOLIDATED STATIC RELEASE

This package deliberately does not include package.json or the old React/Vite source.
Vercel was detecting that stale source and rebuilding an older version of the app, which caused the old logo/dashboard and missing Fleet amendments.

Upload the CONTENTS of this folder to the repository root and redeploy.
Run MONTH-END-INVOICING-SUPABASE-MIGRATION.sql once in Supabase if it has not already been run.
After deployment use Ctrl+F5 once.

Included:
- Planner renamed Dashboard; old Dashboard removed
- Fleet search restored
- End of month invoicing
- NMUK, Staff and all contractor income streams
- required Customer / Income Stream on every job card
- actual completion dates and quoted ex-VAT amounts
- CSV, consolidated invoice and prepared email
- fleet due-date editing
- maintenance completion rolls from the existing due date, not the date entered
