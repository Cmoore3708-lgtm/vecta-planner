VECTA WORKSHOP PRO - OFFLINE CONTINUITY BUILD 1
19 August 2026

WHAT THIS BUILD ADDS
1. Installable Workshop Pro web app (PWA) with cached application shell.
2. Workshop Pro can open from its cached copy when the internet/Vercel/Supabase is unavailable, after it has been loaded online once on that PC.
3. Clear ONLINE / OFFLINE WORKSHOP MODE status.
4. Core Supabase writes can be queued locally and retried when connectivity returns.
5. Daily local browser snapshot stored in IndexedDB; newest 30 daily snapshots retained.
6. Settings > Data & Backup now shows backup status, record count, queued changes, Back Up Now and Download Latest Backup.
7. Cloud pulls now paginate instead of silently stopping at 1,000 rows.
8. Secure /api/full-backup endpoint exports all known VECTA database tables using the server-side Supabase service-role key.
9. Windows backup installer in /backup. It creates a scheduled task at 18:30 each day, downloads a complete JSON backup to Documents\VECTA Backups by default, retains 30 copies and runs later if the PC was off at 18:30.

IMPORTANT
- The PWA must be opened successfully online once on each PC before relying on offline opening.
- The Windows full-backup installer requires the existing Vercel CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY environment variables.
- Browser snapshots and Windows JSON backups are different layers. Keep both.
- This is continuity build 1. A later phase should add a second off-site backup destination and a tested guided restore workflow.
