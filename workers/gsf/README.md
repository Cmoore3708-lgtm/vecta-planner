# GSF service pricing — staged worker

The queue, pricing engine, signed booking prices and PC worker are implemented. Production remains disabled. **Automatic coverage of arbitrary registrations is not complete.**

## Investigation results

In the signed-in research browser, exact part-number search works. Searching `UFI23.265.00` returns a product card with SKU `23.265.00`; clicking that SKU opens the **Part Details** dialog. Its rendered fields explicitly show UFI, £4.94 **ex vat**, £5.93 including VAT, RRP £20.18, and positive stock in Boldon/RDC/NDC. RRP is not the account cost.

The vehicle-history action separately reports `Vehicle not found` in this browser even though the recent list contains the correctly identified car. The user's phone can open the vehicle catalogue. This does not prove an account-wide fault or explain the supplier's underlying cause. One bulk oil promotional SKU search also returned no results; do not assume every promotional code is searchable.

These observations establish one filter product price and the dialog layout. They do **not** establish all filter fitments, oil specification/capacity or three complete service prices for ten registrations. No purchasing, basket updates, hidden supplier APIs or session extraction were used.

## Current worker approach

1. A reviewed recipe links a registration, service, quality range and mileage window to compatible parts, verified oil specification and fill quantity. Recipe review expires after 30 days.
2. In `approved-skus` mode, the worker searches each saved supplier part number in GSF's visible interface. It requires exactly one SKU result and verifies its SKU, brand and description again inside Part Details.
3. The read-only dialog reader isolates the **ex-VAT account cost**, checks the separate including-VAT cost, and verifies stock. Multiple prices, changed SKU/brand, out-of-stock products or unclear VAT fail closed.
4. The server applies parts markup, preset net labour, VAT and rounding. Only the customer price and selected parts reach the booking browser.
5. An unknown/unreviewed vehicle, failed lookup or expired sign-in retains the existing engine-band guide price. Saved fitment evidence allows known vehicles to be repriced without relying on GSF's failing registration-selection action.

Oil sold in packs is converted to a per-litre cost, rounded up to a penny, then multiplied by the verified fill quantity. Manufacturer oil specification and pack size must be checked; engine size is not an oil-capacity source.

The older selector-based `readProduct` path is retained for verified vehicle-catalogue workflows. It is not the default; the new SKU/dialog path needs no hand-entered product CSS selectors or invented product URLs.

## Trial commercial policy

`pricing-policy.example.json` now contains Chris's requested **trial scenario**, not activated production configuration:

- 50% markup on purchase costs: parts and oil cost × 1.5.
- Oil & Filter Change labour: £35; Full Service: £70; Major Service: £110.
- Labour is interpreted as excluding VAT; 20% VAT is applied once to the resulting total.
- Exact penny totals; no £5/£10 rounding.

Example equations: oil/filter = `(1.5 × applicable costs + 35) × 1.20`; full = `(1.5 × applicable costs + 70) × 1.20`; major = `(1.5 × applicable costs + 110) × 1.20`. Required major extras must follow the reviewed vehicle scope, not be guessed from fuel type.

## Independent PC price check

The downloadable package now has a top-level **START-HERE.cmd**. Extract All and run that file. It delegates to `workers/gsf/setup.cmd`, which checks Node 22+, Microsoft Edge and the local profile directory, installs locked dependencies, runs `self-check.mjs`, then opens the automatic price check.

Stop any existing GSF worker first. Sign in directly in the dedicated Edge window if needed, then press Enter in the terminal. The script searches the known UFI test product automatically and validates the selected SKU, brand, description, price, VAT and stock. It saves selected product fields to `gsf-product-capture.local.json`; failures after browser launch save a small `gsf-check-diagnostic.local.json` where possible. Neither file contains passwords, cookies, VINs, account details or page HTML. The product capture is deliberately marked **fitment not verified**.

To check another product manually, use `node probe.mjs --manual`, then open its Part Details dialog before pressing Enter. `SIGN-IN-GSF.cmd` opens the same profile for manual sign-in. Automatic credential entry is not implemented.

This check does not need queue credentials, database changes or website activation. Nothing is ordered. The live Windows test remains pending; offline package and arithmetic tests do not replace it.

## Prepared ten-car comparison

`COMPARE-TEN-CARS.cmd` runs a sequential local comparison using the approved worker mappings. Copy `comparison-input.example.json` to `comparison-input.local.json`, select ten different registrations and complete their mileage/range details. The template has four observed registrations and six intentionally empty slots. A missing or duplicate registration is rejected.

