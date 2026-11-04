# Service guide prices and Workshop Pro cost handoff

Chris requested on 2 November 2026 that missing parts costs produce a Guide price, that the final-price confirmation sentence be removed, and that Workshop Pro retain the guide designation and display all costs with estimates clearly labelled.

The worker retains confirmed vehicle-applied costs, continues after a missing filter, and marks the resulting offer as a guide. Missing filter prices use recent verified identical-vehicle costs, then the upper quartile from at least three distinct matching model/engine/fuel vehicles, then the approved ex-VAT allowances: oil £11.38, air £23.78, cabin £19.34, fuel £42.05 (filters). Historical estimates never seed further estimates. Supplier history is bounded to 300 records and 30 days; existing queue retention can shorten the available window. Oil capacity/specification are not guessed; the existing engine-band guide remains the fallback when oil requirements cannot be verified. The matching 5L oil price fix is included.

Public wording is **Guide price — includes estimated parts costs.** Each service tier is labelled independently, so a missing air filter does not turn a fully verified Interim price into a guide. Unconfirmed availability remains separate from product pricing.

The signed offer includes authenticated encrypted purchase costs. Public quote JSON does not expose purchase costs or margins. The booking server decrypts the snapshot and populates `gsf_parts`, including estimated amounts explicitly prefixed **ESTIMATED COST £… ex VAT**. Guide status is retained in the booking work description. Accepting the booking uses the existing Parts list handoff; saving and reopening the owner job card preserves the labels and numeric ex-VAT costs. Oil costs retain their pack size and quantity; the description distinguishes fill litres from charged litres. Estimates do not imply a selected SKU or confirmed availability and never mark parts ordered or arrived.

The managed PC update is built with:

```sh
node scripts/package-service-guide-update.mjs /path/to/VECTA-GSF-Search-Repair.zip /path/to/VECTA-Service-Guide-Price-Update.zip
```

It stages a separate release, preserves the previous release for rollback, uses existing dependencies, and retains the existing pairing, supplier profiles, settings and batch results. It does not start another batch run. Diagnostic service results containing estimates remain review cases. Install only after the matching server/website release is approved and deployed.

Verification covers partial supplier results, same-vehicle and peer estimates, stale/unverified history exclusion, strict oil/vehicle checks, authenticated worker ingestion, signed tier-specific offers, encrypted cost recovery, tamper/cross-vehicle rejection, booking snapshots, and rendering/reopening the actual owner Parts editor. Live supplier and workshop-PC acceptance remain release checks.

## Owner job sheets — 4 November 2026

Workshop Pro uses the existing Tyres job type to open the website-style size, price and wheel selector. Selected positions are included in the invoice description and Parts, and retained when a job reopens. No tyre is ordered by selecting a price.

A Full or Interim selection now shows progress at the job type and in the main price box. On a match, the main box reads the calculated service line, including after reopening the job. On a supplier failure, every missing required part gets a numeric ex-VAT estimated cost. Actual costs remain actual. The estimate uses the same net markups, labour, VAT and round-up rules as a complete price. Recent verified same-registration observations take precedence; with a known exact matching vehicle description/fuel, at least three distinct peer registrations can supply an upper-quartile cost. Filter allowances remain as listed above. With no better oil evidence, the fallback is a £43.41 ex-VAT monetary allowance for the service (the observed 5L pack cost on the 4 November example). It is not a verified oil specification, quantity or SKU. If the pricing endpoint itself is unreachable, the job uses these allowances and the last agreed default pricing rules.

The signed public booking quote still requires verified oil. Partial worker results are validated on ingestion and only the authenticated job sheet receives the private itemised estimate. The PC overlay carries forward the existing Service Kit lookup and continues checking filters when oil cannot be priced. With the old worker, an oil failure can still return no individual prices; the job sheet then estimates all items.
