# VECTA Workshop Pro — V355 System Audit

Status: audit branch only. Production `main` remains pinned to V355 (`9c9f95e`).

## Safety boundary

- `baseline/v355-stable` is the immutable rollback branch.
- No audit/refactor work is merged directly to `main`.
- No runtime deletion is permitted until its behaviour is represented by a parity test.
- Data migrations, Fleet repairs, invoice numbering, deletion/restore and offline replay require destructive-path tests before refactoring.

## Current architecture

| Area | Production authority | Notes |
|---|---|---|
| Main application | `index.html` | 2,106,462 bytes; 16,717 lines; HTML, CSS, data, UI and runtime logic combined |
| Shared browser rules | `public/js/vecta-*-rules.js` | Seven small global modules loaded before the inline application |
| Offline/PWA | `service-worker.js`, `public/service-worker.js` | Two identical copies; network/cache fallback and update lifecycle |
| Server APIs | `api/*.js` | Supabase, website booking, vehicle lookup, push, backup and nightly Fleet refresh |
| Public booking | `booking.html` | Separate booking page |
| Database | Supabase tables plus `supabase/` migrations | Jobs, tasks, customers, vehicles, invoices, service records, website requests and overloaded settings records |
| Hosting | `vercel.json` | London region; nightly Fleet cron at 22:30; catch-all application rewrite |

## Quantified complexity

- 7,002 tracked files.
- 6,489 tracked dependency files under `node_modules`.
- 254 exact-duplicate groups covering 755 tracked files.
- Copied historical trees: `assets/` (11 MB), `css/` (8.1 MB), and `dist/` (8.5 MB).
- 34 script blocks in `index.html`.
- 18 named legacy/version repair blocks from v207 through v332 remain in the live document.
- 74 timer/listener/observer sites across the page and service worker.
- 69 browser-storage access sites.
- 777 commits, with many fixes implemented as later overrides rather than edits to the original implementation.
- 25 regression tests. Coverage is concentrated on recent phone, Fleet service-date and Financial integrity incidents.

## User-facing feature inventory

| Feature group | Required behaviours to preserve | Current implementation |
|---|---|---|
| Planner | Daily diary, date navigation, Today, technician lanes, times, ramps, drag/drop, resizing, unallocated work, task allocation, capacity, print day | Core inline functions plus planner rules and later v240/v241 repairs |
| Jobs | New/edit, customer and vehicle details, multiple job types, pricing, parts, statuses, completion, Ready to Invoice, deleted/restore, admin jobs | Core inline functions plus v310 guards and lifecycle ledger |
| Tasks | Create, allocate, return to list, complete, recurring tasks, mobile task controls | Inline task state plus settings overrides and linked mini-job records |
| Fleet Manager | Vehicle records, groups, contacts, due/overdue lists, MOT, tax, service, six-month safety, completion history, print, month-end work | Core Fleet engine plus multiple v207-v311 rule/repair layers |
| Financial | Today/month/year totals, income streams, quoted/completed recognition, integrity screen | Inline Financial logic plus shared Finance rules and DB completion-date trigger |
| Invoices | Create from jobs, numbering, VAT, payment method, archive, void/restore, printing and email | Inline invoice engine plus shared Invoice rules and protected snapshots |
| Website bookings | Public booking, availability, inbox, accept/create job, contact/archive/delete, alerts | `booking.html`, API functions, inline inbox and shared Booking rules |
| Parts | Automatic service/brake/tyre defaults, ordered/arrived state, traffic-light dots and ordering lists | Inline Parts engine; currently mutates jobs during render |
| Search/history | Registration/name/phone search, customer and vehicle records, job/invoice/paperwork history | Inline search and record modals |
| Service paperwork | Service, on-site service and safety sheets, mileage, inspection fields, saved/printed history | Inline paperwork engine; settings-backed canonical records plus optional mirror table |
| Settings | Business/payment, mechanics, contractors, templates, pricing, cloud test, backup/export | Inline settings UI and `workshop_settings` records |
| Offline/recovery | Local last-known data, IndexedDB daily backups, queued writes, quarantine, service-worker shell/data cache | Inline offline engine, shared Offline Sync rules and service worker |
| Vehicle data | DVSA MOT and DVLA tax lookup, manual lookup, nightly refresh | `/api/vehicle-lookup` and `/api/fleet-nightly-refresh` |
| Notifications | Website-booking push subscription/test and badges | Push API functions and service worker |

## Data authority map

| Data | Cloud authority | Browser copies / ledgers |
|---|---|---|
| Jobs | `jobs` | main local app snapshot, last-good jobs, deletion IDs, terminal lifecycle records, offline queue |
| Tasks | `tasks` | main local app snapshot, independent task-state map, settings override record |
| Customers/vehicles | `customers`, `vehicles` | main local app snapshot and Fleet snapshot |
| Invoices | `invoices` | main local app snapshot, payment-method settings record, protected invoice snapshot |
| Fleet schedules/history | `workshop_settings` Fleet snapshot | several Fleet localStorage keys and MOT authority map |
| Paperwork | `workshop_settings` canonical records | main local app snapshot; optional `service_records` mirror |
| Website requests | `website_booking_requests` | main local app snapshot |

