# Consolidated GSF failure analysis — 29 October 2026

Run 70da1485-7deb-4f59-a8b1-961dc7b6877b, linked to b18ad09a-0901-41e5-adfc-2c5d6dabd4ff. All 600 records retained unchanged. 319 passed; 280 review; one failed. The production CM14KEL baseline is separate.

## Confirmed defects and corrections prepared

- Ten obvious fixture identifiers entered the cohort because its validator checked only alphanumeric shape. All six checks for each failed vehicle selection (60 records). Future cohorts exclude the explicit known fixtures; saved cohorts retain them as explicit SKIPPED, never passed. Do not silently substitute different registrations.
- Every saved request has empty fuel metadata. Independent engine/fuel checks therefore ran without the applicable-fuel exclusions. Fresh, confirmed supplier identity now determines scope when metadata is absent. Service diagnostics confirm identity before selecting the EV or combustion recipe. Unknown or contradictory identity stays REVIEW_REQUIRED. Diesel/Hybrid Electric and Petrol/Hybrid Electric remain combustion vehicles.
- Product extraction checked visibility of an element but not its ancestors. Hidden responsive product copies could produce false ambiguous-description/price/stock errors. Ancestor visibility and stock row visibility are now checked. Two visible dialogs still fail. This is a proven code defect; its share of the recorded unreadable-product cases remains unproven until live retest.
- Fuel parsing previously scanned all catalogue text, which could contain unrelated labels. It is now restricted to the selected vehicle header before Copy VIN.
- CM14KEL manufacturer oil evidence exists in the saved Haynes service result: type t_619108899, Nissan Qashqai J12 1.5 e-Power KR15DDT; all 12 lubricant rows agree on engine sump INCLUDING FILTER 5.1 litres. Prepared a reviewed fallback requiring registration and matching fresh supplier variant/fuel. It does not reuse bottle capacity or infer oil specification from viscosity alone.
- Previously confirmed Fitment interface heading correction remains included.

## Remaining evidence limits and required work

- 27 other registrations with unconfirmed oil fill have no oil-bearing matched Haynes service result in the connected Test cache. Do not invent capacities or copy CM14KEL's fill. Obtain fresh manufacturer capacity with exact engine match or keep review/Guide fallback.
- No-priced-items is a supplier outcome, not proof of an electric vehicle. Recorded Nissan Juke/Qashqai identities mean these cannot all be explained as EVs. After scope corrections, capture exact category identity/loading/availability evidence for the remaining cases; do not turn no price into zero or a pass.
- Stock and grade failures cannot be cleared from headings alone. Keep the Gold/price/stock checks; record the actual selected card and panel before changing parsing.
- Product-details failures need the exact field that was missing or ambiguous, including selected SKU and confirmed page state. Do not loosen description/SKU/VAT/stock checks to make them pass.
- SB65BXU failed final service validation after parts reads. Preserve per-part validation evidence to identify the specific invalid field rather than relaxing the validator.
- JE58NEW's lookup failure is separate from fitment: inspect navigation failure/closed-browser evidence. The confirmed pairing crash was repaired server-side; do not count the historical crash as a new supplier defect.

## Validation and release

New regression fixtures verify hidden ancestors, visible ambiguity, missing fuel metadata, hybrid fuel scope, dummy-record skips, and CM14KEL capacity identity restrictions. Full repository gate required after final changes. No new run has been created. No production data modified by this analysis. Repairs are candidates, not live-verified success.

## Recorded review/failure groups

- NO_PRICED_ITEMS: 110
- SELECTED_VEHICLE_NOT_CONFIRMED: 60
- OIL_FILL_OR_PACK_UNCONFIRMED: 56
- STOCK_PANEL_NOT_CONFIRMED: 25
- PRODUCT_DETAILS_UNREADABLE: 17
- PRICE_OR_GRADE_NOT_CONFIRMED: 9
- NO_PRODUCT_SKU: 2
- LOOKUP_FAILED: 1
- INVALID_RESULT: 1


