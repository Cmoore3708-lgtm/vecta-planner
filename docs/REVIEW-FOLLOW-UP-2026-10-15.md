# Review follow-up: lookups, cloud refreshes and invoice safety

Prepared after the first stabilisation batch and booking layout #209, on Main
`dda8bb5` (#208). This is a separate batch; source checks do not establish that
these changes are live. The invoice change requires the database migration described
below before deploying the new client. No production business records were edited.
The batch also incorporates Main `284bec7` (#210), preserving its MOT assignment,
booking-flow wording and partial-Haynes-search fixes. Main `567c7e1` (#212) is
also incorporated, preserving shared vehicle artwork and booking validation.

## Government vehicle lookup (review 15)

DVSA authentication/MOT and DVLA tax/colour run concurrently. Authentication has
a 4-second deadline, MOT history 8 seconds and the independent tax call 4 seconds.
A tax timeout or provider error returns the successful MOT data, with an explicit
`taxLookupStatus: unavailable`; unavailable tax data stays blank. No valid tax/MOT
status is invented. The website proxy has its own 14-second upstream deadline.
Both hosting functions allow 30 seconds; the provider deadlines bound normal
execution more tightly.

Concurrent token exchanges share a promise. Concurrent lookups of the same
normalised registration share provider work within one server instance. Completed
vehicle results are not cached: a later deliberate lookup fetches current data.
Pending lookups are bounded to 64 distinct registrations per instance. This is
resource protection, not a distributed/public API rate limiter. Short token
lifetimes are respected; upstream 401 invalidates the cached token for a retry.
This change neither contacts Haynes nor repairs the separate Windows worker.

## Cloud collection reads (part of review 14)

Overlapping downloads with the same table, client, timeout and local write
generation share work. Completed downloads are discarded from this registry.
Callers receive independent copies. SDK mutation start/finish advances the
generation, including failures. Reads made during a mutation are not coalesced.
This prevents a post-save confirmation from reusing a pre-save download.

Pages are ordered by primary key and continue with `id > last_id`, rather than
offsets that shift when preceding rows are deleted. An overall deadline aborts
the network query. Errors, duplicate/missing IDs, malformed responses or excessive
rows fail the whole collection before reconciliation. Offline snapshots remain
available through the existing application flow; failed downloads are not
authoritative empty collections.

This is still a complete-table download, not a delta cursor or a transactional
snapshot. Concurrent remote inserts behind the cursor are seen on the next
refresh; a real snapshot/delta protocol needs a separate database change. Existing
realtime handling remains. Coalescing is within one browser, not across devices.

## Release verification (part of review 20)

Existing endpoints expose a no-store release stamp containing only application,
commit and environment. No new Vercel function or database access is added:

- Workshop: `/api/supabase-config?action=release`
- Website: `/api/availability?action=release`

After deployment, run:

```sh
node scripts/verify-live-release.mjs --commit <exact-40-character-merged-sha>
```

The check requires the expected production commit on Workshop Pro, the public
website and the mechanic alias, plus a passing authenticated database health
probe. Any mismatch, missing stamp, preview, sign-in wall, timeout or HTTP error
fails the check and must be reported as a partial/unverified release. The mechanic
alias currently points at a specific production deployment: move it to the new
production deployment or deploy the prepared forwarding project. Do not promote a
Test-backed preview. An alias check is deliberately included to reveal drift.

This check does not replace device acceptance, booking submission, payment/print
checks, logs or backup restoration. It does not itself publish or move aliases.

## Atomic invoice creation (part of review 23)

New invoices are allocated a number and inserted in one database transaction.
The allocator scans all existing invoice numbers, including drafts/void invoices,
and serialises concurrent creators. It retains the existing invoice-number and
job-link uniqueness constraints. Numbers over five digits are preserved in full.
Existing invoices keep their numbers; the new client no longer downloads the
invoice register to choose a number or renumbers an existing invoice after a conflict.

Each new invoice has a stable ID. Retrying an identical request returns the saved
invoice with its original number. A changed retry, duplicate job link or stale
request after a payment change is refused rather than overwriting saved data.
Failed inserts roll back allocation. The client confirms the returned identity,
number, job link, totals and lines, then performs its existing fresh confirmation
and protected snapshot flow. An ambiguous timeout tells the user to keep the
invoice open and retry. There is no fallback to an unprotected browser allocation.

Deployment prerequisite: apply
`supabase/migrations/20261015114154_atomic_invoice_creation.sql` to production
before deploying this client. It adds any missing optional invoice columns,
retains uniqueness indexes and creates the restricted, security-invoker RPC
`vecta_create_invoice`. Anonymous callers have no execution grant; unrelated
signed-in accounts are refused. The RPC uses the existing workshop app-metadata
claim and table permissions. The migration is applied in isolated Test only;
production application and live release verification are still outstanding.
Deploying the client without the migration will block new invoice saves safely.

`tests/database/atomic-invoices.sql` passed in Test: identical retry, altered
retry, duplicate job link, payment preservation, failed-insert rollback,
consecutive allocation and access restrictions. Its ordinary fixtures roll back.
Two separate concurrent transactions also created distinct consecutive numbers;
both committed synthetic records were removed afterwards, restoring the original
12-invoice Test count. Production financial records were not changed.

The transaction covers number allocation and the initial invoice row only.
Existing invoice edits, linked job updates and protected snapshots are separate
operations. This does not establish atomicity for the entire finance workflow or
replace real-device acceptance.

## Verification and scope

Mocked provider tests exercise parallel calls, partial failure, token/MOT/tax
deadlines, retry, token expiry, malformed responses, registration coalescing and
bounded pending work. No paid/supplier or government requests are needed.
Executable cloud-reader tests cover concurrent reads, mutation boundaries,
separate clients, independent result copies, deletion between pages, timeout,
partial failure and corrupt identities. Release tests cover matching/mismatched
commits, preview rejection and failed access health.

The complete release gate passed with 611 regression tests, finance and sync
integrity checks, and the production build. All 7 integration tests passed. Actual
PC/iPad concurrency and before/after timing on the same devices remain acceptance
checks; no live latency reduction is claimed from unit tests.

## Remaining review items

### Historical import audit and safe retirement work

The read-only production comparison found all 760 source IDs are legacy text
IDs, with no exact primary-key matches in the UUID jobs table. The old background
uploader skipped every one of them. That redundant uploader and its delayed
startup call are removed; no protected history was deleted or imported into
production. Startup's local importer still fills missing historical rows, but
can no longer overwrite an existing row's saved price, instructions, completion,
contact details or other fields. Repeat opens do not reset those amendments.

The inventory also covers initial fleet vehicles/plans, historical completions,
new contractor vehicles and pre-2026 financial history: eight datasets in total.
A read-only tool produces counts, byte sizes and canonical SHA-256 fingerprints:

```sh
node scripts/audit-historical-imports.mjs index.html
```

The regression gate pins the eight existing dataset fingerprints in
`tests/fixtures/historical-source-fingerprints.json`. This contains hashes/counts,
not extracted customer records. An accidental source-data change fails the gate.
Do not update that baseline merely to make tests pass: reconcile any intentional
historical correction or protected-store migration first. The baseline proves
unchanged source data, not that every historical entry was correct originally.

An optional second argument compares a privately obtained protected-history JSON
copy. It never executes the HTML or writes a database. Fingerprints include every
field, not just counts or monetary totals. Even identical copies do not declare
retirement safe: database permissions, current invoice/finance corrections,
application reports and offline/cold-start history still require verification.
Keep output and any source copies private; do not commit extracted datasets.

The audit identified 19 source descriptions containing Full Service without Major
Service. The existing completion importer can classify that wording as Major
Service. No automatic recategorisation is included: changing completion IDs/types
before reconciling existing cycles could create conflicting service history.
Existing source datasets and report calculations remain in place for now. The
historical-source cleanup is still incomplete, including repository history.

The historical-source/startup-import cleanup (2,7) still requires a protected
reconciliation of all 760 embedded historical jobs, invoices and report totals.
Do not simply delete those arrays or run old imports to establish a baseline.
Existing git history remains a separate exposure even after source cleanup.
Distributed public API rate controls (3), per-record fleet storage (4), typed
state (9), module/delta/cache consolidation (13,14,16), worker efficiency/version
reporting and production relay separation (17,18), shared booking source (19),
real-device checks (21), full disaster recovery (22), remaining finance transaction boundaries
and concurrent editing (23), and wider monitoring/retention (24) remain open.
The invoice allocation change is prepared and tested, not yet live. The earlier live database
access restriction is not a claim that these remaining findings are complete.
