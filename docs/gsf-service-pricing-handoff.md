# Shared GSF worker: service-pricing handoff

## Ownership and current state

PR #360 owns the website service-price API, private service queue, calculation, signed booking snapshot and comparison. PR #361 owns the combined service/repair runner. Its runner already uses `lookupService` for service requests in the same GSF context used for repairs. It serializes supplier activity and keeps the two commercial policies and relay credentials separate.

Use one GSF installation/profile and one running process. Do not ask Chris to install another copy of the old service-price-check ZIP. Do not replace the combined runner with the older service-only runner from #360. No production database or settings have been enabled by this work.

The 26 October PC capture for FV65JTY reports a selected registration and an automatically reached alternator category, but explicitly retains `fitmentConfirmed: false` and `catalogueComplete: false`. It is navigation evidence, not approved service-parts compatibility. Alternator costs cannot supply filter or oil costs.

## Existing service contract

- Input: registration, service (`Oil & Filter Change`, `Full Service`, `Major Service`), current mileage or null, and parts range. Mileage/range/service changes invalidate the old result.
- A reviewed mapping binds that request to the exact vehicle variant, service scope, compatible filter SKUs, oil specification, fill quantity and pack size. Mappings expire after thirty days. Mileage is optional; no mileage window or unknown-mileage approval is required for these default packages.
- Oil/filter always needs oil and oil filter. The current full/major package also needs air and cabin filters. Major services require a verified `fuelType`: `petrol`, `diesel`, `petrol hybrid` or `diesel hybrid`. Diesel major services include a fuel filter. Petrol major services do not include one. Spark plugs are excluded from every automatic service price and quoted separately if needed. Unknown fuel type blocks a major quote rather than guessing. Filter compatibility and stock must still be verified.
- GSF readers verify the exact selected SKU, brand, description, positive stock and ex-VAT account cost, independently of RRP. A price or stock label alone proves neither vehicle fitment nor catalogue completeness.
- Completed costs include request binding, recipe ID, vehicle, oil specification, required kinds, item quantities, checkedAt and explicit fitment/scope/oil verification. The service API rejects unverified, incomplete or stale results. Results must be fresh within five minutes.
- For new oil results, include `packNetPence` (actual GSF net pack price) and `packQuantityMilli` (ml), alongside the compatible per-litre `unitNetPence`. The latter must equal `ceil(packNetPence × 1000 / packQuantityMilli)`. Costing uses the original fraction, not that rounded per-litre rate. Non-oil parts remain priced per unit.
- Only server-generated signed customer prices reach the website. Supplier cost, markup and pack purchase prices remain private. Quotes expire after thirty minutes; booking validates the signature and request binding.

## Service policy, separate from repair quotes

1. Retain the verified oil fill, but round its charge quantity up to the next whole litre (6.7L → 7L; 7L → 7L). Calculate net oil cost from that charged quantity and the original pack fraction. Other parts use their verified unit quantities.
2. Add 50% markup to each line and round that sale line to a penny.
3. Add net labour: £35 oil/filter, £70 full, £110 major.
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
