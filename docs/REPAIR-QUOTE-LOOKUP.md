# Workshop Pro repair quote lookup

Requested by Chris: enter a registration and “Supply and fit alternator” in a
new quote; show the vehicle already provided by the job editor, the cheapest
compatible stocked GSF alternator/photo, and Haynes replacement labour.
Parts markup uses marginal bands per individual part: 50% on the first £50 of
cost, 20% on the next £100, and 10% on the amount above £150. Round the
combined markup once to the nearest penny. Labour is £50/hour, rounding the Haynes time up to the next 30-minute
increment (exact half-hours stay unchanged). The internal quote panel displays
GSF cost, markup, selling price, original Haynes time and chargeable hours.
Customer invoice lines show selling prices and rounded chargeable hours only. Every displayed amount is excluding
VAT. Exchange surcharges are excluded for now.

## Delivered code

- Quote-only editor panel; automatic lookup after typing the complete supported
  instruction, plus explicit lookup/cancel/refresh and Add to quote.
- Exact pence calculations, fractional hours, complete-catalogue and same-variant
  checks, explicit VAT fields, stock checks and source expiry.
- Separate parts/labour invoice lines, private source snapshot persisted
  through the existing private-pricing note. Existing manual net lines survive.
  Existing gross/no-VAT lines block mixing until reviewed. No new job columns.
- Authenticated manager endpoint and independently paired read-only PC worker.
  Mechanics cannot use the endpoint; no pricing UI in their editor.
- Dedicated browser profiles, so the existing Haynes/tyre workers stay separate.
  Supplier credentials are entered directly into Edge, never into code.
- Staged service-role-only queue/RPC, atomic deduplication and leasing, retries,
  120-second task deadline, rate limits, bounded retention and short cache.
- Current operation coverage: alternator replacement only. Other descriptions
  explicitly require setup; multi-part requests are not silently underquoted.

## Live readiness — NOT complete

This is a staged implementation, not verified live GSF/Haynes automation.
The earlier GSF package confirmed one product-by-SKU price, but registration
selection was failing in its research browser. The current Haynes worker covers
service schedules, not repair times. There are no verified alternator catalogue
selectors, repair-time selectors or vehicle mappings in this repository.

`repair-config.example.json` deliberately has `calibrationApproved:false`, blank
selectors and no vehicle mappings. No real prices, labour times or registrations
are invented. Each new vehicle currently needs a reviewed variant mapping.
There is no automatic arbitrary-registration discovery or variant-selection UI
in this first staged version; uncertain/unmapped registrations stop for review.

## PC calibration checklist

1. Extract the packaged worker and run SETUP-REPAIR-QUOTES.cmd. Node 22+ and
   Microsoft Edge are required. Sign in to GSF and Haynes in the dedicated windows.
2. Copy repair-config.example.json to repair-config.local.json. With the actual
   pages open, record the visible registration controls, read-only navigation,
   identity, VAT, complete result count, part row, SKU/brand/description, account
   cost, stock and image selectors. Exchange surcharges are excluded at
   Chris’s request; a missing surcharge field does not block the quote.
3. Record the Haynes registration controls, selected identity, exact replacement
   operation ID/label, decimal time and explicit Hours unit. Do not use a service
   interval, diagnostic time, tenths-of-hour code or minutes as decimal hours.
4. For each test registration, copy vehicle-mapping.example.json into vehicles.
   Verify exact GSF and Haynes identity text, engine/variant/alternator rating and
   replacement scope. Record fitment evidence and review timestamp; mappings
   expire after 30 days. Confirm all GSF result pages are included. Set approved
   true only after this check; enable calibration only after live comparison.
5. The reader requires literal EX VAT, In stock/Out of stock and a decimal Hours
   column. Adjust the reader with fixtures if the actual UI uses other wording.
   Blank selectors are a pending calibration task, not working integration.
6. Verify 3–5 real vehicles manually against GSF account costs, deposit/photo,
   cheapest compatible stocked product, Haynes scope/hours and the net quote.
   Exercise login expiry, offline, ambiguity, stock changes and pagination.

## Backend Test setup

Apply docs/sql/repair-quote-queue.sql to isolated Test only, after local SQL checks.
No existing job, finance, fleet, service or tyre table is changed. The RPC runs as
security invoker; only service_role has table/function grants; RLS is enabled.
The normal environment helper selects Test credentials in previews.

