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