The runner needs an approved `gsf-config.local.json` with the correct filter fitments, oil specification/quantity and service scope for each combination. It refreshes costs and calculates all three services using the 50% trial policy, saving `service-comparison.local.json`, a readable Markdown table and a CSV. A missing/unverified combination is marked **Needs verification**, with no fabricated or zero price. This standalone comparison does not activate the website or need backend credentials.

The offline self-check uses clearly synthetic costs and verifies expected totals of £96.00 / £177.60 / £279.60. Those are arithmetic examples only, not quotes for any actual registration.

## Approved recipes

Copy `gsf-config.example.json` to `gsf-config.local.json` and leave `calibrationApproved: false` until the complete service flow is checked. The default mode is `approved-skus`. Populate recipes using `recipe.template.json`. Each needs explicit approval/review date, exact registration/variant, service/range, appropriate mileage window, manufacturer oil source, scope source and **fitmentSource**.

Each selected product needs fields like this observed filter example (it is **not** a complete service recipe):

```json
{
  "kind": "oil_filter",
  "sku": "23.265.00",
  "searchTerm": "UFI23.265.00",
  "brand": "UFI",
  "description": "Oil Filter - Spin-on Filter",
  "quantityMilli": 1000,
  "packQuantityMilli": 1000,
  "vatBasis": "EX_VAT",
  "vatEvidence": "GSF Part Details explicitly labels the account cost ex vat"
}
```

Oil `quantityMilli` is the verified fill in ml; `packQuantityMilli` is the selected product's pack size in ml. Other parts use 1000 per unit. Do not treat a selected product's availability or price as evidence that it fits a vehicle.

After complete recipe/PC validation, set `calibrationApproved: true`, set private `GSF_WORKER_TOKEN` and `GSF_WORKSHOP_ORIGIN` in the PC environment, then run `START-GSF-PRICING.cmd`. Never put credentials in Git or public JavaScript. The worker needs no Supabase key.

## Backend activation — still pending

- Apply `docs/sql/gsf-service-queue.sql` to isolated Test first, with advisors and test queries. It is a staged setup script, not an automatically applied migration, and touches no existing jobs/invoices/fleet/Haynes/tyre tables.
- Configure the preview's existing Test database credentials. New queue tables use RLS and service-role-only grants; browsers cannot access them.
- Set independent random 32-byte hex values for private `GSF_WORKER_TOKEN` and `GSF_SERVICE_QUOTE_SECRET`; never reuse tyre/Haynes tokens.
- Put the reviewed trial policy JSON in `GSF_SERVICE_PRICING_POLICY`. Set `GSF_SERVICE_PRICING_ENABLED=true` only on the configured test deployment. Production stays disabled until real vehicle comparisons and booking checks pass.
- The standalone website proxy targets Main by default. During preview testing use the matching preview backend; Main's built-in booking page uses its same-origin endpoint.

The queue deduplicates requests, serializes work with leases, caches successes for five minutes and failures for one minute, bounds lookups, and limits hourly/daily volume. Customer quotes last 30 minutes. Their signature, selected service/mileage/range and total are validated on booking and the selected parts/price are recorded. The existing £65 MOT/£5 combined service offer remains separate.

## Validation and next work

Run `node --test tests/regression/gsf-service-pricing.test.mjs`, then `npm run release:gate` (install the existing Haynes worker test dependencies first). Parser fixtures reconstruct the observed UFI dialog; they do not substitute for live Windows tests. SQL was verified separately in local PGlite PostgreSQL.

Next: validate the PC price check, capture reviewed vehicle/filter/oil mappings for ten different registrations, connect trusted Haynes scope/oil data to broader recipe discovery, and compare all three service totals against manual GSF calculations. Test expiry, offline, missing parts, price changes, duplicate submissions and desktop/mobile booking before following `RELEASE-SAFETY.md`.

General repair-parts quoting in Workshop Pro can reuse this pricing core, but its UI is outside this amendment.


## Workshop Pro repair quotes
The shared runner can also consume /api/repair-quote-worker when
REPAIR_QUOTE_ORIGIN and REPAIR_QUOTE_WORKER_TOKEN are set. Its reviewed config is
workers/repair-quotes/repair-config.local.json (or REPAIR_QUOTE_CONFIG_FILE).
The repair bridge uses this runner's GSF context serially, its own temporary tabs,
and the existing dedicated repair Haynes profile. It never applies service
pricing policy to repair evidence. Service settings remain required only when
GSF_WORKSHOP_ORIGIN/GSF_WORKER_TOKEN are configured. Calibration and production
activation are pending; see docs/REPAIR-QUOTE-LOOKUP.md.
