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

The general GSF reader discovers an exact matching category link from the live
supplier search, selects the requested registration, requires all rendered
alternatives to be parsed, checks positional attributes, and refuses multiple
fitment groups. It follows an observed product link and checks SKU, price, stock
for the quantity and EX VAT basis again. The Haynes reader selects the same
registration, uses its actual type ID and repair-times link, and looks for a
single visible replacement operation containing the requested part and position.
No manually configured time, guessed price, category URL or manufacturer SKU is
substituted after a failed lookup.

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
2. Apply `20261111064559_catalogue_repair_pricing.sql` to isolated Test and run the
   queue round trip with the updated PC reader. It adds protocol 2; old readers
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
