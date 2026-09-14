# VECTA Workshop Pro — V355 System Audit

Status: completed audit candidate on `audit/system-simplification-v355`. The production application remains V355; this branch has not been merged or promoted.

## Safety boundary

- `baseline/v355-stable` is the immutable rollback branch.
- No audit/refactor work is merged directly to `main`.
- No runtime deletion is permitted until its behaviour is represented by a parity test.
- Data migrations, Fleet repairs, invoice numbering, deletion/restore and offline replay require destructive-path tests before refactoring.

## Current architecture

| Area | Production authority | Notes |
|---|---|---|
| Main application | `index.html` | 2,097,323 bytes; 16,553 lines; HTML, CSS, data, UI and runtime logic combined |
| Shared browser rules | `public/js/vecta-*-rules.js` | Seven small global modules loaded before the inline application |
| Offline/PWA | `public/service-worker.js` | Single deployed source; network/cache fallback and update lifecycle |
| Server APIs | `api/*.js` | Supabase, website booking, vehicle lookup, push, backup and nightly Fleet refresh |
| Public booking | `public/booking.html` | Separate booking page copied to the deployment root by Vite |
| Database | Supabase tables plus `supabase/` migrations | Jobs, tasks, customers, vehicles, invoices, service records, website requests and overloaded settings records |
| Hosting | `vercel.json` | London region; nightly Fleet cron at 22:30; catch-all application rewrite |

## Quantified complexity

- 70 tracked files after repository hygiene (down from 7,002).
- No tracked dependency files under `node_modules` (previously 6,489).
- Historical copied application trees, root API copies, alternate app sources, generated files and duplicate public assets have been removed.
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
| Website bookings | Public booking, availability, inbox, accept/create job, contact/archive/delete, alerts | `public/booking.html`, API functions, inline inbox and shared Booking rules |
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

### 4. Repository and runtime authority were unclear — resolved on the audit branch

Multiple historical application copies and generated outputs were committed. `schema.sql` was not SQL; it contained an old React application. Root/API files also had copied variants. These non-runtime alternatives have now been removed, leaving the production manifest and Git history as the authorities.

Required repair: establish a manifest of production inputs, remove generated/dependency/history copies from the refactor branch, correct file naming and document deployment inputs.

### 5. Test coverage is below the risk level

The existing 25 tests do not provide end-to-end protection for ordinary job CRUD, planner movement, task lifecycle, parts, invoices, website booking acceptance, settings, printing, offline replay or service-worker upgrades.

Required repair: build a feature-parity suite before structural changes. Data-destructive flows require cloud confirmation and rollback assertions.

### 6. `workshop_settings` is overloaded

Application settings, Fleet snapshots, lifecycle tombstones, paperwork, invoice protection/payment records and job-customer memory share one generic key/value table. This is workable but makes broad pulls and accidental coupling more likely.

Required repair: first introduce typed repository functions and prefixes. A future schema split is optional and must not be combined with the code refactor.

## Version-block classification

This classification is based on installed globals, call sites, wrapper chains, timers/listeners and the existing regression fixtures. “Manual” means the rule is intentionally retained as an operator-invoked repair and is not allowed to run during startup, cloud loading, navigation or rendering.