## 30 October uploaded failure capture and consolidated candidate

Evidence: VECTA-Failure-Details.json, Library libfile_c965bd9d21cc81918d4a33540ca5108d, linked run 1564d5e4-70cb-47a7-94ce-72f0969f6e69. 121 distinct registration/category requests: 120 captured and one capture error (NK72KRV applied oil). Historical production CM14KEL failure remains baseline only. The completed live run has 314 passes, 174 reviews and 112 skips. Skips are not passes. Ten previously passed checks became review, all at PRODUCT_DETAILS_UNREADABLE.

Confirmed code defects:
- Catalogue and product stock grammars accepted tomorrow but rejected the supplier's equally explicit same-afternoon RDC stock. Both readers now accept the observed wording while still requiring positive quantified stock and exact price/VAT checks. AU62ZZF and the shared FRACA12624 cases reproduce this.
- SB65BXU selected vehicle display identity is 178 characters, exceeding the 160-character result display contract after all product checks succeeded. Only the returned display label is shortened; full vehicle identity remains intact for scope and fitment validation.
- Slash-bearing supplier SKUs produce not-found pages through the previously constructed URL. Capture now retains supplier-authored product links only when their decoded complete SKU matches the selected SKU. The reader follows that verified link and supports slash-bearing product paths. If no matching supplier link is exposed, it records PRODUCT_LINK_UNCONFIRMED rather than guessing another URL. This route still needs workshop-PC verification; uploaded captures did not retain anchor URLs.

Remaining evidence boundaries:
- 64 category captures show an explicit N/A supplier vehicle and no parts. Across 13 affected vehicles this explains 78 run reviews including service scope. No make/model-only substitution is safe. NK72KRV oil had a capture error; its other four captured categories exhibit the same unmatched identity, but its missing capture is not invented.
- 27 applied-oil captures expose bottle-size filters, not a sump fill including filter. Preserve OIL_FILL_OR_PACK_UNCONFIRMED until vehicle-specific manufacturer evidence exists. Do not turn 1L/5L bottle sizes into engine capacity.
- Nine captured selections are below the required Gold grade (eight air filters, one fuel filter). CM14KEL's only captured air filter is Bronze. It remains review under the existing Mid Range policy; the associated service cannot be marked passed.
- Two stock cases lack the existing positive verified depot-stock evidence. Group/branch enquiries must not be treated as confirmed available stock.
- The changes do not establish that every remaining case is fixed, and no new live rerun has yet verified them. Guide-price fallback is retained.

Validation: six new regression cases use the uploaded stock wording and Citan identity, retain Bronze review and enforce exact supplier link identity. Existing capture and product regression suites passed. Full release-gate outcome is recorded separately after completion. No production data or main branch changes.

Final local validation: release:gate passed all 1,120 regression tests plus phone/cloud sync, finance integrity, production build and dashboard lock. Simulated upgrade from installed 66c6aaed passed module imports, syntax, cooperative-stop retention, preserved pairing/profile markers, previous release retention, old-channel blocking, corrupt-bundle rejection and saved-run preservation. These do not substitute for live Windows/supplier verification. Candidate a7b232211856f53ba5a9ed07b9b8dc5368cad8fc, bundle SHA256 ab1e52e16cefa8aed7cd2be9b034d6f7526bc5d8795743bd229335e0609fde7c.


## Deep review after a4bcc9bb completed (30 October 2026)

All 600 checks completed: 325 passed, 163 review, 112 skipped. Exact-position comparison against 1564d5e4: 312 passes retained, 13 review-to-pass improvements, two pass-to-review regressions, 161 reviews retained, 112 skips retained. Net improvement eleven is not the same as thirteen fixed without regressions.

