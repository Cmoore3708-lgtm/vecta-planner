# Fresh repair lookup status — 26 October 2026

The successful PC navigation, expanded option comparison and fresh SKU verifier are now connected to lookupRepair through the optional `gsf.readerMode: "verified-alternator-options"` adapter. Existing selector-based configuration remains supported.

The new reader requires a reviewed vehicle mapping, a `gsfPart` mapping (searchTerm, actual sku, brand, description), fresh submitted-registration/category confirmation, exact selected vehicle identity and one visible, reviewed `gsf.totalCount` element whose text is the numeric total of all matching options. That total must match every captured and parsed option after Show More finishes. It then independently opens/verifies the cheapest displayed available SKU before constructing evidence for the existing relay validator. No count is inferred from the number of observed cards or disappearance of Show More. If the cheapest brand/part changes, review is required.

This adapter has fixture coverage but is **not calibrated or enabled**. The user's .9 capture has six priced options but no explicit total, so it still cannot pass completeness validation. Neither configuration flags nor production feature variables have been changed.

In a fresh cloud browser test, GSF's visible registration search returned "Vehicle not found" for FV65JTY. This differs from the successful workshop PC run; it does not establish that the vehicle itself is missing or that GSF is generally unavailable. An exact-SKU search continued to work in the same browser.

Remaining evidence needed: a successful fresh vehicle selection and the catalogue's actual complete-option count/pagination behaviour. If GSF exposes no such count, a separately verified enumeration strategy is required; configuring the observed count as a constant would defeat this check. Fresh queue/worker/database testing follows that verification. Main continues to offer only the labelled captured replay.

## Screenshot reconciliation

The user's subsequent expanded-group photo shows ten cards and Show Less: six priced cards and four £0.00 Bronze Out Of Stock cards without an Alternator description. The .9 capture already contains their text in the bounded group container. The analyser now parses that full container, reconciles every priced card against its independent leaf capture and records four unavailable unpriced options. Running the updated analyser against the unchanged .9 report yields ten displayed options and the same cheapest available DriveTec £194.74. Zero-price available cards or unparsed content require review. This establishes the expanded group's displayed options, not the complete vehicle catalogue or a fresh lookup.


## Expanded-group verification

The optional `completionMode: "single-expanded-group"` now replaces the numeric count requirement when a fresh DOM capture confirms exactly one group SKU, a terminal Show Less state, no Show More, no pagination, no loading and no truncation. The bounded option container must parse and reconcile every displayed priced/unavailable entry. Old captures without this boundary evidence cannot pass. The numeric-count method remains supported.

VERIFY-QUOTE version 2026-10-26.10 records this boundary. If the first fresh navigation, completeness and Haynes checks pass, it runs the actual lookupRepair → cleanRepairEvidence → calculateRepairQuote path again using a temporary in-memory mapping scoped to FV65JTY/DREA8828/A8828/Haynes t_317000375. It does not write calibration settings, start the queue, save a quote or enable live pricing. This is a source-to-calculation test, not yet a cloud-queue/database round trip.

## PC .10 result and targeted timeout fix

The 12:05 run automatically submitted FV65JTY and confirmed the expanded group's complete boundary: DREA8828 only, ten options, Show Less, no pagination/loading/truncation. The subsequent independent SKU lookup returned PAGE_TIMEOUT, and Haynes/final validation did not run. The report does not identify which old SKU step timed out.

Checker .11 uses the already browser-verified enhancedSearch/DREA8828 address directly for this reviewed repair mapping, removing the home-page/search-form navigation. It retries that read-only route once on TimeoutError only. Other failures and price/identity/stock mismatches are not retried. It records GSF_SKU_NAVIGATION, RESULTS, OPEN_DETAILS, DETAILS_CONTENT or VALIDATE stages when a step fails. Existing service mappings retain their form-search route. No fresh .11 PC result is claimed yet.

## PC .11 result

The 12:13 run passed automatic registration, complete ten-option boundary, independent A8828/price/VAT/stock/photo verification and Haynes 0.70-hour capture. The redundant second source lookup inside the actual-worker test failed VEHICLE_IDENTITY_MISMATCH. Its compared strings/count were not recorded, so the cause is not established. Version .12 normalises all display whitespace while retaining the exact remaining identity characters, rejects duplicates/different registrations and records bounded expected/observed identity diagnostics. No successful fresh .12 run or live activation is claimed.
