# General parts and fitting pricing — staged, 11 November 2026

Chris requested a catalogue-led lookup covering hundreds of parts, with front
brake pads as one example. A finite dropdown or one reviewed recipe per part or
registration is not the requested solution.

The previous system restricted the UI, parser, SQL queue and GSF/Haynes readers
to alternator replacement, with production registration scope FV65JTY.

This amendment adds an unrestricted part query, explicit position and quantity,
job-card as well as quote access, and private editor helpers passed through the
lazy loader. One repair/kit is priced at a time; separate repairs retain their own
invoice rows and costs. Existing supplier replay is available only with the
explicit `repairReplay` query parameter. The panel does not issue supplier
requests while the user types.

The general GSF reader discovers supplier category links and confirms the selected
registration. It offers the observed part alternatives with cost and fitment
attributes, then re-reads the selected product's SKU, price, stock and EX VAT
basis. Only after the user selects a part does Haynes look up the same vehicle
and present fitting operations or repair groups. Both searches allow different
wording. No guessed category URL, SKU, price or fitting time substitutes for a
failed lookup.

## Verification and remaining work

- Automated grammar tests cover 240 part/position descriptions; these are not 240
  live supplier lookups.
- Regression coverage checks cost quantity, marginal markups, labour rounding,
  VAT reconciliation, wrong axle/vehicle/part, ambiguous labour, catalogue
  boundaries, JSONB field reordering and legacy-worker isolation.
- The build checks that Main and mechanics pass their private invoice/parts
  helpers into the lazy repair panel. The approved dashboard lock is unchanged.
- General GSF category discovery and product-link structure, and Haynes menu
  expansion, still need workshop-PC evidence across different part families and
  vehicles. They intentionally return review-required when the page does not
  provide the evidence. Live visual desktop/phone/iPad checks remain outstanding.

## Deployment order

1. Run the read-only `CHECK-PRICING.cmd` package on the workshop PC, with the GSF
   worker safely stopped. Check several different part families. Retain its
   diagnostic report, fix any DOM mismatch, then repeat only the affected checks.
2. Apply `20261111064559_catalogue_repair_pricing.sql`, then
   `20261111073607_guided_repair_choices.sql` to isolated Test and run the queue
   round trip with the updated PC reader. Guided choices require protocol 3; old readers
   cannot claim general requests. Existing RLS, expiry, quotas, leases and shared
   GSF BUSY behaviour remain intact.
3. Enable `REPAIR_GENERAL_PRICING_ENABLED=true` only in the reviewed Test/preview
   environment. `REPAIR_QUOTING_ENABLED=true` remains required.
4. Verify normal jobs, quotes, saved/reopened cost breakdowns and mobile layout.
   Obtain approval of the tested preview before Main deployment.
5. Install the verified PC reader update and apply the additive migration before
   enabling the general-production feature flag. The existing calibrated
   alternator path remains available during the rollout.

No production flag, database schema, installed PC reader, customer message, job
or invoice is changed by this amendment or by the read-only checker package.

## Part-first choice flow — 11 November update

Chris clarified that identification must happen in order: GSF part first, then
Haynes labour. Both stages now pause for an explicit single selection. GSF
category alternatives come from observed catalogue links; part options include
observed cost and fitment attributes. Haynes uses the selected part description
and offers observed repair headings or priced operations. Search wording can be
changed at either stage. Changing the part clears the previous labour choice;
changing only Haynes wording retains the chosen part. No part or operation is
preselected and no job price is added until the final price is explicitly used.

Every selection is re-discovered on the supplier page before it is used. Choice
identifiers include the displayed price/time, so a changed row asks for a fresh
selection. Vehicle, axle/side, stock, VAT, quantities and evidence age checks
remain in place. A user's confirmed terminology match does not bypass those
checks. Missing supplier evidence still requires review.

The second additive migration, `20261111073607_guided_repair_choices.sql`, adds
CHOICE_REQUIRED results and protocol 3. Apply it after the catalogue migration;
protocols 1 and 2 cannot claim guided requests, including guided alternators.
The PC check package now follows the same staged choices in its terminal.