The same logical records can exist in several stores. Reconciliation rules, not just schemas, therefore form part of the data model and must be tested before consolidation.

## High-risk findings

### 1. Rendering is not pure

The global `render()` calls `hydrateAutomaticPartsDefaults()`. That function can mutate every open job, save local data and start one cloud upsert per changed job. `partsOrderingHtml()` calls it again. `fleetHtml()` calls `reconcileCompletedVehicleTaxCyclesV262()`, which can also repair and persist data. Merely opening or refreshing a screen must not perform data migrations.

Required repair: move all migrations to explicit, idempotent data-ingress or maintenance workflows; make every `*Html()` function read-only.

### 2. Function override chains remain

Live functions such as `fleetBind`, `syncFleetMaintenanceFromJob`, `fleetCompletePlanNow`, `gatherJob`, `saveJob` and `applyFleetCloudSnapshot` are wrapped by later version blocks. Correct behaviour depends on script order and on every wrapper calling its predecessor correctly.

Required repair: collapse each chain into one named canonical implementation with unit tests for each rule.

### 3. Legacy modules remain executable

Several blocks contain superseded functions, no-op entry points or disabled UI hooks but still parse and install wrappers/listeners. Their presence increases startup cost and makes ownership unclear.

Required repair: classify each block as active, partially active or dead; extract active rules, test them, then delete the entire obsolete block.

### 4. Repository and runtime authority are unclear

Multiple historical application copies and generated outputs are committed. `schema.sql` is not SQL; it contains an old React application. Root/API files also have copied variants. This makes accidental edits to non-production files likely.

Required repair: establish a manifest of production inputs, remove generated/dependency/history copies from the refactor branch, correct file naming and document deployment inputs.

### 5. Test coverage is below the risk level

The existing 25 tests do not provide end-to-end protection for ordinary job CRUD, planner movement, task lifecycle, parts, invoices, website booking acceptance, settings, printing, offline replay or service-worker upgrades.

Required repair: build a feature-parity suite before structural changes. Data-destructive flows require cloud confirmation and rollback assertions.

### 6. `workshop_settings` is overloaded

Application settings, Fleet snapshots, lifecycle tombstones, paperwork, invoice protection/payment records and job-customer memory share one generic key/value table. This is workable but makes broad pulls and accidental coupling more likely.

Required repair: first introduce typed repository functions and prefixes. A future schema split is optional and must not be combined with the code refactor.

### 7. Service-worker source is duplicated and transforms HTML

Two service-worker files must remain byte-identical. The worker rewrites fetched application HTML using historical string replacements. This can make the executed document differ from the deployed source.

Required repair: generate one worker copy from a single source and remove historical HTML rewriting after a controlled cache-transition release.

## Simplification sequence

1. **Parity harness** — fixtures and tests for all feature groups; no runtime change.
2. **Production manifest/repository hygiene** — remove non-runtime duplicates and committed dependencies on the branch; prove identical build output.
3. **Pure rendering** — move Parts and Fleet mutations out of screen rendering; compare data before/after every navigation.
4. **Canonical rules** — collapse wrapper chains one domain at a time: jobs, tasks, Fleet, invoices, booking, offline sync.
5. **Module extraction** — move stable domain code out of the monolithic HTML without changing markup or data formats.
6. **Single lifecycle coordinator** — one startup, foreground, reconnect and service-worker update path.
7. **Full parity run** — desktop, mobile, online, offline, reconnect, update, two-client sync and destructive recovery tests.
8. **Controlled release** — preview deployment, production approval, monitored release and immediate V355 rollback availability.

## Release gates

A refactor cannot reach `main` unless all of the following pass:

- Existing regression suite.
- Production build and clean-source checks.
- Feature-parity suite for every inventory row above.
- No data writes caused by navigation or render-only actions.
- One owner each for startup, reconnect, foreground refresh and service-worker update.
- Job counts/statuses/allocations match before and after refresh.
- Invoice numbers, totals, VAT and payment methods match.
- Fleet due dates and completion histories match.
- Offline queued changes replay once and cannot resurrect deleted/completed jobs.
- Mobile and desktop browser sessions remain responsive through initial load, update and reconnect.
- Preview deployment passes before any production change.

## Initial conclusion

The working product does not need to be replaced. Its features can be preserved while the implementation is simplified. The safe approach is strangler-style consolidation: freeze V355, surround current behaviour with tests, remove side effects from rendering, then replace each override chain with one canonical module. A big-bang rewrite or bulk deletion is expressly excluded.