| Block | Classification | Live responsibility | Safe treatment |
|---|---|---|---|
| v207 Fleet due sync | Partially active | Fleet due-date helpers still feed later rules | Retain until Fleet rules are canonicalised |
| v212 safety/service anchor | Active | Keeps six-month safety cycles anchored correctly | Extract only after behavioural parity tests |
| v213 tax due repair | Active | Vehicle-tax due-cycle compatibility | Move into canonical Fleet tax rules |
| v230 amendments | Active | UI/event amendments still installed | Split by owning feature before removal |
| v234 MOT reconciliation | Partially active | MOT expiry parsing remains a dependency of v240/v254/v255 | Keep parser; remove disabled control and no-op Fleet-open wrapper |
| v240 reliability repair | Active | Manual MOT UI, job-modal capacity installer and guarded listeners | Retain; test listener installation and extract by feature |
| v241 calendar script shell | Dead | Comment only; calendar now lives in core scope | Delete immediately |
| v243 search script shell | Dead | Comment only; search now lives in core scope | Delete immediately |
| v254 MOT override | Partially active | Service-only completion guard remains live | Keep guard; remove no-op Fleet-open wrapper |
| v255 all-MOT authority | Active | Current manual authoritative MOT workflow and event control | Canonical MOT target; absorb earlier compatible helpers |
| v264 DVSA authority | Active | Prevents non-authoritative MOT changes | Preserve until MOT consolidation tests pass |
| v277 NMUK/date authority | Manual/active | NMUK classification rule plus callable repair | Separate permanent rule from manual repair |
| v278 master vehicle migration | Manual | Explicit migration only | Retain as operator tool, then archive after migration evidence |
| v290 completion-date helper | Manual/active | Completion-date compatibility and repair helper | Retain pending Financial parity coverage |
| v309 Fleet completion repair | Active | Current-cycle completion semantics | Consolidate with v311 after fixtures cover each plan type |
| v310 Fleet integrity hardening | Manual/active | Save guards plus callable integrity repair | Keep guards; keep bulk repair manual-only |
| v311 MOT completion bridge | Active | Makes verified/current-cycle MOT completion visible | Remove snapshot render callback only after data-ingress redesign |
| v332 service authority | Manual/active | Callable completed-service evidence repair | Keep main rule manual-only |
| v332 late-install shell | Dead | Defines an uncalled local function and changes footer text | Delete immediately |
| v335 service-cycle repair | Manual | Callable full-history service repair | Keep manual-only until superseded by canonical migration |

### First cleanup applied on the audit branch

- Removed the empty v241 and v243 script shells.
- Removed the uncalled v332 late-install shell.
- Removed the v234 and v254 `fleetBind` wrappers whose scheduled callbacks returned immediately.
- Preserved all active MOT parsing, authoritative checks, service-completion guards and callable repair entry points.
- Added regression assertions that the inert wrappers stay absent and the live safety rules stay present.

This first cleanup changes no stored data, network request, visible control or user workflow. It reduces two layers from the `fleetBind` wrapper chain and removes two unnecessary timers each time Fleet was bound.

### Pure-render boundary applied on the audit branch

- `render()`, `fleetHtml()`, `partsOrderingHtml()` and `taxDueVehicles30()` are now read-only with respect to application data.
- Automatic Parts defaults run only after local, authoritative cloud, foreground-cloud or realtime data ingress.
- Completed Vehicle Tax cycle reconciliation runs after local Fleet loading and full cloud Fleet loading.
- The v311 MOT completion rule is installed once; its redundant Fleet-bind wrapper and cloud-snapshot re-render timer were removed.
- Characterisation fixtures prove that Parts eligibility and Vehicle Tax cycle advancement retain their previous behaviour.
- Replaced a zero-test integration command with delivery checks for production scripts, PWA precache assets, Vercel routes and cron targets; removed the broken command that referenced a nonexistent browser server.

This removes navigation-triggered local/cloud writes and a competing Fleet re-render without changing stored formats or user-visible features.

### Job-save repair isolation applied on the audit branch

The v310 job-save wrapper previously scheduled `v310RepairAll(false)` after every successful job save. That bulk routine can canonicalise unrelated records, retire detected duplicates, rewrite Fleet service plans and prune MOT completions. It contradicted the block's own manual-only safety statement.

The automatic bulk call is removed. Targeted validation remains: the draft is canonicalised and checked for a same-registration/same-date On-Site Service duplicate before saving. The full integrity repair remains available only through the explicit operator function `window.v310RepairFleetIntegrity`.

### Authoritative MOT ownership consolidated on the audit branch

The v254 block contained a complete government lookup, manual-button handler and global aliases that were all overwritten by v255 later in the same document. Only its service-only completion guard survived script evaluation. The superseded executable implementation has been removed and the guard retained as a narrowly named block. v255 is now the sole authoritative manual MOT workflow while compatibility aliases continue to point to it.