New regression checks cover request/response validation, GSF-before-Haynes
ordering, persisted choice payloads, old-worker isolation, stale/changed prices
and times, actual operation extraction, wrong vehicle/axle, UI selection and
search refinement, invalidation and escaped supplier labels. Supplier DOM and
live desktop/mobile checks remain outstanding. No production activation or
installation has been performed.

## Workshop-PC report: initial catalogue search

The first attached live check reached the guided request parser but stopped with
`CATALOGUE_SEARCH_UNAVAILABLE` before any GSF category or Haynes operation was
read. The previous code checked an exact search-box name immediately after
DOMContentLoaded; this report does not establish whether the cause was delayed
page rendering, changed field wording or an unauthenticated page.

The reader now waits up to 15 seconds for a unique, visible catalogue-search
input, using observed accessible labels/placeholders rather than one exact name.
Registration/account fields and hidden duplicates are excluded. Sign-in is
reported separately and the read-only checker allows two manual sign-in retries.
If the control still cannot be identified, the report records field types and
labels, without input values, raw HTML, credentials or URL query strings.
This fix is covered by delayed-render, changed-wording, ambiguous-control and
radiator-category tests. The second workshop report confirmed that the search
control was found, but returned a GSF_CATEGORY choice with no options and stopped
for review. It did not reach a priced part or Haynes and does not prove that the
supplier has no suitable part.

## Workshop-PC report: empty category choices

The result reader now handles observed non-link suggestion buttons/options and
searches that navigate directly to a matching GSF category. Related but different
labels remain explicit choices. A selected suggestion is re-discovered by its
identity; only an actual matching GSF category URL is accepted after navigation.
The choice is retained through part selection and Haynes refinement. Product
links and purchase controls are not treated as category actions.

Checker version `2026-11-11-search-results-v3` records relevant visible result
labels, headings, selectable controls and category/product link counts if
identification still fails. It records no input values, page HTML or URL query
strings. An empty category list now produces a diagnostic report immediately,
instead of asking the user to select from an empty list. The report is still
read-only and does not update a job or order a part.

Automated fixtures cover exact/ambiguous suggestions, direct navigation,
changed choices, preservation through the guided flow, and diagnostics when
only product results are visible. The actual GSF result layout and subsequent
GSF-part/Haynes stages remain unverified until the replacement checker is run
on the workshop PC.

## Workshop-PC report: category page without captured results

The third attached check, using v3, reached a `/parts/` page but captured no
matching text, category links, product links or empty-result message. It did not
record the actual category name, loading state or selected vehicle. This is not
evidence of a supplier no-stock response or a successful part lookup.

Review found that discovery searched for a part before selecting the request's
vehicle. Version `2026-11-11-vehicle-first-v4` now selects the registration through
the same visible controls used by the service reader and requires selected-vehicle
evidence before searching. It still selects/confirms the vehicle on the resolved
category afterwards, preserving the earlier category-page retention safeguard.
Results can take up to 15 seconds after search submission. A related but
differently named category reached by actual navigation is offered for explicit
confirmation even when it has no link pointing to itself; it is never accepted
as the requested part automatically.

Failure reports now include the observed category name, confirmation of the
vehicle before/after the search, document readiness, main-content headings and
loading/vehicle-prompt indicators. URL queries, input values and page HTML are
excluded. Tests cover vehicle selection order, delayed rendering, wrong or
ambiguous vehicle evidence, sign-in redirects and related category destinations
with no matching page text. These fixes address code gaps; the v3 report alone
does not establish which gap caused the live failure. Another workshop-PC run
is needed to verify the actual part-to-labour flow.

## Workshop-PC report: numeric category IDs

The fourth report confirmed the requested registration before and after the
search. The rendered page showed `Radiator`, while its observed category route
was `/parts/848`. The document was complete, with one main content region and no
loading or sign-in indicator. The reader was comparing the numeric route segment
to the part wording and stopped before capturing product choices.

