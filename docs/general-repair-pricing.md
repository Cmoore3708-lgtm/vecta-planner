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
