# Parts diagnostics: start once, review together

## Delivered scope

GSF parts and service validation over a saved cohort of 100 genuine vehicle
registrations. Six independent cases per vehicle: live Major Service validation
(or the EV service when the saved fuel type is electric), oil filter, air filter,
cabin filter, fuel filter and engine oil. Inapplicable categories are recorded as
skipped, not passes. Haynes labour and tyre lookups are explicitly NOT_TESTED.
This is the parts-diagnostic component of #424, not a claim that all three
supplier workers are covered.

A diagnostic uses the exact same catalogue selection, fresh product reading and
service validators as the current GSF worker. Description, SKU, price, stock,
vehicle selection and oil quantity disagreements retain their distinct reasons.
The matching policy and Guide price fallback are unchanged. Supplier checks are
not an independent human confirmation of correct fitment.

## Launch and report

After deployment, use the manager-protected link:

`https://<workshop-deployment>/worker-tests.html?start=100`

The navigation opens a page which submits an authenticated POST. GETs themselves
never mutate state. Hidden/prerendered pages do not launch tests. Session storage
keeps the launch identity across reloads; the database also permits only one
active run. A copied run link opens the existing report rather than restarting.
No passwords or pairing tokens appear in the URL.

The page links to Pause, Resume, End test and Retest the same vehicles. Retest
freezes the original sample and compares completed outcomes with the previous
run, including new failures for previously passed cases. Closing the page does
not stop the PC worker. The assistant can retrieve the manager-protected JSON at
`/api/worker-tests?id=<run-id>` for grouped fixes. Customer requests take priority
between diagnostic cases; a case is bounded to 170 seconds.

The 100-vehicle sample comes only from the deployment's database. Selection
normalizes/deduplicates registrations, includes CM14KEL/G4WPC/XJ07WAL/NU67VSE/FV65JTY when
present, and balances recorded make, fuel and age groups. It does not invent
registrations or fetch customer names, contact details or addresses. If fewer
than 100 eligible registrations exist, the batch refuses to start and reports
the available count. A 2-registration smoke link is available with `?start=2`;
use that on the repaired PC before the first 100-registration run.

## Required deployment and PC update

1. Apply `docs/sql/worker-tests.sql` in the isolated Test database first. This
   creates private RLS-protected diagnostic tables and a service-role-only RPC;
   it does not alter quote, booking or financial tables.
2. Deploy the amendment preview. Existing environment variables are reused:
   `GSF_SERVICE_PRICING_ENABLED`, `GSF_WORKER_TOKEN` (or existing repair token
   fallback), and the deployment's normal database service access. Test previews
   retain the existing Test database safety lock.
3. Include `workers/gsf/diagnostic-{case,bridge}.mjs`, updated `worker.mjs`, updated
   `live-service.mjs` and `lib/worker-tests.js` in the repaired permanent worker
   installation. The live repair package builder includes these automatically.
   The older GSF package builder follows relative imports to avoid missing files.
   Preserve `.local.json` settings and the Edge profile. Do not run a separate
   diagnostic worker against the same GSF profile.
4. The PC's `GSF_WORKSHOP_ORIGIN` and token must pair with the exact deployment
   being tested. A production worker does not automatically poll a preview.
   Never repoint the working customer worker just to make a preview look ready.
5. The diagnostic capability advertises only with an approved `vehicle-catalogue`
   configuration. Its heartbeat means the process and configuration are ready;
   supplier sign-in is tested by the first real read. If sign-in expires, the run
   pauses and the case stays untested. No new pairing token is needed.
6. Verify a controlled sample on the workshop PC after repair. Production release
   still follows RELEASE-SAFETY.md, including preview checks and Chris's approval.
   Apply the reviewed additive schema to production only with the release.

Until those steps are complete, the start page truthfully reports worker offline,
configuration required, disabled pricing or unavailable test storage. A preview
URL alone is not proof of a connected workshop worker. No real supplier batch was
started while developing this feature.

## Durability and limits