### Service-worker source authority applied on the audit branch

The worker previously transformed every fetched and cached HTML shell using historical string replacements. This allowed the browser to execute code that differed from `index.html`, obscured which source was authoritative and repeated obsolete patch work after the underlying safety-sheet fix was already present.

The source now contains the safe cache behaviour directly. The worker caches and serves that exact response without HTML rewriting, and its shell cache name is advanced so a preview installation retires the transformed cache. Root and public worker copies remain byte-identical.

### Startup migration boundary applied on the audit branch

Six legacy migrations previously executed while the script was still being evaluated. Most importantly, the service-name migration ran before `loadLocal()`, so it could mark itself complete after inspecting an empty job list. The NMUK classification migration also called a nonexistent generic `save()` function and silently swallowed the error.

These migrations now run from the explicit local-data ingress coordinator immediately after `loadLocal()`. The NMUK migration uses `saveLocal()` and reports whether it changed data. Historical Fleet seeding remains separate because it establishes initial Fleet state rather than migrating loaded job records.

Fleet maintenance rendering also performed five repair/defaulting passes whenever the screen was opened, including a reference to a repair function hidden inside another script's closure. Those calls have been removed from rendering. Service-type normalisation, MOT proximity alignment and Pool contact defaulting now run at controlled data-ingress boundaries; the inaccessible v310 repair reference is no longer part of navigation.

WPC/FMS customer aliases were also being normalised at script-evaluation time. That meant Fleet profiles and vehicles could change before startup completed, while job aliases were inspected before jobs had loaded. The logic is now one named, idempotent migration owned by the post-load startup boundary.

The hard-coded vehicle allocation/contact correction table had the same ordering fault: it executed directly before `init()`, when Fleet seed state existed but locally saved workshop jobs did not. It now runs through the post-load coordinator, where both data sets are available, and no longer writes during script evaluation.

The historical FG05 BZV deletion tombstone also wrote to local storage on every script evaluation. It is now an idempotent named startup migration that saves only when the tombstone is genuinely absent.

Historical Fleet completion seeding was the last remaining Fleet data import invoked directly during script evaluation. It now runs at the controlled post-load boundary and remains protected by its existing one-time marker.

NMUK's dedicated invoice address was also copied into local storage during script evaluation. It is now a post-load migration and writes only when the stored value actually differs.

### Reconnect ordering repaired on the audit branch

Reconnect previously downloaded cloud state first and left queued offline changes waiting for a later five-minute retry. It now has one named owner: queued local writes are flushed first, then the guarded authoritative jobs/tasks refresh runs. Tests enforce both the ordering and the single online-listener boundary.

### 7. Service-worker source was duplicated and transformed HTML — resolved on the audit branch

The duplicated worker sources and historical HTML transformation made the executed document differ from the deployed source. `public/service-worker.js` is now the sole source and caches the deployed application shell without rewriting it.

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

### Repository hygiene applied on the audit branch

The repository tracked 6,489 files under `node_modules`, despite `package-lock.json` already providing a reproducible dependency manifest. Dependencies are now excluded from Git and were reinstalled from the lockfile with `npm ci` before rerunning every test and the production build. This removes stale third-party build output from reviews and substantially reduces the repository's versioned surface without changing runtime dependencies.

Three historical one-shot GitHub Actions existed solely to run patch scripts and push the resulting `index.html` back into the repository. A fourth workflow had write permission and would automatically rewrite and commit the application when a marker disappeared. All patch-and-push automation is removed. One read-only CI workflow now installs from the lockfile, runs regression and delivery tests, and builds the application on pushes and pull requests; the IO invariants formerly checked by the rewrite workflow are permanent regression assertions.

### Server/API hardening applied on the audit branch

The dependency audit reports zero known vulnerabilities, and the repository contains environment-variable names but no committed secret values. The customer additional-work creation endpoint previously trusted caller-supplied registration, vehicle and customer contact fields while operating with privileged database access. It now requires an existing workshop job, derives identity/contact fields from that database record, caps requests at 50 items and rejects blank, non-finite, negative or excessive prices. The customer approval link and workshop workflow remain unchanged.

