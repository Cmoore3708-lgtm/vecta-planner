# Website visitor counters

Requested by Chris on 5 November 2026: show today's website visitors to the right of Workshop Pro, above the day's takings, with yesterday alongside.

The manager header reads `/api/admin-website?visitors=1` once a minute while visible. Counts always refer to UK calendar dates, independently of the selected planner date. Unknown, untracked and unavailable figures display an em dash; a tracked day with no visits displays zero. The tooltip identifies the partial first day. Mechanics do not fetch or display these totals.

The public homepage, booking and tracking pages send a small, non-blocking visit request. A keyed daily hash of the Vercel-provided IP and browser user agent deduplicates repeat requests across pages and tabs. This is an estimate of unique visitors: matching browsers on one connection may merge; changing browsers or networks may count again. No cookies or browser storage are added. Raw IPs, user agents, URLs, registrations and customer details are not stored. Known bots, automated browsers, Do Not Track and Global Privacy Control are excluded. Preview hosts do not collect visits and Test deployments cannot write live counts.

## Database and rollout

Apply `scripts/website-visitors.sql` to the isolated Test project before testing the hosted preview, then to Main before the approved release. Both tables and both RPCs are private to the service role, with RLS enabled and no anonymous or authenticated grants. The existing environment helper prevents a Preview deployment from accessing Main. Collection records its start time on the first accepted visit; it cannot recover earlier days. Visitor hashes older than yesterday are removed on the next accepted visit.

The Test migration confirmation expired during preparation on 5 November, so the schema has not yet been applied to either hosted database. The exact SQL was verified with local PostgreSQL (PGlite): repeat requests counted once, distinct visitors counted separately, prior untracked days returned null, tracked empty days returned zero, yesterday remained separate, retention removed old hashes, and anonymous/authenticated access was denied. API and UI regressions cover authentication, public-origin filtering, preview isolation, UK summer/winter dates, unknown/zero states and mechanics separation.

The visible layout was checked on Main desktop (1348px) and phone (390px), and generated mechanics phone (390px) and tablet (1024px). The layout baseline records only the requested header style change; existing renderers and injected styles are unchanged. Apply the repository release process and update the mechanics aliases after an approved shared release.
