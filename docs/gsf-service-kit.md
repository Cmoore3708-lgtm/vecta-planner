# GSF Service Kit lookup

The worker opens the supplier's visible **Service Kit** link after selecting the
registration, reads the kit once, then rechecks each required product's current
ex-VAT cost, description and SKU in its product details. Interim uses oil and the
oil filter; Full additionally uses air and cabin filters. Other kit items are not
included automatically. Existing markup, labour, rounding and job-card handoff
remain unchanged.

The kit's Quantity is a pack count. It never supplies the engine's refill volume.
Oil still requires the existing vehicle-specific capacity evidence, and the 5L
pricing rule remains in force. Missing capacity still prevents a verified quote;
this change does not claim to establish H16CKK's capacity from its photograph.

Kit cards without an unambiguous unit price or SKU, changed quantities, duplicate
categories, and missing items fall back to the existing category reader. Product
details must confirm the price as ex VAT; RRP is never used. The registration and
selected identity are checked before and after the kit because the kit screen
does not repeat the registration. No basket or ordering controls are used.

The PC installer stages a copy of the **currently installed** release and changes
only the GSF service reader and its new kit module. It preserves later supervisor,
tyre and Haynes fixes, settings, pairing and browser profiles. Dependencies are
copied from the installation; no new downloads or privileges are required. The
previous release remains available for rollback. Stop workers safely and close
the Connections panel before running the installer.

Verification: regression fixtures reconstruct the visible columns in Chris's
4 November screenshots. They are not a captured live DOM. Tests cover separate
RRP, pack versus fill quantities, ambiguous rows, changed vehicle identity,
product/VAT/price verification, service scope and category fallback. Live GSF
calibration remains pending: the connected browser returned Vehicle not found
when selecting H16CKK, so a successful workshop-PC lookup must be observed before
calling the original pricing failure fixed.
