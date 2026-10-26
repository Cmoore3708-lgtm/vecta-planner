# Shared GSF worker: service-pricing handoff

## Ownership and current state

PR #360 owns the website service-price API, private service queue, calculation, signed booking snapshot and comparison. PR #361 owns the combined service/repair runner. Its runner already uses `lookupService` for service requests in the same GSF context used for repairs. It serializes supplier activity and keeps the two commercial policies and relay credentials separate.

Use one GSF installation/profile and one running process. Do not ask Chris to install another copy of the old service-price-check ZIP. Do not replace the combined runner with the older service-only runner from #360. No production database or settings have been enabled by this work.

The 26 October PC capture for FV65JTY reports a selected registration and an automatically reached alternator category, but explicitly retains `fitmentConfirmed: false` and `catalogueComplete: false`. It is navigation evidence, not approved service-parts compatibility. Alternator costs cannot supply filter or oil costs.

## Existing service contract

Interim Service is explicitly supported as the oil-and-oil-filter package (same £30 net labour as Oil & Filter Change). EV Major Service is explicitly supported with air and cabin filters only: no engine oil, oil filter, fuel filter or spark plugs, and no engine-oil lookup dependency. EV fitment must identify an electric vehicle. Its net labour must be explicitly configured before issuing a live calculated EV quote; the saved £120 EV template total is not a net labour rate. The original ten-car comparison remains the three combustion-engine packages.

- Input: registration, service (`Oil & Filter Change`, `Full Service`, `Major Service`), current mileage or null, and parts range. Mileage/range/service changes invalidate the old result.
- A reviewed mapping binds that request to the exact vehicle variant, service scope, compatible filter SKUs, oil specification, fill quantity and pack size. Mappings expire after thirty days. Mileage is optional; no mileage window or unknown-mileage approval is required for these default packages.
- Oil/filter always needs oil and oil filter. The current full/major package also needs air and cabin filters. Major services require a verified `fuelType`: `petrol`, `diesel`, `petrol hybrid` or `diesel hybrid`. Diesel major services include a fuel filter. Petrol major services do not include one. Spark plugs are excluded from every automatic service price and quoted separately if needed. Unknown fuel type blocks a major quote rather than guessing. Filter compatibility and stock must still be verified.
- GSF readers verify the exact selected SKU, brand, description, positive stock and ex-VAT account cost, independently of RRP. A price or stock label alone proves neither vehicle fitment nor catalogue completeness.
- Completed costs include request binding, recipe ID, vehicle, oil specification, required kinds, item quantities, checkedAt and explicit fitment/scope/oil verification. The service API rejects unverified, incomplete or stale results. Results must be fresh within five minutes.
- For new oil results, include `packNetPence` (actual GSF net pack price) and `packQuantityMilli` (ml), alongside the compatible per-litre `unitNetPence`. The latter must equal `ceil(packNetPence × 1000 / packQuantityMilli)`. Costing uses the original fraction, not that rounded per-litre rate. Non-oil parts remain priced per unit.
- Only server-generated signed customer prices reach the website. Supplier cost, markup and pack purchase prices remain private. Quotes expire after thirty minutes; booking validates the signature and request binding.

## Service policy, separate from repair quotes

1. Retain the verified oil fill, but round its charge quantity up to the next whole litre (6.7L → 7L; 7L → 7L). Calculate net oil cost from that charged quantity and the original pack fraction. Other parts use their verified unit quantities.
2. Add 30% markup to engine oil and 50% to filters and round that sale line to a penny.
3. Add net labour: £30 oil/filter, £60 full, £100 major.
4. Apply 20% VAT once to the subtotal. No additional £5/£10 rounding.

The customer quote and saved booking evidence retain the actual oil fill and charged litres separately. Neither the litre rounding nor the sale calculation changes the manufacturer's required fill quantity. The trial policy version is `gsf-default-parts-oilceil-v1`.

Keep repair-job marginal parts markup and £50/hour half-hour labour rounding out of service-package quotes.

## Prepared comparison and evidence checks

The example comparison input contains the ten previously selected Workshop Pro registrations, with mileage left null. `node scripts/gsf-service-readiness.mjs [config-path]` audits the thirty combinations without starting a browser or contacting a supplier. It reports evidence gaps and readiness for live checks only. It cannot generate a real price.

With no approved mappings, the correct current result is 0/30 ready and no verified prices. Use the combined runner to refresh verified costs once the mappings and PC navigation work. Feed its returned service costs through `compareServices` to produce the three prices per registration. Compare those with manual GSF line costs, fill quantities, markup, labour and VAT before enabling preview pricing.

## Remaining release checks

