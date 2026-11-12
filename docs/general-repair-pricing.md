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
### Latest live Haynes evidence — 11 November, 16:41 UTC

The v12 report returned the four GSF radiator prices in approximately nine seconds and again verified the selected out-of-stock Nissens product. Haynes then offered only `Jobs`, `Note`, and `Important note`; the mechanic selected `Jobs` and the next lookup stopped. The Haynes diagnostic shows a complete, non-busy repairTimes document, no password field, no detected repair search, and `OPERATION_NOT_VISIBLE`. These observations confirm page-heading false positives, not the structure or availability of the actual repair controls. The generic `LOOKUP_UNAVAILABLE` error does not establish the exact subsequent browser failure.

The reader now excludes those observed page headings, with regression coverage retaining actual repair groups. This limited correction does not claim to restore live labour lookup. No further checker package has been issued: the next evidence needed is the actual Haynes radiator operation/repair-group screen, rather than another repeat of GSF. The last delivered checker remains v12.

### Search-first Haynes flow — v13

Chris supplied the repair screen and demonstrated the reusable workflow: enter the item, click Search, then read its Renew operation. The photo exposes the repairTimes QUICKGUIDES destination with `searchedKey` and a `FOLLOW UP` Renew row displaying `+1.90`, alongside separate Check, Clean and Repair rows. The photo establishes the displayed radiator time and search route, not the actual HTML structure or an automated successful capture.

The shared reader now pairs an unlabelled visible text field with its nearby exact Search button. It fills the selected part/refined wording and clicks Search, verifies that the searchedKey and previously verified typeId agree, then waits for results. If no unambiguous accessible pair is found, it uses the observed GET search destination with encoded wording and that verified vehicle. Multiple detected pairs stop for review. No part name or labour time is hardcoded. Actual matching replacement operations remain choices, with different source times invalidating prior selections.

Time parsing accepts attached or separated positive prefixes and decimal commas. It keeps the Renew time within its own operation row, rejects negatives/multiple times and cannot borrow an adjacent Check time or a page total. The non-guided diagnostic recognises FOLLOW UP as a displayed badge when comparing the repair label. Existing legacy alternator tests remain applicable.

CHECK-LABOUR.cmd is a read-only Haynes-only diagnostic using the same verified vehicle navigation, search and time reader. It leaves GSF running, calculates no quote and writes haynes-search-result.local.json. The full checker remains available. The package filename includes v13 to distinguish it from old downloads. Tests model the same search-to-choice-to-evidence flow for sixteen different part descriptions across cooling, brakes, suspension, electrical, fuel, air conditioning, clutch and body systems; these are synthetic fixtures, not live coverage claims. A live automatic Haynes result and broader supplier coverage remain outstanding. Main, flags, migrations and installed workers remain unchanged.

### Independent follow-up work while the workshop PC is unavailable

The draft was reconciled with Main at dceb2bb, retaining the latest staff invoice behaviour and this branch's pricing-editor dependencies. No production merge was made. Dashboard baselines and guards were retained.

The repair worker now owns a bounded in-memory session for up to eight verified GSF selections, valid for at most five minutes. Vehicle, work, quantity, category and part-choice identity form the key. Labour group/refinement steps reuse only that verified source capture; source timestamps are preserved and returned objects are copied. Clock reversal, expiry, worker closure and changed request identity invalidate reuse. Final labour selection always reads GSF again before any quote is returned; a changed price or availability returns part choices instead of using the cached cost. No result delivery retry repeats a supplier lookup. The standalone v13 download remains unchanged for the pending live Haynes check.

### Haynes-only choice check — v14

The 12 November v13 report reached the repair-times page, found one priced replacement operation, and stopped at `REPLACEMENT_SCOPE_MISMATCH`. It recorded neither the operation label nor its hours. This confirms failure at the standalone checker's strict automatic description comparison; it does not prove which supplier wording triggered the mismatch or that the captured time was 1.90 hours. GSF was not involved in this run.

