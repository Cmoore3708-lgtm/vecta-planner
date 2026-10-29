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