Set REPAIR_QUOTING_ENABLED=true on the Test preview only. Generate a separate
random 32-byte hex REPAIR_QUOTE_WORKER_TOKEN and put the same secret in the
preview server and PC environment. Set REPAIR_QUOTE_ORIGIN to that exact preview
https://...vercel.app origin on the PC. Never put secrets in local JSON, Git or
public scripts. Run START-REPAIR-QUOTES.cmd.

Production remains unchanged/disabled until live calibration, queue verification,
release gate, desktop/iPhone/iPad preview checks and release review are complete.
Do not bypass RELEASE-SAFETY.md or update the dashboard baseline for this change.

## Current exchange surcharge policy
Chris requested that exchange surcharges be ignored for now. They are neither
required by the supplier reader nor included in quote totals or invoice lines.
This exclusion is a pricing choice, not evidence that the supplier charges none.

## Independent PC check
Run workers/repair-quotes/CHECK-REPAIR-QUOTES.cmd. No backend token, database
setup or production activation is required. It uses two dedicated Edge profiles;
stop the repair quote worker first to avoid a profile conflict. Sign in directly
in Edge, press Enter when GSF is ready, then open the FV65 JTY Haynes repair-time
row and press Enter. The script saves repair-pc-check.local.json for review.
It contains selected product fields/operation text only, not page HTML, VINs,
passwords, cookies or account details. The capture does not prove fitment.

Direct research-browser verification on 25 October: search DREA8828 returns
DriveTec A8828 (Alternator - 150 Amp), £194.74 ex VAT, £233.69 inc VAT, and
positive stock at Boldon/RDC/NDC. Product image read from the visible dialog.
Registration catalogue selection still fails in that browser. Haynes redirects
to sign-in; GSF’s Haynes button offers a trial, which was declined.
The Haynes capture reader is based on Chris’s screenshot and still needs its
first live PC verification. No arbitrary-registration automation is activated.

## Multi-part quote layout
Each part has one horizontal row: description, parts cost price, sale price,
labour hours, labour cost and final price including VAT. Add part creates an
editable additional row; its cost uses the same marginal markup, sale price can
be adjusted, and only additional fitting hours should be entered. The current
automatic supplier lookup still covers alternators only; extra rows are manual.
Rows can be removed and blank/invalid entries cannot be applied. Up to 20 parts.

The combined net amount is saved in ex_vat mode, with original source evidence
and all rows retained privately. VAT is calculated once at 20% on the combined
net amount. Any penny allocation difference is assigned through cumulative row
VAT so displayed row totals sum to the grand total. No gross totals are saved
as net invoice lines. Saved multi-part breakdowns reopen in the same editor.
On narrow screens the table scrolls horizontally to keep each part on one row.

## First PC capture result and Haynes retry
Chris's uploaded PC report on 25 October captured real GSF A8828 at £194.74
ex VAT, image and positive stock; Haynes reported NEEDS_CHECK without a reason.
The reader now tolerates nested operation labels/code prefixes, ignores hidden
copies and reports specific reason codes. The checker inspects permitted Haynes
frames and refuses multiple matching operations. These are possible causes,
not a confirmed diagnosis from the original report.
CHECK-HAYNES-ONLY.cmd skips GSF and retains a previous local GSF capture if it
exists in the same folder. It does not activate the lookup. Run with the visible
FV65 JTY Renew the alternator row open in the newly launched Haynes window.

## Verified PC labour capture — 26 October 2026
Checker 2026-10-25.6 captured operation 1E02944501WV0, Renew the alternator,
0.70 hours from the workshop PC at 08:10 UTC. This is a real DOM capture, not a
fixture result. Its registration field was blank and fitmentConfirmed was false;
it does not independently establish vehicle identity or part fitment.

The automatic worker now uses that same reader after the existing exact selected
vehicle identity check. It requires the reviewed operation ID/label, rejects
conflicting times across frames, and rejects a conflicting visible registration.
No labour time is hardcoded. Registration navigation, GSF complete compatible
catalogue capture and reviewed vehicle mappings remain uncalibrated. The example
configuration remains disabled; this does not activate production pricing.