Version `2026-11-11-category-ids-v5` separates category routing from its displayed
meaning. It accepts a numeric category reached by clicking the exact observed
suggestion, or by a changed route with an exact matching label in the rendered
main content. Header search suggestions, stale routes, unrelated labels and
other domains do not establish that match. Numeric category alternatives keep
their human-readable labels in subsequent repair requests. No category-ID table
or radiator-only route has been added; each route is discovered from GSF.

The observed category ID is passed to the existing category capture, which still
confirms the vehicle and reads actual prices, fitment and stock before offering
part choices. The checker also reports bounded parsed product-group details on
unfinished runs, without product URL queries. Fixtures cover the observed numeric
route, additional part families, direct-navigation labels, rejection of stale or
unrelated evidence and the part-selection flow using a numeric category. A new
live check is still required; the fourth report contains no priced part or
Haynes operation.

## Workshop-PC report: priced category and product-list readiness

The v5 report reached the numeric category but failed `CATALOGUE_INCOMPLETE`,
with no captured groups. Subsequent user photographs show the supplier's
related-category selection followed by a priced radiator category, selected
vehicle, multiple-fitment warning and both priced and zero-price alternatives.
They establish that a product list exists, but do not establish its full DOM,
stock labels, VAT basis or which fitment is correct. No live Haynes result has
been captured yet.

Version `2026-11-11-product-list-v6` keeps the already-selected vehicle and
resolved category instead of using service calibration, which navigates,
clears/reselects the vehicle and may open an Attributes dialog. The unchanged
service-pricing reader continues to use its original calibration flow. General
parts capture now waits for four matching complete snapshots, polls for up to
20 seconds, expands observed product-group Show More controls, and verifies
category/vehicle context while waiting. It no longer sends an unprompted Escape
before reading the list.

Zero-price cards count toward catalogue completeness only when they have the
previously calibrated unavailable-card shape: no description and explicit
Out Of Stock text. They never become selectable parts or free prices. Unknown
cards and zero-price stock claims still stop the lookup. Every visible card
price and grade must be accounted for. Separately available fitment groups
remain separate choices before Haynes.

The PC checker records bounded visible price-card text without input values,
account panels, raw HTML, URL parameters, emails or VINs. A review failure leaves
GSF open and offers an additional manual-page diagnostic capture; this never
changes the failed status or supplies quote evidence. Timed-out lookup pages
are closed to stop background actions before inspection. The report is saved
before waiting for manual review.

Synthetic regressions cover retained category/vehicle context, delayed and
changing product lists, late expansion controls, unavailable placeholders,
unknown cards, separate fitment choices and diagnostic redaction. These fix
observable code gaps; the v5 report and photographs do not prove which gap
caused that run. Actual product selection and the subsequent Haynes flow still
require verification on the workshop PC. Main, feature flags and the database
remain unchanged by this update.

## Workshop-PC report: input error before supplier launch

The next v6 photograph shows `UNSUPPORTED_OPERATION` at the initial request
parser, before either supplier session starts. The entered prefix has a
duplicated ampersand (`Supply && fit`). That form and the spaced `Supply & & fit`
both reproduced the error; `Supply and fit radiator` passed the same parser.
This run provides no new evidence about the live supplier readers.

Version `2026-11-11-input-retry-v7` tolerates repeated ampersands only within the
leading supply-and-fit phrase. The shared browser and worker grammar stays
identical. Separators between actual parts, conditional work, position and
quantity requirements retain their existing validation.

The checker now catches input errors before opening supplier sessions, explains
the needed correction in plain language and retries the affected prompt. A
valid registration is retained when only the work description needs correction.
Invalid option numbers or later search refinements similarly keep the current
choices available. Q exits cleanly from either initial prompt or a choice.
Regression tests cover the duplicated prefix across several part families,
multi-part rejection, browser parity, retries, cancellation and preservation of
the selected GSF part during Haynes refinement. Live GSF-to-Haynes verification
is still outstanding.

