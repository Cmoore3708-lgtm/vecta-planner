# Fresh repair lookup status — 26 October 2026

The successful PC navigation, expanded option comparison and fresh SKU verifier are now connected to lookupRepair through the optional `gsf.readerMode: "verified-alternator-options"` adapter. Existing selector-based configuration remains supported.

The new reader requires a reviewed vehicle mapping, a `gsfPart` mapping (searchTerm, actual sku, brand, description), fresh submitted-registration/category confirmation, exact selected vehicle identity and one visible, reviewed `gsf.totalCount` element whose text is the numeric total of all matching options. That total must match every captured and parsed option after Show More finishes. It then independently opens/verifies the cheapest displayed available SKU before constructing evidence for the existing relay validator. No count is inferred from the number of observed cards or disappearance of Show More. If the cheapest brand/part changes, review is required.

This adapter has fixture coverage but is **not calibrated or enabled**. The user's .9 capture has six priced options but no explicit total, so it still cannot pass completeness validation. Neither configuration flags nor production feature variables have been changed.

In a fresh cloud browser test, GSF's visible registration search returned "Vehicle not found" for FV65JTY. This differs from the successful workshop PC run; it does not establish that the vehicle itself is missing or that GSF is generally unavailable. An exact-SKU search continued to work in the same browser.

Remaining evidence needed: a successful fresh vehicle selection and the catalogue's actual complete-option count/pagination behaviour. If GSF exposes no such count, a separately verified enumeration strategy is required; configuring the observed count as a constant would defeat this check. Fresh queue/worker/database testing follows that verification. Main continues to offer only the labelled captured replay.
