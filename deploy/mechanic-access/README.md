# Protected mechanic entry point

The existing mechanics URL forwards to the current, authenticated Workshop Pro
deployment. The upstream manager gate validates the existing workshop login and
sets its signed, host-only session cookie on this entry point. API requests use
the same protected upstream and short-lived Supabase session exchange.

This replaces the standalone September build which accessed production as anon.
No credentials or service-role key are copied into this project. Test the login
challenge, remembered cookie, database session exchange, planner and saved job
flow through the mechanic alias before restricting production data access.

Deploy these files only to the existing `vecta-mechanic-dashboard` project.
Never revert to the anonymous build after the database access migration.