### Automatic Haynes registration path
An optional `haynes.navigationMode: "workshopdata-registration"` reuses the
existing vehicle worker's DOM reader and observed #numberPlate/#licencePlateBtn
controls. It requires an explicitly reviewed `haynesTypeId` per vehicle mapping,
checks the returned registration/type, then follows the unique visible-page
Repair Times QUICKGUIDES link for that type. It expands Alternator and uses the
PC-verified time reader. Login, multi-result selection, mismatched type, missing
links and conflicting operations stop the quote. This new navigation path has
unit coverage but still needs an end-to-end PC run; it is not enabled by default.
The packaged quote worker includes the shared read-only Haynes DOM module.

### Combined remaining PC check
Run the root FINISH-REPAIR-SETUP.cmd from the setup package. Its window is titled
VECTA - FINISH REPAIR QUOTE SETUP. In its GSF window select FV65 JTY and the
alternator category, leaving the catalogue cards visible. The check saves only
limited vehicle/product structure, not page HTML, input values or account panels.
This is diagnostic evidence: it never marks the catalogue complete or approves
fitment. After sign-in, its Haynes step tests the new automatic registration path
against the previously observed type/operation IDs. These IDs constrain this test
only; a successful check does not enable or approve any production mapping.

The result is repair-setup-result.local.json. The launcher highlights that file
in Explorer after completion. It uses the existing isolated repair-test profiles,
so close other repair-test windows first; the live tyre and vehicle workers use
separate profiles. Profiles and *.local.json reports are excluded from packages.

### PC navigation result and expansion correction
The 26 October combined result verified the Haynes registration/type and reached
Repair Times, then failed at EXPAND_ALTERNATOR. Expansion previously counted rows
immediately after click and included enclosing LI lists. It now waits for the
reviewed operation's leaf LI row to appear, rejects multiple visible matches, and
scrolls the unique row into view. A delayed-insertion regression covers this.
GSF captured £194.74 and £215.32 cards but no explicit catalogue count. No claim of
complete fitment selection or live pricing is justified yet. Setup 2026-10-26.2
also captures full rooted selector paths and limited card-parent structure for
stock/image/brand calibration, without account panels or raw HTML.

### Follow-up result — 08:36 UTC, 26 October
Setup .2 stopped at OPEN_HAYNES with the generic PAGE_NOT_READY reason. The
underlying browser error was not retained, so a closed window or navigation
replacement cannot be distinguished from this report. No cause is claimed.
Setup .3 avoids reloading an already-open Haynes start page, retries transient
execution-context replacement, waits for the registration input, and records
bounded specific error codes without raw messages/URLs. RETRY-HAYNES.cmd skips
GSF, whose evidence is already captured; keep this test browser open until the
result has been saved. The checker then waits before closing it.

The GSF card-parent capture exposes Show More, so the two observed prices do not
establish completeness. The combined checker now expands this exact observed
control with bounded progress checks. No-change, ambiguous controls or a limit
stop expansion and preserve diagnostic data with catalogueComplete:false.

### Automatic navigation now reaches operation capture
PC setup .3 (08:47 UTC) passed navigation and failed at READ_OPERATION. Diagnostic
rows still show IDs 1E02944501WV0 (0.70) and 1D01901429WV0 (0.30). The old adapter
collapsed reader rejection detail into LABOUR_REVIEW_REQUIRED, so the exact
rejection cannot be reconstructed from that report. Setup .4 preserves it.

The worker now passes its reviewed operation ID into the DOM reader. Other job
IDs do not conflict with an explicitly reviewed operation; unscoped capture still
rejects multiple jobs, and two times for the same reviewed ID still fail. Times
remain read from the supplier. Unit text can be outside the viewport after
scrolling to the row, but must remain rendered rather than display-hidden.
Vehicle registration/type verification still runs before this scoped capture.

### Scoped row visibility correction
PC setup .4 at 08:56 UTC failed specifically with OPERATION_NOT_VISIBLE after
navigation. The diagnostic retains both DOM rows, but does not establish whether
viewport position or accordion clipping caused that rejection. Scoped capture
now permits the reviewed ID outside viewport bounds, while still rejecting
zero-size/display-hidden/ancestor-clipped rows. Unscoped scans keep viewport
filtering. If all permitted frames reject with OPERATION_NOT_VISIBLE, the worker
can toggle the unique Alternator heading once and retry. It never clicks an
add-to-estimate control. Setup .5 records row geometry if a further failure
occurs. These changes have fixture tests; a live automatic capture is still pending.