## Workshop-PC report: two parsed radiator groups

The next v7 report reached the correct category and captured two product groups,
their prices, explicit out-of-stock placeholders and one Branch Network option.
Automatic and optional manual diagnostics agree. Both group descriptions were
empty because the rendered titles were not recognised heading elements. The
first group also contained a separate h6 repeating one parsed card's price, so
counting every currency value as a distinct option made it incomplete. Neither
group exposed a product-detail anchor. The run stopped before offering a part
choice and before Haynes; the captured amounts are not approved quotes.

Version `2026-11-11-product-cards-v8` uses the unanimous actual alternative
description when a group has no heading. It accounts for at most one separate
heading that repeats a parsed price outside the alternatives container. Unknown
prices, extra cards, contradictory descriptions and ambiguous group boundaries
continue to require review. Unavailable groups remain in the completeness check
but do not trigger unnecessary attribute reads or become offered parts.

The price text, neighbouring brand logo and any selection control are kept in
one card. A trusted GSF brand-logo filename may label the choice; it never
supplies a manufacturer SKU. After the explicit choice, the reader waits for
stable group evidence while checking the vehicle and category. When a semantic
radio is present, its checked state must match the choice. For drawn circles,
the click alone is not selection evidence: a unique matching option and a brand
identity are required, followed by independent product-detail verification.

If no anchor exists, the existing calibrated detail-route helper uses the full
observed GSF SKU from the refreshed group. Existing links must match that SKU;
ambiguous links or invalid SKUs stop. The fresh product must match the chosen
description, brand when available, price, stock/quantity, VAT basis and SKU.
There is no part-family whitelist or guessed manufacturer-code mapping.

Synthetic fixtures reproduce the report's text/price/group shape, including
plain titles, missing anchors, repeated headings, placeholders and the single
available option. They also test changed product identity/prices/stock and
selection controls. Their DOM structure is synthetic, not a captured live page.
The next workshop-PC run still needs to verify actual selection, product-detail
layout, fitment and Haynes labour. Main and activation settings remain unchanged.

## Workshop-PC report: remaining completeness failure and unreadable logo

The v8 report recognises both radiator descriptions and the repeated summary
price. The second group is complete and has an available Branch Network option;
the first remains incomplete. This report does not contain the internal price
and grade counts, so it does not establish which count failed or the exact live
DOM cause. It still stops before part selection, product details and Haynes.

Version `2026-11-11-card-boundaries-v9` measures grade labels inside each parsed
price card, allowing an embedded icon in a label. A separate decorative grade
badge does not create another priced alternative. Every currency value must
still belong to a parsed card or the single allowed repeated price heading;
unrecognised prices and contradictory card labels continue to stop the lookup.
Diagnostics now include raw price/card counts, per-card grade counts, summary
and decorative badge counts, and bounded, redacted unmatched price text. These
changes address synthetic cases; they are not proof of the live failure's cause.

The available option's logo is also unreadable in the v8 report. Without semantic
selection controls, an unreadable brand is accepted only when its exact price
and description identify one alternative in that fitment group, including
out-of-stock alternatives in the ambiguity check. The refreshed full GSF SKU
and independently read product details must still agree on SKU, description,
price, stock, quantity and VAT. Product details must supply a nonempty brand;
the reader never derives one from a SKU prefix. A readable catalogue brand must
also match the product detail brand. Regression fixtures cover missing logos,
duplicate identities, decorative badges, embedded icons and unknown prices.

Actual supplier selection, product-detail layout, fitment and Haynes labour
remain unverified. This remains a draft with general pricing disabled; the
checker is read-only and Main, databases and installed workers are unchanged.

## Workshop-PC report: RRP identified as the remaining unmatched price

The v9 report identifies the exact completeness failure: the first group has
nine currency values, seven parsed cards and one repeated heading. All seven
card-grade checks pass. The remaining node is a paragraph labelled `RRP:`.
The second group is complete. No part choice or Haynes operation was reached.
This establishes a reference-price counting failure; the earlier decorative
badge and embedded-icon hypotheses were not the cause recorded in this report.

