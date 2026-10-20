# Authenticated workshop data cutover

## Boundary

The existing manager Basic/signed-cookie login is the workshop identity boundary.
The server mints a normal Supabase Auth JWT only after validating that login and
same-origin checks. Its server-owned `app_metadata.vecta_access` claim is required
by RLS. A random signed-up Supabase user is not a workshop user. Service keys,
refresh tokens and passwords are never returned to clients. Tokens live only in
memory and renew through the logged-in server session before expiry.

This preserves the existing shared workshop permissions. It does not invent
individual mechanic identities or change which workshop employee sees finance.
Individual staff roles can be introduced separately with explicit requirements.

The mechanics aliases authenticate separately and rewrite to the distinct
`mechanic.html` entry, restored from the original standalone mechanics build.
That entry has Dashboard and Completed Jobs, the mechanics planner and staged
work completion. Main keeps its management navigation and credentials. See
`deploy/mechanic-access/README.md` for the recovered source and release checks.
The existing workshop data role remains shared; UI separation must not be
represented as a newly implemented financial-data RLS boundary.

## Ordered deployment

1. Apply the migration to Test; verify anon, unrelated authenticated and workshop
   JWT cases, including read/write rollback checks.
2. Pass the release gate and access-specific tests. Deploy the compatible app.
3. Check `/api/supabase-config?action=access-health` reports authenticated access
   and check unauthenticated session requests return 401.
4. Deploy the protected mechanic entry point and verify its upstream login and
   API paths. Inspect both deployed aliases.
5. Apply the production migration once compatible clients are available.
6. Repeat direct REST anonymous denial, authenticated health and public website
   checks. Verify original business row counts are unchanged.

Old open tabs cannot sync anonymously after cutover and must refresh. Their
offline records remain; do not clear browser data or the offline queue.

## Recovery

Before cutover, rollback may use the preceding application deployment. After
cutover, retain the authenticated app when reverting unrelated features. Never
restore unconditional anonymous policies as a workaround. A failed identity
exchange returns a safe error and leaves offline records available.

Public booking/customer-link server APIs keep service-side access. Privileged
approval creation, notification management and service-data requests also require
the existing workshop session. Rendered app chunks require login; removing the
historical source data from repository history remains a separate review item.
