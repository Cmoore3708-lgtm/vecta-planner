# GSF service pricing — staged worker

The queue, pricing engine, signed booking prices and PC worker are implemented. Production remains disabled. **Automatic coverage of arbitrary registrations is not complete.**

## Shared worker decision — 26 October 2026

Do not install or start another GSF worker from this amendment. PR #361 (`amendment/repair-quote-lookup`) already extends the runner to poll the service and repair queues serially in one GSF browser/profile. Complete the workshop-PC navigation/fitment setup there. The old standalone setup and comparison shortcuts below are retained for development history, not a second production installation.

This amendment owns the service calculation, service queue, signed booking prices and service comparison. The repair amendment owns the combined runner and repair quoting. Preserve the combined runner when integrating the branches; never overwrite it with this branch's older service-only `worker.mjs`. See `docs/gsf-service-pricing-handoff.md` for the integration contract and verification blockers.

## Investigation results

In the signed-in research browser, exact part-number search works. Searching `UFI23.265.00` returns a product card with SKU `23.265.00`; clicking that SKU opens the **Part Details** dialog. Its rendered fields explicitly show UFI, £4.94 **ex vat**, £5.93 including VAT, RRP £20.18, and positive stock in Boldon/RDC/NDC. RRP is not the account cost.

The vehicle-history action separately reports `Vehicle not found` in this browser even though the recent list contains the correctly identified car. The user's phone can open the vehicle catalogue. This does not prove an account-wide fault or explain the supplier's underlying cause. One bulk oil promotional SKU search also returned no results; do not assume every promotional code is searchable.

These observations establish one filter product price and the dialog layout. They do **not** establish all filter fitments, oil specification/capacity or three complete service prices for ten registrations. No purchasing, basket updates, hidden supplier APIs or session extraction were used.

## Current worker approach

1. A reviewed recipe links a registration, service and quality range to compatible parts, verified oil specification and fill quantity. Mileage is optional and never determines these default package parts. Recipe review expires after 30 days.
2. In `approved-skus` mode, the worker searches each saved supplier part number in GSF's visible interface. It requires exactly one SKU result and verifies its SKU, brand and description again inside Part Details.
3. The read-only dialog reader isolates the **ex-VAT account cost**, checks the separate including-VAT cost, and verifies stock. Multiple prices, changed SKU/brand, out-of-stock products or unclear VAT fail closed.
4. The server applies parts markup, preset net labour, VAT and rounding. Only the customer price and selected parts reach the booking browser.
5. An unknown/unreviewed vehicle, failed lookup or expired sign-in retains the existing engine-band guide price. Saved fitment evidence allows known vehicles to be repriced without relying on GSF's failing registration-selection action.

Oil sold in packs retains its original net pack price and verified pack size. Chris's 26 October instruction rounds the charged oil quantity up to the next whole litre: 6.7L is charged as 7L, while exactly 7L remains 7L. The verified actual fill is retained separately. The cost is `packNetPence × chargedMl / packMl`, rounded once to a penny before markup. This avoids rounding the per-litre rate first. Older per-litre results remain readable, but the updated readers return the exact pack evidence for new quotes. Manufacturer oil specification and pack size must be checked; engine size is not an oil-capacity source.

The older selector-based `readProduct` path is retained for verified vehicle-catalogue workflows. It is not the default; the new SKU/dialog path needs no hand-entered product CSS selectors or invented product URLs.

## Trial commercial policy

Named packages also include **Interim Service** (oil and oil filter only) and **EV Major Service** (air and cabin filters only). Interim reuses the oil/filter net labour. EV Major needs no engine-oil specification or capacity, but requires verified EV fitment and an explicitly configured net labour value before live pricing; do not infer labour from its saved total quote. The ten selected comparison vehicles still use the three original combustion-engine packages.

`pricing-policy.example.json` now contains Chris's requested **trial scenario**, not activated production configuration:

