# GSF service-pricing worker — staged first version

This is a real queue/worker/pricing implementation, **not yet enabled or live-tested against GSF product pages**. No parts are ordered. Existing public engine-band guide prices remain the fallback.

## Implemented

- Separate Edge profile, manual secure sign-in, PC pull loop and explicit login-expiry reporting.
- Registration search through the visible GSF interface, selected-vehicle verification, then read-only product page navigation.
- Exact SKU, single selected account price, visible ex-VAT basis and positive stock checks. RRP, multiple prices, unavailable stock or uncertain oil/fitment cannot produce a quote.
- Approved vehicle/service recipes select exact SKUs and brand/range, required quantities, service scope and oil specification. Oil pack price is converted to a per-litre cost (rounded up to a penny), then only the verified fill quantity is charged.
- Server-side parts markup, preset net labour, VAT and optional final-price rounding. Costs, markup, account sessions and worker credentials stay private.
- Queue deduplication, one active lookup, job leases, five-minute success cache, one-minute failure cache, hourly and daily lookup limits, bounded deadlines and cleanup.
- Website lookup on service selection; obsolete vehicle/mileage/range responses are ignored. Loading/offline states retain the guide price. Signed customer prices last 30 minutes and are validated and recorded with parts against the booking. The existing £65 MOT / £5 combined-service offer is preserved separately.

## What is deliberately unfinished

GSF's live DOM selectors and displayed VAT basis have **not** been calibrated. The first version requires an approved recipe for each registration/service/range and mileage window. It does **not** yet discover and price every vehicle automatically. Unknown vehicles, changed scope or unreviewed manufacturer oil data return `REVIEW_REQUIRED`, and the website keeps its guide price.

Next stage: calibrate the catalogue with real vehicles, connect trusted Haynes oil/scope data to recipe discovery, compare at least ten petrol/diesel vehicles, and expand coverage. Do not infer oil quantity from engine size or treat every listed part as due for replacement.

## PC setup (once the preview/backend is configured)

1. Use the repository checkout including `lib/service-pricing.js` and `workers/gsf`. Install Node 22+ and Microsoft Edge.
2. In `workers/gsf`, run `npm ci` (pinned Playwright lockfile included).
3. Run `SIGN-IN-GSF.cmd`. Sign into GSF directly in its dedicated Edge window, then press Enter in the terminal. This does not read a password or copy your usual browser's profile.
4. Copy `gsf-config.example.json` to `gsf-config.local.json`. Keep `calibrationApproved: false` until the following checks pass.
5. Verify the selected-vehicle container selector from the actual rendered site. It must show both the current registration and the complete variant, rather than the recent-vehicles list.
6. Add reviewed recipes using `recipe.template.json`. For every part, record:

   ```json
   {
     "kind": "oil_filter",
     "sku": "REPLACE_WITH_VERIFIED_SKU",
     "brand": "REPLACE_WITH_SELECTED_BRAND",
     "description": "Oil filter",
     "url": "https://trade.gsfcarparts.com/product/REPLACE_WITH_OBSERVED_PATH",
     "quantityMilli": 1000,
     "packQuantityMilli": 1000,
     "vatBasis": "EX_VAT",
     "vatEvidence": "Record how the account VAT basis was confirmed",
     "rootCss": "REPLACE_WITH_SELECTED_PRODUCT_CONTAINER",
     "skuCss": "REPLACE_WITH_SKU_WITHIN_CONTAINER",
     "priceCss": "REPLACE_WITH_ACCOUNT_PRICE_WITHIN_CONTAINER",
     "stockCss": "REPLACE_WITH_STOCK_WITHIN_CONTAINER",
     "vatBasisCss": "REPLACE_WITH_LIVE_EX_VAT_INDICATOR"
   }
   ```

   These strings are placeholders, not verified GSF selectors/URLs. `priceCss` must resolve to exactly one account-price field, excluding RRP and carousel alternatives. `stockCss` must read `In stock`; `vatBasisCss` must show an explicit ex-VAT label on every page. Do not approve settings solely from the supplied screenshots: VAT isn't shown there.

   Oil quantity uses millilitres, e.g. **synthetic example** `quantityMilli:4500` for a verified 4.5L fill; `packQuantityMilli:5000` for a 5L pack. Other parts use 1000 per item. Record manufacturer oil specification/source, scope source and appropriate mileage bounds. Recipe review expires after 30 days. No production recipe or oil quantity is supplied by this commit.
7. Store the dedicated `GSF_WORKER_TOKEN` and `GSF_WORKSHOP_ORIGIN` in the PC environment. The origin must be the configured HTTPS Workshop deployment. Never put credentials in Git or website JavaScript. The worker uses no Supabase key.
8. After calibration, set `calibrationApproved: true`, then run `START-GSF-PRICING.cmd`.

If the session expires, stop the worker and rerun `SIGN-IN-GSF.cmd`, then restart. Automatic credential entry is **not** included in this version. Keep the PC online and awake.

## Backend / commercial settings

1. Apply `docs/sql/gsf-service-queue.sql` to the isolated Test database first, with advisors and test queries. This SQL is a staged setup script, not an automatically applied migration. It touches no existing jobs, invoices, fleet, Haynes or tyre tables.
2. Configure the preview's existing Test database service credentials. New queue tables have RLS enabled, no client policies, and service-role-only grants. No new Edge Function or browser database access is required.
3. Generate independent random 32-byte hex values for `GSF_WORKER_TOKEN` and `GSF_SERVICE_QUOTE_SECRET`. These are private server/PC configuration, not GSF login credentials. Never reuse Haynes/tyre tokens.
4. Set `GSF_SERVICE_PRICING_POLICY` to the completed JSON from `pricing-policy.example.json`. All `null` values intentionally fail validation. Chris must confirm markup and **net** labour before activation. `markupBps:3000` means 30% markup on purchase costs, not 30% margin. Labour is not marked up. The VAT percentage and rounding rule are explicit policy values.
5. Set `GSF_SERVICE_PRICING_ENABLED=true` only on the test deployment when configured. It defaults to disabled. Keep production disabled until real product prices, fitment, oil, VAT and booking persistence have been checked.
6. The standalone website proxy forwards to Main by default. During preview testing configure the website to use its matching preview API, rather than relying on the production proxy. Main's built-in booking page uses the same-origin endpoint.

## Validation / release

- New regression tests: `node --test tests/regression/gsf-service-pricing.test.mjs`.
- Whole application gate: `npm run release:gate` (install the existing Haynes and tyre worker dependencies first, as required by their regression tests).
- Test offline PC, expired login, multiple brand choices, missing prices, unknown VAT, wrong SKU, missing oil data, stale results, service changes, mileage changes, quality changes, quote expiry and repeated booking submissions.
- Run the supplier flow on the actual Windows PC and verify ten vehicles against GSF and manufacturer service data before enabling automated customer prices. Verify desktop and mobile booking, then follow `RELEASE-SAFETY.md` for release.

The shared pricing core is usable for future Workshop Pro quotes, but its job-quoting UI and general repair-parts lookup are outside this first amendment.