CHECK-LABOUR now uses the same labour chooser as guided pricing, after the same verified vehicle navigation. It displays actual replacement operations, accepts the mechanic's selection or revised search wording, and re-reads the selection before returning `PASSED_LABOUR_ONLY`. Changed times require a fresh selection. No GSF part is invented to make the diagnostic fit the pricing protocol; the pricing entry point and request validation still require a selected GSF part. The isolated diagnostic produces no supplied-and-fitted quote and does not save or install anything.

The report saves each choice before waiting for input, and bounded diagnostics now retain operation labels, IDs and hours even when repair text is excluded from generic page-label diagnostics. Input values, account panels, foreign frames and URL queries remain excluded; email, VIN and links are redacted. Supplier lookup timers stop while waiting for the mechanic.

Synthetic regressions cover a supplier badge that causes the old exact-match rejection, operation rows inside a form, alternate terminology across sixteen part descriptions, multiple choices, changed hours, changed vehicle and the requirement for a real GSF selection in pricing. The badge fixture is a reproduction of the failure class, not a claim about the unrecorded live row. Live automatic capture and broader supplier coverage remain unverified. No production settings, migrations or installed workers have changed.

Haynes rows with missing time/units now wait for that evidence and report the specific missing field, rather than returning unrelated menu headings; invalid negative times stop immediately. The diagnostic timeout also handles a rejected browser-close operation without an unhandled promise rejection.

Official integration research checked on 11 November 2026:

- [HaynesPro data delivery](https://www.infopro-digital-automotive.com/uk/haynespro-data/) explicitly offers portal-to-portal access and Web Services for maintenance, repair and diagnostic data. Its product information includes OEM repair times. This establishes a supported integration product, not Vecta's entitlement or its price.
- [GSF's Garage Hive announcement](https://gsfgroup.com/03-08-22-gsf-car-parts-announces-garage-hive-integration/) confirms an official parts-catalogue integration; [Garage Hive's account](https://garagehive.co.uk/gsf-car-parts-announces-garage-hive-integration/) describes actual trade cost and availability. These do not establish a public self-service API or Vecta access.

The recommended longer-term route is to obtain supported data access, reducing dependence on browser markup. Before building an adapter, obtain each supplier's access requirements, documentation/sample responses, commercial terms and test credentials. GSF needs vehicle-specific categories/fitment, stable part IDs, Vecta's net trade prices, VAT basis, availability and validity timestamps; ordering is not required. Haynes needs vehicle identification, searchable operation IDs/descriptions, hours/units and follow-up/overlap rules. Confirm that selected data may be used in Vecta's internal estimates and resulting customer quotes. No supplier has been contacted, no paid access ordered, and no undocumented endpoints have been invented.

Local verification after reconciliation: `npm run release:gate` passed (1,949 regression passes, four skipped, no failures; phone/cloud sync, finance integrity and production build passed). All seven integration tests passed. Source and built Main/mechanics dashboard locks and pricing-editor dependency checks passed. Session tests cover repeated labour refinements, fresh final pricing, changed prices, expiry, clock reversal, copied captures, changed vehicle/part/category and bounded eviction. These checks do not replace live supplier or desktop/phone/iPad preview verification.

### Live Haynes confirmation and supply/fit actions — 12 November

The 10:01 UTC v14 labour-only run passed. It offered `Renew the radiator`, operation `1D07005000WV0`, at 1.90 hours after 4.817 seconds, and re-read the same selection and hours afterwards. The captured label ends in `v`; passing that captured text through the old comparison reproduces its scope rejection. The exact v13 text was not retained. This verifies live Haynes search/selection/time capture for that repair, while the previously verified GSF result remains a separate run. A fresh combined quote and broader live coverage are still pending.

Chris then requested independent keyword actions: supply looks up parts, fit looks up fitting time, without requiring the exact phrase or a parts whitelist. Whole-word, case-insensitive actions now work before/after the item and in common request wording. Supply-only requests use GSF and stop after the selected part; fit-only requests use Haynes without a GSF choice; both retain the part-first flow. Existing bare part descriptions and replace/renew shortcuts retain the combined lookup. Position, quantity, conditional/negated wording and separate-repair ambiguity still require review rather than silently pricing a different repair. The editor retains an editable part description and position choices, followed by actual supplier choices/refinement.

Single-source requests carry a validated `lookup` value (`parts` or `labour`). APIs reject mismatched modes, irrelevant choices or evidence from an unrequested source. Missing sources remain null/empty, never fabricated zero-price parts or guessed labour. Markup, labour rounding, VAT, quote expiry, saved/reopened breakdowns and job-parts insertion account only for requested sources. The worker and read-only checker open only the supplier pages needed by that request. No supplier requests start merely from typing.

Staged migration `20261112101239_repair_action_lookups.sql` adds protocol 4 isolation: old workers cannot claim these single-source tasks, while older request formats remain supported. It preserves the queue's restricted execution grants and lease rules. The migration has only been exercised in a disposable local Postgres-compatible test database; it has not been applied to Test or Main. The worker deployment and migration must be coordinated before activation.

V15 updates the read-only checker for these action routes. Tests cover 240 varied descriptions in four wording patterns, independent supplier invocation and browser ownership, source-specific totals, forged modes/choices, API round trips, database version isolation, and applying/reopening single-source prices without the omitted charge. These simulated tests do not establish 240 live supplier matches. The existing disabled general-pricing flag, Main, installed workers and production records remain unchanged.

### Plain fit includes supply — 12 November (v16)

Chris clarified that ordinary workshop wording such as `I want a price to fit an new alternator` means supplying the part as well as fitting it. Plain `fit` now uses the same GSF-first/Haynes-second flow as `supply and fit`, for any catalogue description. `Supply` alone remains parts only; explicit `fit only` or `only fit` requests retain labour-only pricing. Labour-only canonical wording includes `only`, so supplier refinement, validation and reopening cannot accidentally change it to combined pricing. Common price/quote lead-ins and the repeated article/new wording in Chris's example are removed before searching. `Supply` inside a fitted component name such as `fuel supply pipe` is preserved.

The browser editor and both read-only checkers share this parser. The editor explains the three meanings and continues to require a lookup click. Existing single-source routing, evidence checks, stock handling, quote calculation and protocol 4 migration are unchanged. The v16 package supersedes v15; it remains a read-only checker, not an installed worker update. Tests include the exact example, case/position variations, 240 descriptions in six request patterns, combined supplier ordering and totals, explicit labour-only round trips, and the browser's initial GSF choice. Live combined pricing and release checks described above remain pending.

V16 verification: all 64 focused pricing checks passed. The full local release gate passed with 1,965 regression passes, four skipped and no failures, followed by phone/cloud sync, finance integrity, production build and source/built dashboard layout and pricing-dependency checks. An initial full run stopped one unrelated dashboard test process; that file passed all 16 checks alone and the full rerun passed. All 23 packaged scripts match source, pass syntax validation and have complete relative imports. These automated results do not establish fresh live supplier coverage or desktop/iPhone/iPad visual approval.

### Product results before related categories — 12 November (v17)

The 10:33 V15 report for a front ABS sensor confirmed seven related-category suggestions were offered while the main results contained numerous Wheel Speed / ABS Sensor titles, including Front LH, Front RH and Front/Rear variants. It recorded separate title and price lists, zero product anchors and no parsed SKU/grade groups; it does not establish which price belonged to which title. Vehicle selection was confirmed before search but was not confirmed on the results page. The failure was search-result discovery, not out-of-stock filtering.

Guided searches now submit the item before following autocomplete. On the actual enhanced-search route, priced product cards take priority over related categories, including an exact category suggestion. The generic reader associates a visible title, price and click target within one card; it supports plain titles with click handlers as well as observed safe product links. It does not zip diagnostic arrays together or infer a SKU. Ambiguous shared cards, duplicate identities, hidden/account/purchase controls and zero prices are excluded. Position choices preserve front/rear and LH/RH; a front request excludes rear-only cards. Supplier categories remain a fallback when no product cards are captured.

The existing navigation-choice protocol carries an optional validated `selectionKind: product`, so both the checker and job editor display product/position choices without a new queue migration. The selected live card is clicked; an actual category destination uses the established catalogue reader, while a product detail destination is re-read for SKU, brand, VAT, price and stock. Search-card prices alone are not treated as net trade prices. Direct global-search products require the selected registration plus an explicit positive vehicle-fitment statement; a previous vehicle selection or product title is insufficient. Missing fitment evidence returns `SEARCH_PRODUCT_FITMENT_NOT_CONFIRMED` for review. Product attributes can supply additional position choices. Final selection re-reads the same product, including priced out-of-stock options, before handing the confirmed part to Haynes.

V17 retains V16 wording: fit means supply and fit; supply alone means parts only; explicit fit only means labour only. It is a read-only checker update. The report contains no full product-card DOM or opened product detail, so the new extraction/selection flow is verified with synthetic DOM layouts and report-observed labels, not a fresh live GSF run. Direct product-detail fitment wording remains uncalibrated on the workshop PC; no live success is claimed. The draft, feature activation and release restrictions above remain in effect.

V17 verification: all 101 focused catalogue/choice/action checks passed. The full local release gate passed with 1,973 regression passes, four skipped and no failures, followed by phone/cloud sync, finance integrity, the production build and source/built layout and pricing-dependency checks. All 24 packaged scripts match source, pass syntax checks and have complete relative imports. Tests cover product-first discovery despite exact related-category buttons, non-anchor titles, correct per-card price association, positional filtering/refinement, duplicate/hidden/purchase controls, out-of-stock details, fresh re-reading, missing vehicle/fitment proof, and the product/position wording in the job editor. The DOM test select helper was corrected to set the selected option last because Linkedom's deselection behavior had cleared earlier selections; production select behavior was not changed.

### Live product choices and popup vehicle verification — 12 November (v18)

The uploaded V17 run starting 11:26:06 UTC offered product choices at 11:26:14.106 UTC (7.287 seconds): 50 product cards captured, 37 position-compatible choices offered. It opened the selected Wheel Speed / ABS Sensor - Front/Rear LH and retained front-left scope. It stopped at `SEARCH_PRODUCT_FITMENT_NOT_CONFIRMED`. The product view had zero visible main elements and no literal positive compatibility sentence, but did expose three fitting-position rows: Front Axle LH, Rear Axle LH, Front Axle LH. This confirms live product discovery, selection and opening; it does not prove vehicle compatibility or a complete quote. The V17 report omitted the selected SKU and price, so those values are not inferred.

V18 preserves the selected product and uses the existing vehicle catalogue to verify it when the product view hides the vehicle panel or lacks a compatibility sentence. It closes the dialog (or returns to the exact observed results URL), follows one observed category matching the search terms, restores the requested registration if necessary, and runs the established category/attributes reader. It limits candidate options to the selected description/brand, prefers an observed matching SKU, and requires the final manufacturer part number and brand to match the originally selected product. Missing catalogue membership, wrong registration or changed identity cannot reach Haynes. No category ID or vehicle fitment is fabricated. Category ambiguity still requires review.

Guided fitment reads now recognise LH/RH and allow a product to list several valid fitting positions. Axle and side remain paired within each source row: Front LH plus Rear RH cannot become Front RH. The strict older path retains its existing restrictions. The direct positive-compatibility path remains available, with the same row-pair check. Reports now retain bounded selected-product identity/price evidence and opened-product details to make any remaining failure diagnosable. This applies to catalogue descriptions generally and adds no parts whitelist.

All 105 focused catalogue, action, choice and popup-verification tests passed, including out-of-stock pricing, modal/full-page return paths, restoring vehicle selection, wrong vehicle, mismatched SKU and crossed-position rejection. The new vehicle-catalogue transition is tested with synthetic supplier data using the observed popup structure/position rows; a fresh live V18 run remains pending. V18 is a read-only checker, not a worker installation or production activation.

V18 verification: the full local release gate passed with 1,977 regression passes, four skipped and no failures, followed by phone/cloud sync, finance integrity, the production build and source/built layout and pricing-dependency checks. All 24 packaged scripts match the tested source, pass syntax validation and have complete relative imports. Desktop/iPhone/iPad visual approval and fresh combined supplier pricing remain pending. No Main merge, database migration, feature activation or installed-worker change was made.

### Respect selected categories and retain timeout progress — 12 November (v19)

The V18 report starting 12:12:07.217 UTC searched `supply and fit abs sensor` for YX13OEG, without a position. It offered seven related categories at 12:12:12.923 despite recording matching sensor titles below. After ABS / Traction Control Sensor was selected, it offered 40 of 50 product choices, mostly identically labelled and without prices in their displayed details. The next selection ended in LOOKUP_TIMEOUT. No GSF part was confirmed and no Haynes choice was reached. The timeout closed the pages before their diagnostic capture, so its exact operation is unknown; it does not establish a stock failure or failure of V18's new vehicle-verification path.

Code inspection found two navigation defects: the search could stop after 800ms merely because related controls appeared, before product prices were captured; and an explicitly selected category could be superseded by product cards from another broad search. Guided searches now wait for two matching product snapshots within the existing bounded search window and do not use early related controls as a completion signal. Visible unfinished product cards produce SEARCH_PRODUCTS_NOT_READY with bounded evidence instead of an unrelated category list. An exact re-discovered category selection opens that category before considering global products. Unselected searches continue to prioritise actual product cards.

Search choices now show each card's displayed price and observed SKU where available. They explicitly retain unconfirmed VAT/fitment and never pass that displayed amount off as verified net cost. Category attributes offer separate source-supported positions when the request does not specify them; position-specific IDs preserve the user's selection through the final re-read. Axle and side remain paired within each fitting-position row. Selected-product verification filters unrelated groups before opening their attributes, retaining final exact manufacturer SKU and brand checks. Search readers cache visibility/text within a single snapshot to avoid repeated style calculations across large result lists; each new snapshot rechecks visibility.

The checker prints and saves bounded stage/timestamp progress before supplier operations, including catalogue, attribute-group index and product-detail reads. If its existing deadline expires, the saved report names the last stage and supplier, with a finish timestamp, before closed pages can erase that evidence. It still closes timed-out lookup pages to prevent abandoned automation from interacting during review. No raw HTML, input values or account details are recorded.

All 112 focused tests passed. New regressions reproduce delayed prices after related controls, explicit category navigation despite priced products, unfinished product review, distinguishable displayed-price choices, fifty nested cards with bounded style reads, missing-position choices and final selected-SKU confirmation while skipping 45 unrelated attribute groups. These are simulated supplier transitions using report-observed labels; V19 live confirmation and fresh complete GSF/Haynes pricing remain pending. The checker stays read-only and the application stays on the existing draft branch.

V19 verification: the full local release gate passed with 1,984 regression passes, four skipped and no failures; phone/cloud sync, finance integrity, production build and source/built dashboard layout/pricing-dependency checks also passed. All 24 packaged scripts match tested source, pass syntax validation and have complete relative imports. Main, migrations, feature activation and installed workers remain unchanged. Existing live supplier and desktop/iPhone/iPad release checks remain outstanding.

### Direct supplier-browser observations — 12 November

After Chris asked to stop the repeated checker-download cycle and observe the live process directly, the connected cloud browser exposed a signed-in GSF session. This is not remote access to the workshop Windows PC. No further checker package was issued during this investigation.

GSF's visible home-page registration lookup returned `Vehicle not found` for YX13OEG, despite listing that registration among recent vehicles. Selecting the recent entry did not establish a selected vehicle. The actual `abs sensor` search navigated to `/enhancedSearch/abs%2520sensor` and displayed 50 product cards with manufacturer part numbers, descriptions, prices and stock. The unprefixed manufacturer code is a separate text node above the description; the existing reader's `SKU:`-only recognition misses that identifier on this real card layout.

Opening the actual `Wheel Speed / ABS Sensor - Front/Rear LH` card showed HELLA manufacturer SKU `6PU012039-011`, £38.95 ex VAT / £46.74 inc VAT, with branch quantity 2 and national quantity 483. Its attributes included Front Axle LH and Rear Axle LH. These are observed product facts, not proof it fits YX13OEG. Following the actual ABS / Traction Control Sensor category opened `/parts/868`, which required a vehicle selection. The registration lookup again failed there for YX13OEG and for the previously successful BG18CJV example. Entering the VIN returned by Haynes also failed to establish a selected vehicle. No vehicle-filtered GSF part or complete quote was therefore verified. This does not establish why the workshop's V18 timed out, nor prove a GSF-wide outage. GSF's Haynes shortcut offered a trial; it was cancelled without starting a subscription.

Chris completed secure authentication to the existing separate WorkshopData/Logicat service. A live YX13OEG lookup matched MERCEDES-BENZ E (W212), 220 CDI BlueEFF, -T (651.924), 2009–2013, type `t_102001561`, K-type 31048. Its actual Repair Times search returned no results for `abs sensor`. Searching `wheel speed sensor`, terminology present in the GSF product title, returned replacement operations:

| Operation | Observed ID | Hours |
| --- | --- | --- |
| Renew the front left wheel speed sensor | 1M50010000WV0 | 0.50 |
| Renew the front right wheel speed sensor | 1M50020000WV0 | 0.50 |
| Renew the rear left wheel speed sensor | 1M50024000WV0 | 0.60 |
| Renew the rear right wheel speed sensor | 1M50026000WV0 | 0.60 |

The results also contain wiring-renewal jobs, remove/refit jobs, duplicate operations under different groups, and optional difficult-removal follow-ups of +0.30 hours. Those are distinct from the base sensor replacement. The live DOM repeats the base checkbox ID on associated follow-up list elements, so an unqualified ID selector is ambiguous. No repair was added to Haynes's estimate; its job count and estimate remained zero. The live front-sensor result was retained for Chris to inspect.

The observations establish a real cross-supplier terminology gap and the product-card identifier structure. They do not validate the full worker or authorise a fixed ABS-only mapping. Full end-to-end verification remains blocked by GSF vehicle selection in the connected session; further unverified installer/checker iterations are paused.

### Alternative wording — Did you mean?

When GSF has no priced product results and offers catalogue alternatives, the editor and checker now label those actual supplier choices **Did you mean?** Product cards still take priority. Choosing a category uses its existing observed navigation identity and preserves the requested position, quantity and supply/fit mode.

Haynes's explicit, visible `No results found for the filter used: <current query>` message now ends the empty-search wait after three stable reads. A blank page, loading screen, different query's message, hidden message or sign-in screen cannot trigger this fallback. The message markup was verified directly in the signed-in supplier browser.

The fallback derives a short list from the selected GSF description and the original part wording. Slash-separated supplier names and shared abbreviation suffixes support descriptions such as `Wheel Speed / ABS Sensor`, `Control Arm / Wishbone` and `ABS / Traction Control Sensor`; there is no component whitelist or automatic synonym substitution. Suggestions are possible search terms, not confirmed equivalent parts. If the available descriptions provide no alternatives, the user can enter another term or cancel; the system does not claim to understand every typo or invent a match.

Selecting a Haynes wording choice sets the existing `labourSearch`, keeps the vehicle/work/quantity/position and confirmed GSF part, and clears previous menu/labour choices. The next supplier search still requires explicit operation selection and a fresh hours read. Both API boundaries validate the `wording` selection kind and search text; wording choices cannot carry a labour time or part price. This uses the existing stages and requires no additional migration beyond the staged, unapplied protocol-4 migration.

Regression coverage includes actual empty-message/operation markup; delayed readiness; no-result versus loading/login/stale messages; generic supplier descriptions; selected-part and scope preservation; both checker prompts; editor ticks and retry requests; API round trips; GSF category fallback; and manual retry/cancellation. The signed-in Haynes browser again verified `abs sensor` returns nothing and `wheel speed sensor` exposes front-left renewal at 0.50 hours. That is a manual supplier check, not a complete live worker quote. This change remains on the draft branch; no new checker ZIP or worker installation was issued.

Verification: all 35 focused wording/choice/search-flow tests passed, including 11 added tests. The full local release gate passed with 1,995 regression passes, four skips and no failures, plus phone/cloud sync, finance integrity, production build and source/built dashboard-layout and pricing-dependency checks. Desktop/iPhone/iPad visual preview and complete live supplier verification remain outstanding before release.

### Continued live check and product identifiers — 12 November

GitHub's workshop safety and test checks passed for `65001b91af1f0ac4cc59b975b1144eb3e01773ad`. Its Vercel preview is READY. An authenticated Vercel fetch confirmed `/js/vecta-repair-quote.js` exactly matches the tested source and contains the wording chooser; `/api/repair-quote` still requires the workshop login (401). The browser reached Vercel's login protection; opening the authorised, temporary deployment access link failed with `ERR_INVALID_AUTH_CREDENTIALS`. No visual preview success is claimed, and no protection setting was disabled.

The connected GSF session still failed to select YX13OEG through registration lookup or its actual recent-vehicle entry. Its application console reported `Vehicle not found`. The same session successfully opened the 50-card `abs sensor` search. These findings narrow the current blocker to vehicle selection in this session, not missing product prices or stock. No further vehicle retries or workshop-PC download were requested.

The product reader now recognises the unprefixed manufacturer code immediately before a description, confined to that product's visible card. Live examples include `6PU012039-011`, `21.0134` and `0265007790`; mixed, dotted and numeric codes are supported. It excludes dimensions, short quantities, hidden nodes, purchase controls and identifiers outside the card. Conflicting identifiers remain unresolved. The code appears in product choices and their identity, so two products with the same name and price are no longer dropped merely because their manufacturer codes were missed. Reordering cards preserves the selected identity. Product-detail, price and vehicle-fitment checks remain required.

Four new regressions replay the observed card structure and verify identifier association, duplicate-name/price distinction, stable selection after reordering, exclusions and conflicting codes. All 23 focused product/search/vehicle-selection tests passed. The cloud browser's read-only JavaScript environment cannot run the reader's WeakMap cache, so reader validation used the observed DOM structure locally; this is not a claim that the full worker ran in the cloud browser. The live supplier and visual-preview blockers remain open. No new checker ZIP, worker installation, migration, feature activation or Main merge was performed.

The full local release gate also passed after this reader change: 1,999 regression passes, four skips and zero failures, followed by phone/cloud sync, finance integrity, production build and source/built dashboard-layout and pricing-dependency checks.

### Supplier terminology across different parts — 12 November

Further signed-in GSF searches exposed two generic discovery defects. `wishbone` returned no product cards and offered `Suspension Arm` and `Suspension Arm Bush`; the reader rejected both because neither shared a search word. `drop link` returned 49 products, including `Stabiliser Rod/Strut - Front LH/RH` (FDL7578, displayed £26.98), `Sway Bar Drop Link` and `Drop Link Bush - Front`. Requiring every query word in a product title dropped the differently named stabiliser products. A separate `lambda sensor` search returned 50 Lambda Sensor products, with O2 Sensor, Camshaft Sensor and Brake Pad Wear Sensor categories above them. These were actual supplier-browser observations, not complete vehicle-filtered worker quotes.

The category reader now accepts supplier wording from the visible Related categories section beneath the current query's Search Results heading, even with no shared words. It excludes global navigation, other panels, hidden controls, purchases, counts and Show more controls. With no product cards, those categories become the existing Did you mean choices. Explicit selection retains quantity, position and supply/fit mode and re-discovers the selected control before opening it.

The product reader now recognises descriptions beside their manufacturer codes inside the current query's Parts result section, independent of query-word overlap. Each price must remain inside that code/description container; an unpriced card cannot borrow a neighbouring or promotional price. Stale search headings, hidden cards, purchase controls and zero-price placeholders are excluded. Pending descriptions still prevent early fallback to categories, and priced out-of-stock cards remain selectable. Products continue to take priority over related wording. No component synonym dictionary or guessed category IDs were introduced.

When a selected search product needs verification in the vehicle catalogue, a single category explicitly supplied in that search's Related categories section can be used for navigation despite different terminology. Multiple alternatives still require review. Navigation does not prove compatibility: the requested vehicle and final manufacturer SKU/brand checks remain mandatory before pricing or Haynes. The original search wording is retained while re-discovering that category control.

Ten new regression tests replay the observed section/card structures and cover both terminology gaps, lambda-product priority, preserved selection scope, delayed prices, stale/hidden/unrelated controls, stock and zero prices, price association, category navigation and ambiguity. All 49 focused catalogue/product/search/vehicle tests passed. These automated fixtures supplement the live manual searches; they do not claim the automated worker ran against those live pages. The existing GSF vehicle-selection and visual-preview blockers remain. No further vehicle retry, new checker ZIP, worker installation, migration, feature activation or Main merge was performed.

The full local release gate passed with 2,009 regression passes, four skips and no failures, followed by phone/cloud sync, finance integrity, production build and source/built dashboard-layout and pricing-dependency checks.

### Workshop browser comparison and hydrated result counts — 12 November

Chris confirmed that vehicle selection works in both his usual browser and the browser opened by the worker. The connected cloud browser's failures therefore do not establish a workshop-worker vehicle-selection fault or justify escalating an assumed GSF-wide failure. After an approved sign-out and user-completed sign-in, the remote session still rejected BG18CJV and NK15VMX. The precise cause of that environment difference remains unknown. Further repeated cloud vehicle lookups are not the acceptance test for the Windows worker.

The checked source launches Microsoft Edge on the workshop Windows PC with its persistent `VectaGSF/EdgeProfile` (or the configured GSF profile). The remote browser used for these manual observations is a separate environment. The user's confirmation establishes that manual vehicle lookup works in the worker's browser; it does not by itself establish a complete automated part/fitment/labour quote. The outstanding acceptance check belongs in that working workshop environment.

A further live product-page inspection identified a reader defect independent of vehicle lookup. The rendered `Parts - 49 products found` label comprises five adjacent text nodes: `Parts - `, `49`, ` product`, `s`, ` found`. Serialised HTML hides those boundaries, whereas the reader's visible-text joining adds a space before the plural suffix. The section matcher now accepts that exact fragmented singular/plural form, retaining the current-query and bounded-section checks. A regression recreating the live text nodes failed before the correction (zero of two synonym products captured) and passes afterwards for both singular and plural results. All 50 focused catalogue/product/search/vehicle tests passed. No vehicle-selection behaviour or browser identity was altered.

The full local release gate passed with 2,010 regression passes, four skips and no failures, plus phone/cloud sync, finance integrity, production build and source/built dashboard-layout and pricing-dependency checks. This correction remains in the draft; no new checker package, installation, migration or production activation was issued.