- 50% markup on filters (× 1.5); 30% markup on engine oil (× 1.3).
- Oil quantity is charged at the next whole litre before the markup. Booking evidence records both the required fill and the charged litres.
- Oil & Filter Change labour: £30; Full Service: £60; Major Service: £100.
- Labour is interpreted as excluding VAT; 20% VAT is applied once to the resulting total.
- Exact penny totals; no £5/£10 rounding.

Example equations: oil/filter = `(1.5 × applicable costs + 35) × 1.20`; full = `(1.5 × applicable costs + 70) × 1.20`; major = `(1.5 × applicable costs + 110) × 1.20`. Package scope follows VECTA’s default parts list. Major diesel services always include a compatible fuel filter; major petrol services exclude spark plugs. Spark plugs are discussed and quoted separately if needed.

## Independent PC price check

**Paused: use the shared worker setup in PR #361.** The old downloadable package has a top-level **START-HERE.cmd**, which delegates to `workers/gsf/setup.cmd`. It is not the combined service/repair installation.

Stop any existing GSF worker first. Sign in directly in the dedicated Edge window if needed, then press Enter in the terminal. The script searches the known UFI test product automatically and validates the selected SKU, brand, description, price, VAT and stock. It saves selected product fields to `gsf-product-capture.local.json`; failures after browser launch save a small `gsf-check-diagnostic.local.json` where possible. Neither file contains passwords, cookies, VINs, account details or page HTML. The product capture is deliberately marked **fitment not verified**.

To check another product manually, use `node probe.mjs --manual`, then open its Part Details dialog before pressing Enter. `SIGN-IN-GSF.cmd` opens the same profile for manual sign-in. Automatic credential entry is not implemented.

This check does not need queue credentials, database changes or website activation. Nothing is ordered. The live Windows test remains pending; offline package and arithmetic tests do not replace it.

## Prepared ten-car comparison

`comparison-input.example.json` now contains the ten registrations previously selected from Workshop Pro: NU67VSE, FV65JTY, NJ66GXH, LS10PET, KE65BPK, PA14GEO, KX58PNV, NA63UKO, PO11YFC and JH08URN. Mileage remains explicitly unknown rather than inferred from an old MOT. A missing or duplicate registration is rejected.

Before any browser work, run `node scripts/gsf-service-readiness.mjs [path-to-approved-config]` from the repository. This offline audit checks all thirty vehicle/service combinations and reports missing fitment, oil, fuel type or review evidence. `READY_FOR_LIVE_PRICE_CHECK` is not a verified price. No prices or approvals are invented and no browser is launched. The same comparison functions can consume results from the shared runner; do not start the legacy standalone comparison alongside it.

The runner needs an approved `gsf-config.local.json` with the correct filter fitments, oil specification/quantity and service scope for each combination. It refreshes costs and calculates all three services using the 50% filter / 30% engine-oil policy, saving `service-comparison.local.json`, a readable Markdown table and a CSV. A missing/unverified combination is marked **Needs verification**, with no fabricated or zero price. This standalone comparison does not activate the website or need backend credentials.

The offline self-check uses clearly synthetic costs and verifies expected totals of £96.00 / £177.60 / £279.60. Those are arithmetic examples only, not quotes for any actual registration.

## Approved recipes

Copy `gsf-config.example.json` to `gsf-config.local.json` and leave `calibrationApproved: false` until the complete service flow is checked. The default mode is `approved-skus`. Populate recipes using `recipe.template.json`. Each needs explicit approval/review date, exact registration/variant, service/range, verified fuel type for major services, manufacturer oil source and **fitmentSource**. Unknown mileage is accepted without an override or mileage window.

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

Next: validate the PC price check, capture reviewed vehicle/filter/oil mappings for ten different registrations, connect verified vehicle oil specification/quantity data to broader recipe discovery (without requiring a mileage-based OEM parts schedule), and compare all three service totals against manual GSF calculations. Test expiry, offline, missing parts, price changes, duplicate submissions and desktop/mobile booking before following `RELEASE-SAFETY.md`.

General repair-parts quoting in Workshop Pro can reuse this pricing core, but its UI is outside this amendment.
