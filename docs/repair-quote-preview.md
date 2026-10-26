# Alternator quote preview — 26 October 2026

The 2026-10-26.9 PC report verified automatic GSF registration/category navigation for FV65 JTY, expanded six priced alternatives, selected available DriveTec at £194.74 net (the cheaper Elstock and WAI options were out of stock), then independently opened Part Details and verified actual SKU A8828, stock, VAT reconciliation and photo. Haynes automatically selected type t_317000375 and operation 1E02944501WV0, Renew the alternator, at 0.70 hours.

This does **not** approve fitment or prove the entire compatible catalogue has been enumerated. The existing production evidence validation remains unchanged and rejects those unconfirmed results. The live queue is still disabled/unconfigured; the newly verified reader path has not replaced the generic catalogue completeness checks in lookupRepair.

## Reviewable Workshop Pro flow

The amendment/repair-quote-lookup Vercel preview and Main offer **Test captured FV65 JTY quote**. Existing Workshop Pro manager authentication is required. Chris explicitly requested testing on Main on 26 October after preview sign-in failed. Main manager access is permitted; mechanics and other branches cannot request the replay. Replay prices added to a quote carry a TEST REPLAY prefix. This does not enable live pricing.

1. Open New Quote. Enter FV65 JTY and Supply and fit alternator.
2. Click Test captured FV65 JTY quote. This replays the successful PC capture; it does not start either supplier or claim a fresh price.
3. Check the photo and horizontal prices: £194.74 cost, £244.21 sale, 0.70 source hours rounded to 1 charged hour, £50 labour, £353.05 including VAT.
4. Add part allows a further manual cost and any additional fitting time. For example a £20 part with 0.1 extra hours yields £30 sale plus £25 labour, increasing the grand total to £419.05 including VAT.
5. Add to quote, Save Quote, then reopen it. The private pricing snapshot retains every line, source timestamps and TEST REPLAY identity. It stores net prices with VAT applied once.

The editable test session lasts 15 minutes. Supplier evidence timestamps remain the original capture times; the session expiry is labelled separately. No replay enters the worker evidence queue.

Automated DOM integration tests cover these calculations, application, private-note persistence and reopening. A hosted database save and desktop/phone/iPad visual review remain required; automated DOM tests do not establish those checks.

## Before live use

- Prove complete category enumeration and vehicle fitment, then calibrate the actual production lookup against those checks.
- Connect the queue and shared PC worker in the isolated preview and test a fresh request end to end.
- Complete the repository's release and device checks, then obtain Chris's approval of the tested preview before merging.
