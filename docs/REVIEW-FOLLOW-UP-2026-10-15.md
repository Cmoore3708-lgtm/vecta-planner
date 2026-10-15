# Review follow-up: lookups, cloud refreshes and release verification

Prepared after the first stabilisation batch and booking layout #209, on Main
`dda8bb5` (#208). This is a separate batch; source checks do not establish that
these changes are live. No schema migrations or business-record edits are needed.
The batch also incorporates Main `284bec7` (#210), preserving its MOT assignment,
booking-flow wording and partial-Haynes-search fixes.

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

## Verification and scope

Mocked provider tests exercise parallel calls, partial failure, token/MOT/tax
deadlines, retry, token expiry, malformed responses, registration coalescing and
bounded pending work. No paid/supplier or government requests are needed.
Executable cloud-reader tests cover concurrent reads, mutation boundaries,
separate clients, independent result copies, deletion between pages, timeout,
partial failure and corrupt identities. Release tests cover matching/mismatched
commits, preview rejection and failed access health.

The complete release gate and integration suite must pass before merging. Actual
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
real-device checks (21), full disaster recovery (22), atomic invoice allocation
(23), and wider monitoring/retention (24) remain open. The earlier live database
access restriction is not a claim that these remaining findings are complete.
