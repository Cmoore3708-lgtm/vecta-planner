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
# H16CKK failure investigation — 4 November 2026

The 15:08:51 request was received and completed with `REVIEW_REQUIRED` at
15:09:03. The production heartbeat remained current. The completion contains no
diagnostic reason, so it does not establish which supplier check failed.

The recovery controller excluded GSF when loading `HAYNES_RELAY_TOKEN`, while
the installed `batchConnection` diagnostic bridge requires that existing token.
The diagnostic heartbeat stopped at 07:51:24. The installer now repairs that
single controller condition while retaining the installed recovery code, pairing
file, previous release and all other workers. It requires an existing, already
started diagnostic connection, so it cannot launch a fresh 100-vehicle run.

After restart, verify a fresh diagnostic heartbeat/revision and run one H16CKK
diagnostic cohort before attributing or fixing the price rejection. No live fix
is claimed. A cached Haynes result confirms a 5.4-litre sump including filter for
H16CKK/HR13DDT, but the current GSF code does not consume that record; this is a
possible gap, not proof of the observed failure.
