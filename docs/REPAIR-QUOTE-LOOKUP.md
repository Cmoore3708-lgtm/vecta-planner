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
VAT. A refundable exchange deposit is separate and is not marked up.

## Delivered code

- Quote-only editor panel; automatic lookup after typing the complete supported
  instruction, plus explicit lookup/cancel/refresh and Add to quote.
- Exact pence calculations, fractional hours, complete-catalogue and same-variant
  checks, explicit VAT and deposit fields, stock checks and source expiry.
- Separate parts/labour/deposit invoice lines, private source snapshot persisted
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
   cost, stock, image and explicit exchange surcharge selectors. A missing
   surcharge value must be investigated; do not assume zero.
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