The remaining groups are 78 supplier vehicle/scope failures on thirteen registrations; 54 oil fill checks on twenty-seven registrations; sixteen slash SKU link checks; nine stock panels; six grade/price checks. A repeated group is not an independent root cause per row.

The second consolidated repair addresses causes rather than relaxing checks:
1. MANN slash SKUs now use the already calibrated supplier global search and exact manufacturer-SKU click when the category has no product anchor. The prior update only supported anchors; live results prove those anchors were absent. Never construct another speculative escape sequence. Both live and diagnostic readers now require the exact MANN-FILTER brand and exact unprefixed manufacturer code for this route, followed by unchanged description, price, VAT and stock validation. Duplicate search matches stop for review. Unsupported prefix routes remain review.
2. Reviewed manufacturer oil-fill bindings cover thirteen captured Nissan identities: eight HR13DDT Qashqai 1.3 MHEV at 5.4L, four KR15DDT Qashqai 190 e-Power at 5.1L, and J8LGH HR10DDT Juke at 4.1L, all including filter. Binding requires the exact saved registration AND the complete captured live vehicle identity (excluding changing date fields), selected-registration confirmation and a non-truncated capture. Engine-to-captured-variant mapping is a documented inference from the exact manufacturer/model/engine/displacement/variant combination, not a VIN-derived engine code. Do not extend these values to another model or variant. Quantity evidence is kept separate from fresh supplier price and recommendation evidence.

Primary manufacturer refill sources, retrieved and checked 30 October 2026:
- https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml (HR13DDT, including filter 5.4L)
- https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqaiepower/hj12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml (KR15DDT, including filter 5.1L)
- https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/juke/0f16/e1/2024/capacities-and-recommended-fluids-lubricants-1.shtml (HR10DDT, including filter 4.1L)

The newer 205 e-Power is expressly excluded from the 190 fill: a different manufacturer engine table lists ZR15DDTe, and the captured GSF identity does not establish the old engine. Other manufacturer quantities without matching vehicle evidence remain review. No oil quantity comes from bottle sizes.

Unmatched GSF registrations cannot be repaired by substituting a generic Qashqai/Juke. Test vehicles have no VIN column, and no matched Haynes results exist for the affected queried registrations. Keep their supplier-missing results and Guide fallback. Bronze/Silver selection is not relabelled Gold. Group stock without positive verified quantities is not invented. No production writes, new live runs or merges were performed during preparation.

Four new regression cases cover all thirteen uploaded manufacturer identity bindings, changed identity/plate/truncation rejection, 190-versus-205 separation, exact slash-SKU search and duplicate rejection, and both fresh readers rejecting wrong brand/SKU/description/price. Live Windows verification remains outstanding until the combined candidate is installed.

3. Filter selection no longer aborts on a below-Gold or unavailable first product group when a separate, independently captured product group can satisfy the unchanged Gold/stock requirements. Each candidate price and title is bound to its own SKU segment; the reader never borrows the first group's heading for another SKU. No fallback across oil packs/grades was added. PA14GEO's two pass-to-review cases motivated the selection review; its saved report shows two separate cabin SKUs, but their current fresh grade/stock still require live verification. A synthetic mixed-grade regression fixture verifies this behavior and explicitly rejects lower-grade or zero-stock alternatives.

Final candidate for this deep review: 23f2a5d85446e35e98e4482c66542eb5fb83c5a5; expected runtime fingerprint 5b7726d652214d460de6a6d235595dda35836a791444fc5335af1b0024ab9ee1; bundle SHA256 4e9a867615cf42fbe179c746dbd48e8f1a35c75fb5b400f66b1e115cb77bf011. Local full release gate: 1,125 regression tests passed, zero failed; phone/cloud sync and finance checks passed, build/dashboard verification passed. Simulated upgrade passed from installed a7b23221 with saved settings, pairing, browser profile and saved run retained. Real supplier verification is still required. No new run was started during preparation.
