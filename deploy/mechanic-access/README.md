# Separate mechanics access

The mechanics address exposes only `/mechanic.html`, its two UI assets and
`/api/mechanic`. The public release probe is forwarded only for `action=release`.
There is no catch-all proxy to Main or its database-session issuer.

Main hosts the restricted page and API. Configure `VECTA_MECHANIC_USER=mechanic`
and a distinct `VECTA_MECHANIC_PASSWORD` as server-only variables on the
**vecta-planner** project. Use different Preview and Production passwords.
Never put passwords in source, frontend config, or this proxy project.

The mechanics gate uses its own Basic realm, signing purpose and host-only cookie.
It never mints a Supabase token. The server-side API returns only permitted job
fields and cannot expose invoices, customer contacts, prices or settings.
Main credentials and database policies remain unchanged.

Mechanics can choose a date and technician, view active jobs, start work and save
technician notes. Saves compare `updated_at` and update only the allowed columns.
Final completion stays in Main so service, financial and notification flows run
together. Offline writes are unavailable; keep the page open after a failed save.
Unsaved notes stay in page memory with a leave prompt.

## Ordered release

1. Pass `npm run release:gate` and test the Preview against the isolated Test DB.
2. Obtain approval for the tested preview under `RELEASE-SAFETY.md`.
3. Configure a distinct Production password without changing Main credentials.
4. Release the reviewed Main commit; verify the new page and API first.
5. Deploy these proxy files only to `vecta-mechanic-dashboard`.
6. Verify both mechanics aliases: login, cookie, read, save and Main/finance denial.

No migration or business-record rewrite is required. If verification fails,
restore the preceding protected proxy. Never restore anonymous database access
or fall back to Main credentials.