A case receives a unique lease, 210-second deadline and at most two attempts.
Expired leases can resume. Network/timeout failures have one retry. Permanent
vehicle failures continue to the next category. Login expiry, supplier HTTP
throttling/outage and configuration blockers pause without counting remaining
vehicles as defects. The browser page closes on timeout/cancellation of a case;
manual pause/cancel stops new cases (a current read may finish).

Before a result is delivered it is atomically written to the PC's
`workers/gsf/diagnostic-receipt.local.json`. A relay failure retries that receipt
before reading another case, including after a process restart. Receipts contain
only allowlisted evidence, not credentials. Server acknowledgements are
idempotent and expired or cancelled leases cannot overwrite results.

Reports keep named descriptions, product IDs, brands, quantities, stage/reason
codes and build identity. Arbitrary errors, full page text/HTML, account URLs,
cookies and screenshots are not uploaded. Table/API access remains manager-only.
Each run freezes a SHA-256 fingerprint of the worker's lookup and diagnostic
source files, in addition to its diagnostic protocol capability. Changing those
files during an unfinished run pauses it; retesting creates a separate run. No scheduling, automatic ordering,
customer notification or automatic patch/deployment is performed.

## Verification

- `node --test tests/regression/worker-tests.test.mjs` checks cohort selection,
  authentication/CSRF, fresh capability preflight, exact-sample reruns, evidence
  filtering, failure reporting, sign-in pauses, timeout cleanup and durable
  delivery after a process restart.
- `tests/worker-tests-queue.sql` runs in one rolled-back transaction in isolated
  Test. It checks private access, double-click deduplication, exclusive leases,
  stale acknowledgements, login pause/resume, bounded retry, crash recovery and
  cancellation. It never calls a supplier or changes a real vehicle.
- Run `npm run release:gate` and inspect desktop/phone rendering before release.

## Required regression: CM14 KEL

CM14KEL is first in a new cohort when present. Its production Major Service
lookup completed with REVIEW_REQUIRED on 29 October 2026 at 10:56:19 UTC.
That is a historical failure, not a newly completed batch case. The prior worker
did not save its detailed cause; do not assert a description/fitment cause until
the diagnostic worker captures it. The cohort carries the baseline into reports.

## One-time PC updater and direct connection (29 October)

`VECTA-Start-100-Vehicle-Test.zip` contains START-TEST.cmd. It stages a checked
release beside the existing permanent installation, waits for managed workers to
finish their current requests, activates the new release, restarts the same
workers and requests the 100-vehicle batch automatically. The desktop shortcut,
private data folder and supplier profile paths remain the same. It refuses an
unknown base release and retains the previous release. A blocked old-channel
entry prevents the original stable release immediately undoing this update.

The standalone `worker-batch-tests` Edge Function is deployed only to isolated
Test. It verifies the PC's existing paired token by SHA-256 against the existing
paired-worker identity and uses the service-role-only diagnostic queue. No new
password, pairing token, public table access or Vercel preview cookie is needed.
The PC credential is decrypted by the existing Windows account, never placed in
the updater or URL, and never returned to the assistant. Existing Haynes/tyre
heartbeats and allowances are not modified by diagnostic authentication.

Only the GSF worker gains the diagnostic branch; normal customer work still uses
its existing production routes and wins between diagnostic cases. All evidence
and cohort records remain in isolated Test. No production application/schema
release is required for this one-time direct relay path. The new function rejects
unauthenticated requests with HTTP 401; its own authentication is why platform
JWT verification is disabled. The endpoint does not allow arbitrary SQL/actions.

Build with scripts/batch-test-update/package.mjs using the user's resolved
permanent-worker bundle. The updater's source release is 6deec1d71fe343fab652d71ae849b6ab4e31f9f0.
The artifact contains no credentials. Tests cover unpaired access rejection,
Test/Main isolation, CM14KEL inclusion and one-time automatic start. A simulated
installation passed module loads, worker syntax, preserved pairing/profile data,
rollback retention, checksum rejection and protection against channel downgrade.
Windows UI execution and authenticated supplier reads still require running the
updater on the workshop PC; do not report the 100-vehicle test started beforehand.