Version `2026-11-11-rrp-reference-v10` accounts for at most one explicitly
labelled `RRP: £amount` reference per group, including nested label/amount spans.
It must be separate from parsed cards and have no interactive control or link.
Its amount never becomes an option or quote cost. Unlabelled prices, multiple
RRPs, extra text or currency, incomplete cards and ambiguous interactive prices
still stop the lookup. The diagnostic counts now include `rrpPriceCount`.

Synthetic tests reproduce the reported nine-value group, verify that only the
available trade-price option is offered, and verify its fresh product identity
with the unreadable catalogue logo. Additional part names use the same reader;
there is no radiator-specific exception. Live product selection, product-detail
layout and Haynes labour remain to be verified. Main and activation settings
remain unchanged.

## Priced parts remain selectable when out of stock

Chris explicitly requested that out-of-stock parts with a price remain available
for pricing. Version `2026-11-11-stock-prices-v11` offers all priced compatible
alternatives in the guided flow, with stocked choices first and each status
shown separately from its price. Zero-price placeholders are never offered.
An out-of-stock part requires the same explicit selection, fitment checks,
refreshed SKU, fresh product price/description/brand and ex-VAT verification.
The existing product reader's unavailable-price mode is enabled only for that
explicit guided choice. The returned stock status must agree with the selected
card; changes invalidate its choice ID and require a refreshed selection.

Both API relays preserve stock status through the Haynes choice and final
quote. Guided calculation uses the single confirmed part even when unavailable;
legacy automatic cheapest-in-stock selection remains unchanged. The job editor
and PC checker label unavailable prices, and saved/reopened breakdowns retain
the label. No availability or delivery promise is inferred from a price.

Synthetic tests cover mixed and entirely unavailable catalogues, both supplier
choice stages, fresh product identity/VAT/price checks, API relay validation,
quote arithmetic, and saving/reopening the out-of-stock breakdown. These tests
do not establish live supplier compatibility. The previous confirmed live
blocker was the extra RRP paragraph, not the unavailable cards. Successful live
GSF product selection and Haynes labour are still outstanding; this remains a
draft and the general-pricing flag is disabled.

## Workshop-PC report: selected GSF product verified, Haynes groups empty

The later v11 run reached all four GSF part choices, selected a priced
out-of-stock NISSENS radiator, opened its actual product details and verified
the manufacturer SKU and ex-VAT price. It then reached `HAYNES_MENU` with no
options and stopped for review. GSF product selection is now demonstrated for
this case; there is still no verified Haynes labour time. The final GSF
diagnostic describes a product-detail page, so its incomplete category flag is
not the cause of this run's stop.

The report contains no Haynes page state, so it cannot establish why the menu
was empty. Code review found immediate reads after navigation/short fixed waits
and overlapping tree-item/label selectors whose duplicate labels were removed
as ambiguous. Version `2026-11-11-haynes-tree-v12` waits for stable nonempty
repair content, checks same-origin frames and vehicle context, waits for content
changes after expansion, and avoids closing already-expanded selected groups.
Nested wrappers for the same label collapse to one control; distinct sibling
groups with identical labels remain ambiguous. Observed headings and nested
list labels are read without a part-family menu map. Account, purchase,
estimate and external-link controls remain excluded. Login pages are explicit;
an unreadable tree no longer becomes an empty successful choice result.

Unfinished checker runs now record bounded Haynes frame paths (without query
parameters), loading/login state, menu labels, matching operation labels and
time-reader failure codes. They never capture input values, raw HTML, cookies
or account panels, and redact emails, VINs and links. Manual review opens the
failed supplier's page, allowing a Haynes repair group to be captured when that
is the failed stage. Synthetic delayed-tree/operation, nested-label, changed
vehicle, login, ambiguity and diagnostic-privacy tests do not prove the cause
of the live empty menu or live compatibility. Haynes verification is pending.