1. Prove selected vehicle/variant, complete supplier options and exact chosen part identity in the shared PC browser; complete oil/parts fitment evidence per service using VECTA’s default package scope.
2. Complete one actual vehicle across all three services, then the ten-car comparison. Missing items produce no verified price.
3. Test the service queue in isolated Test only, including lease expiry, lost connectivity, login expiry, partial data and price changes. Keep Production disabled.
4. Verify booking price display, expiry, signature binding, changed registration/mileage/range, combined MOT pricing and saved agreed-price snapshot on desktop, iPhone and iPad.
5. Integrate both PRs preserving the shared runner and the service endpoints. Run the release gate and follow RELEASE-SAFETY.md before a live release.

## Shared-worker integration check — 26 October 2026

Reconciled this amendment with Main `3d229dc8` and retained Main's combined
`workers/gsf/worker.mjs` unchanged. Service lookups and repair lookups share the
same exact-SKU product reader and dedicated Edge context; the combined runner
awaits each lookup before pulling another supplier job. Retained Main's modal
versus full-page selection fix and its VAT/stock/image reader changes, while
preserving this amendment's default-package and whole-litre oil rules.

The new supplier-to-calculator integration test uses explicitly synthetic data.
It exercises `lookupService`, the DOM product reader, original pack fraction,
whole-litre charging, markup, labour and VAT, and verifies missing oil evidence
blocks before browsing. It is not a live price or fitment test.

No reviewed service mapping/config is available in this workspace for the ten
registrations. The offline readiness audit still returns 0/30 ready, with no
supplier prices verified. No service queue, production flag or PC configuration
has been enabled by this amendment. Next live proof requires one reviewed
vehicle's service filter SKUs plus oil specification, fill and pack size, then
one fresh lookup through the existing PC worker before extending to all ten.

## Fresh exact-product verification — 26 October 2026

Chris confirmed that the GSF account prices exclude VAT. Independently opened
GSF product pages and observed all four in stock with explicit ex-VAT labels:

| Search/product key | Manufacturer SKU | Brand | Net purchase price |
| --- | --- | --- | --- |
| DRODT0205EZ | DT0205EZ | DriveTec | £54.63 / 5L |
| UFI23.265.00 | 23.265.00 | UFI | £4.94 |
| FRACA5619 | CA5619 | FRAM | £10.75 |
| MANCU1629 | CU1629 | MANN-FILTER | £22.79 |

The manufacturer SKU differs from GSF's prefixed search key. Reviewed direct
product URLs are now accepted by the same reader, with strict origin/path checks
and revalidation of SKU, brand, description, price, VAT and stock. Search remains
available for existing mappings. No ordering or basket actions were performed.

Evidence is stored in `workers/gsf/nu67vse-observed-evidence.json`, deliberately
not an approved recipe. The customer's Haynes screenshot shows 4.3L including
filter and preferred 0W-20 API SN / ILSAC GF-5 (type t_317000289). The exact EZ
product's API/ILSAC specification remains unverified: the live product page
exposes no specification attributes. Do not substitute another DriveTec product's
specification merely because the viscosity or brand matches.

Correct manual arithmetic using 30% oil markup, 50% filters, 5 charged litres,
and £30 / £60 / £100 net labour is £130.12 / £226.50 / £274.50 including VAT.
Earlier manually quoted £202.50 / £250.50 Full/Major totals were wrong and are
superseded. The calculator-backed evidence regression verifies all three totals.
These are conditional arithmetic replays, not live verified vehicle quotes.

Cloud GSF registration submission on the Engine Oils category returned 'Vehicle
not found' for NU67VSE. Exact-product reads succeeded independently. Vehicle
fitment remains supported by the user's selected-vehicle screenshots, not a
successful automated registration lookup. A fresh PC-worker service run and
website-to-booking test are still required; no production activation occurred.

## Replacement oil observation

Chris reports the DriveTec oil option is no longer displayed. Keep its original
observation as historical evidence, not a current quote. The replacement
screenshot shows COMMA ECO-V 0W-20 - 5L, search key COMECOV5L, £59.35 ex VAT,
and positive stock. The selected registration is outside that screenshot;
the capacity shown is 4.7L, differing from the earlier 4.3L Haynes screenshot.
Neither value is silently substituted as a confirmed fill. Both round to 5
chargeable litres, so conditional calculations using the earlier filters are
£137.48 Interim, £233.87 Full and £281.87 Major gross. A regression checks
both fill cases and ensures the replacement's own price is used. This does not
approve the replacement oil specification or establish vehicle fitment.


## Vehicle correction — authoritative screenshot

IMG_BA1C49A6 confirms the 4.7L and Comma ECO-V oil screens belong to FV65JTY,
Honda CR-V i-DTEC 4WD 1.6 diesel, not NU67VSE. There is no capacity conflict:
these are different cars. Keep Honda oil evidence in fv65jty-observed-oil.json
and Pulsar evidence separate. The £137.48 / £233.87 / £281.87 mixed-vehicle
calculations above are withdrawn and must not be used for either vehicle. No
Honda filter prices or complete Honda service quote have been verified. Honda
Major requires its diesel fuel filter. The replacement Pulsar oil is unresolved.