### Month-end invoice integrity consolidated on the audit branch

Ordinary invoices already checked the live cloud register, handled duplicate-number conflicts and verified the saved row before changing local state. Fleet month-end invoices bypassed that path: they incremented the local number and launched an unconfirmed background upsert. Month-end approval is now asynchronous and uses the same confirmed cloud-register function. The invoice enters local state only after cloud confirmation; a failure consumes no local invoice number and shows an explicit failure message.

The legacy invoice-to-job relinking path could mark an invoiced job completed without assigning `completed_at`. Invoice cancellation and restore also assumed a completion date already existed. All three now preserve an existing completion date or derive one deterministically from the invoice date, falling back to the booking date. This closes an application-side route by which completed revenue could disappear from weekly or monthly totals even before the database trigger is considered.

### Fleet wrapper consolidation applied on the audit branch

Cloud snapshot email markers and the five-column “due within 30 days” table were installed by redefining their owning Fleet functions after those functions had already been declared. Both behaviors now live directly in `applyFleetCloudSnapshot` and `fleetMaintenanceHtml`. Characterization assertions protect the email marker merge, CSS column class and “Work due” heading while preventing either base-function wrapper from returning.

On-Site Service canonical pricing and same-vehicle/date duplicate prevention were also implemented by wrapping `gatherJob` and `saveJob` late in startup. These rules now execute directly in the canonical gather/save paths. A save gathers the form once instead of twice, while retaining the £90 pricing rule and duplicate warning.

An August emergency-recovery statement erased the local deleted-job tombstone store on every page load. That made explicit deletion evidence non-durable on a device and left the cloud terminal ledger as the only protection against resurrection. The historical cleanup is now a named, one-time V355 migration after local data load; every later explicit deletion survives restarts as intended.

The service-only and MOT-authority protections no longer wrap `syncFleetMaintenanceFromJob` in two later version blocks. Workshop job completion reaches one inert MOT-sync boundary, so it cannot alter an MOT due date or create MOT completion history. The government lookup remains the sole MOT write authority, while service and six-month safety processing retain their existing canonical paths.

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

## Current verification status

- Clean lockfile dependency installation: passed.
- Dependency vulnerability audit: zero known vulnerabilities.
- Regression suite: 82 passing, including task and planner lifecycle, invoice numbering/VAT/save/cancel/restore/print authority, website-booking duplicate protection, offline queue/reconnect/startup, complete Fleet backup restoration and preview runtime isolation.
- Static delivery/API integration suite: 7 passing, including a permanent single-production-tree check.
- Production Vite build: passed.
- Local HTTP delivery smoke test: main application, booking, approval, manifest, service worker and invoice rules all returned HTTP 200 with non-empty content.
- Interactive browser test: passed against the protected Vercel deployment and its stable branch alias.
- Isolated Vercel preview: deployed successfully from the latest audit branch commit; Vercel cloned the branch, built 87 modules, produced the 2.10 MB application shell and marked the preview `READY`. The `/booking` route returned HTTP 200 from the deployed artifact. Production was not targeted.
- The audit branch is identified from Vercel's server-side Git metadata instead of relying on the browser hostname. Any preview without an isolated database also fails into local-only mode and clears its unusable sync queue, so cached browser credentials cannot connect a preview to production.
- Interactive preview verification opened all eight main sections successfully. The reported invoice-print failure was reproduced and traced to `/api/supabase-config` returning 503 on a generated deployment URL that did not contain the branch name. The corrected preview returns 200, displays `V355 safe test mode`, and finalised and printed a disposable £65 invoice without an alert. The linked job left Ready to Invoice and invoice `VECTA-00001` appeared in the saved invoice list. Production was not targeted.

## Initial conclusion

The working product does not need to be replaced. Its features can be preserved while the implementation is simplified. The safe approach is strangler-style consolidation: freeze V355, surround current behaviour with tests, remove side effects from rendering, then replace each override chain with one canonical module. A big-bang rewrite or bulk deletion is expressly excluded.
