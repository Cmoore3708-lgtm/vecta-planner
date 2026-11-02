# Tyre booking costs

Online tyre selections now carry the supplier's wholesale unit Cost separately from the fully fitted, VAT-inclusive Sellout price. The existing Workshop Pro Parts editor stores the ex-VAT cost per tyre and the selected quantity. Accepting the website request copies these rows into the job card using the existing `gsf_parts` payload; combined service/tyre bookings keep both sets of parts. Parts remain un-ordered until the workshop orders them.

Trade costs are retained only in the private PC relay catalogue and an AES-256-GCM receipt encrypted using `GSF_SERVICE_QUOTE_SECRET`. Public guides contain no plaintext trade costs. The receipt binds size, category, canonical brand, exact model, retail unit price, quantity and capture time. Booking rejects modified or expired receipts (30 minutes), including changed selection details. Blank, invalid, ambiguous or legacy costs create a Parts row marked “Supplier cost unavailable” with no invented cost. Customer retail prices and job sale totals are unchanged.

## Rollout

1. Pass the Release Gate and review the preview before Chris approves merging.
2. Deploy the updated `tyre-pc-relay` function to the existing isolated relay project (`brqsejjykrubxuofavuu`), including its updated `lib/tyre-relay-contract.js` dependency. No schema changes or new secrets are needed. The existing paired site/worker authentication is unchanged.
3. Release the planner and website together. Their existing production service-quote secret encrypts and reads the tyre receipt on the planner server.
4. Build the combined managed worker ZIP using `scripts/package-service-guide-update.mjs` and the prior managed update as its base. The package now includes the tyre DOM reader, normaliser and private relay contract alongside the service/oil fixes. Install it on the workshop PC once; preserve supplier sessions and settings.
5. Run a fresh live tyre lookup. Confirm the supplier Cost and its ex-VAT basis against the selected ESP line, then accept a test request and verify its Parts cost, quantity and save/reopen behavior. Device preview checks and this supplier/PC test are release verification still to be performed; local synthetic tests do not prove the installed worker is running.

Old workers and old public clients continue to book; until the worker and relay are updated, their tyre cost is explicitly unavailable. Existing jobs are not backfilled. Never derive wholesale cost by subtracting a margin from Sellout.