## Consolidated supplier worker and live Haynes milestone
On 26 October at 09:01 UTC, PC checker 2026-10-26.5 automatically searched
FV65JTY, matched type t_317000375, navigated to repair times, and captured
operation 1E02944501WV0, Renew the alternator, 700 thousandths of an hour.
This is live navigation evidence for that vehicle/operation, not a fixture.
The overall report still has fitmentConfirmed:false; it does not approve a GSF
mapping or enable pricing.

The GSF conversation confirmed using one supplier worker for website services
and Workshop Pro repairs. This branch now incorporates the shared GSF PC modules
from PR #360 commit 64bee691822de102feed3a918f60a0658447667c. Its worker polls the
repair queue optionally as well as its service queue, serially in the same GSF
browser context/profile (VectaGSF/EdgeProfile). Repair jobs use isolated tabs,
plus the existing VectaRepairQuotes/Haynes session for labour. There is no second
production GSF browser or second GSF sign-in. The product details reader is also
shared, including popup/full-page support and a part photo.

Repair quoting keeps its own server calculation, reviewed mappings, token and
queue. It does not use website service markup or preset service labour. Repair
completion is retained across delivery retries, so retrying delivery does not
rerun a supplier lookup. A repair pairing failure does not disable service work.
The old repair worker entry point forwards to the shared runner; its --setup
mode signs into Haynes only. Install the shared worker's locked dependencies via
workers/gsf/setup.cmd before production use. Diagnostic checkers remain separate
from the production runner and should be closed before starting it.

The service endpoints/queue remain owned by PR #360; coordinate the two PRs
before release. This branch carries the PC modules for integration/testing, not
a second service backend. Both sets of feature gates remain disabled until
compatible catalogue completeness, queue pairing and preview flow are verified.
The next live supplier work is GSF registration/category navigation, Show More,
SKU/stock/price/photo extraction and proof of the complete compatible list.

### Shared-profile GSF navigation check
CHECK-GSF-CATALOGUE.cmd runs setup .6 with --gsf-only. It uses the same
VectaGSF/EdgeProfile as the consolidated service/repair runner, so close previous
GSF test windows first. After sign-in it attempts the observed ENTER REG / VIN,
Search VRM Button and Electrical > Rotating > Alternator controls. Any failure
records its stage and allows manual navigation in that same window before
capturing/expanding the catalogue. It never starts Haynes or activates pricing.
Automatic category navigation still requires a live PC test; reaching a category
does not itself approve part fitment or catalogue completeness.

### Expanded GSF catalogue capture — 09:52 UTC, 26 October
Setup .6 entered the registration and Electrical, then timed out at GSF_ROTATING.
After manual category navigation, Show More expanded once and the capture held
six priced alternatives: DriveTec £194.74 Local Branch; Lucas £215.32 RDC; Denso
£361.63 Branch Network; Elstock £191.12 Out Of Stock; WAI £156.74 Out Of Stock;
Autoelectro £382.12 Out Of Stock. Zero-price Bronze entries were also explicitly
shown out of stock in the enclosing group. The header showed DREA8828 and the
part images were captured. This is real PC evidence, not an automatic navigation
success or proof that every compatible catalogue group was returned.

A shared options analyser now selects DriveTec £194.74 among the displayed
available choices, excludes the cheaper unavailable options, and keeps
catalogueComplete:false, fitmentConfirmed:false and verifiedPart:null. It never
assigns the displayed group SKU to other brands. Unknown stock labels, unknown
brand images, zero prices and truncated captures require review. Both fixture
regressions and analysis of the actual uploaded capture passed. The checker will
include this bounded analysis in subsequent results.

Next navigation evidence needed: the visible GSF URL of the final alternator
category page, to establish a reviewed category route rather than guessing menu
labels after the Rotating timeout. No further Haynes test is needed for FV65JTY.

### Confirmed alternator route
Chris supplied https://trade.gsfcarparts.com/parts/Alternator from his signed-in
browser. The navigation path now searches the registration, confirms selected
registration evidence, opens this exact category URL, then waits for both the
selected registration and priced alternator choices. The category address itself
does not establish fitment. Lost vehicle state or a different destination fails
review. This bypasses the timed-out Rotating menu rather than guessing its label.
The production adapter supports gsf.navigationMode:gsf-alternator-category; other
vehicle identity/VAT/catalogue completeness gates remain mandatory. Setup .7 uses
the same route and still requires a live automatic navigation run.
