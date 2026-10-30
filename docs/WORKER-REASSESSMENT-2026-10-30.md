# Reassessment after completed 600-check verification

Run 3a2b7412-4a85-4593-aa36-dd46a03bbdbd completed with 354 passes, 126 reviews, eight failures and 112 skips. CM14KEL remains first; its historical production failure is not a test pass. The immediate predecessor had 325 passes: 324 retained, 30 reviews improved, one pass regressed (LS10PET air filter: empty catalogue). No new live run has been started.

## Why earlier local success overestimated readiness

The earlier captured-failure regression fixture contained only three catalogue captures. Tests for the new search path used a simulated page matching the assumed search heading and SKU text. They verified the implementation's chosen route but could not establish that GSF actually presents those elements. Local release success established application safety, not live supplier compatibility. The eight current timeouts show that distinction matters.

The new fixture includes all 121 uploaded failure category captures. Offline selection accepts 31 captures and conservatively rejects 90: 64 missing prices, 14 unknown oil fills, nine unsuitable grade/price, two unconfirmed stock, one unsuccessful capture. These are historical catalogue observations, not fresh product checks or 31 new live successes.

## Stronger tests now prepared

Each saved capture tests selected registration, matching identity, truncation rejection, and (where selection succeeds) removal of all Gold grades, all qualifying stock quantities and all SKU labels. The full saved cohort auditor separately rejects missing cases, duplicate positions, changed vehicles/operations, unfinished results and historical-baseline reasons masquerading as passes. It reports regressions separately from gains and never counts skips as passes.

Search failure injection covers dismiss, input, submit, heading, exact SKU and opening. Original errors retain their exact step plus selected SKU and expected description/price; the existing evidence sanitizer still excludes raw error messages, URLs and secrets. Batch integration verifies a timeout remains FAILED rather than being converted to success. Product validation of fresh brand, exact SKU, description, price, VAT and inventory remains unchanged.

## Repair boundaries and next evidence

The eight timeouts concern MANHU721/5X (K600RJF), MANHU6014/1Z (M26JKM and PO11YFC) and MANWK842/21X (S11PTD), each in service and independent-part checks. The old collector visited the known-broken constructed product route, not the new global search route. Consequently its saved captures cannot show which new search step times out. Increasing timeouts or inventing new selectors would be speculative. A targeted read-only capture of those actual search steps is required before claiming the route repaired.

Most of the remaining reviews are data availability boundaries rather than parsing bugs. Do not use model-only substitutions for unmatched registrations, infer sump fill from bottle size, upgrade Bronze/Silver to Gold, or treat group stock without quantities as confirmed. The Guide price fallback remains appropriate. LS10PET needs a fresh category capture to distinguish temporary supplier absence from a navigation/loading defect.

No installer has been replaced, no production release made, and no claim of complete repair is justified. Chris is away from the workshop computer for two days. Prepare the smallest evidence-collection step needed for his return, rather than another full blind rerun.
