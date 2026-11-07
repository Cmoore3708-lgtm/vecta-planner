# Saved tyre prices and idle catalogue building

Successful ESP relay results now persist in `tyre_price_catalogue`, independently of the two-day job queue. Each size retains its complete verified catalogue and original capture time. Empty results, failed searches and expired leases never overwrite a good snapshot. Existing retained successful queue results are imported during upgrade; no example prices are inserted.

The public route tries live prices first. Offline, login/settings problems, a busy worker, daily limits and timeouts fall back to the exact saved size. The website and Workshop tyre picker label these **Saved guide prices**, display the original check date and ask to confirm price and availability. Old stock quantities are never shown as live; previously stocked products can provide guides for quantities 1–4. NEVOS premium-only rules and exclusion of special tyres remain unchanged. Commercial tyres still use the separate confirmation route.

Saved snapshots remain stored permanently; those older than 90 days are not offered to customers. The customer response has a separate five-minute validity time. Encrypted supplier-cost receipts last 30 minutes from issue; saved costs are labelled estimated on the job's parts list. Trade costs remain private. Booking review and work notes retain the saved-price qualification.

## Background learning

The seed list contains 60 common passenger/SUV sizes, not every theoretical size combination. Every new customer size is registered automatically, even when the PC is offline. A successful search updates that size without extra supplier work. When the existing worker polls an idle queue, it can be given one ordinary read-only search; no new PC package or separate scheduled agent is needed.

Customer jobs are selected first. Background searches wait for a minute without customer demand, run at most once per ten minutes and at most 40 times per rolling 24 hours. Failed/missing sizes wait a day before another background attempt; successful sizes become due after seven days. Unpriced sizes are covered first, then customer popularity and seed priority. Login/settings problems or a background failure pause background work for an hour. A customer arriving during one background search can wait for that bounded search to finish; there is no unsafe pre-emption of the supplier browser. The 200/day customer allowance excludes background jobs.

The initial full sweep needs at least two days with the worker online long enough. No prices can be invented for sizes not yet successfully read. If no usable saved catalogue exists, the existing unpriced enquiry remains available.

## Deployment

1. Pass the release gate and the tyre worker tests on the amendment commit.
2. Apply `docs/sql/tyre-price-catalogue.sql` to **brqsejjykrubxuofavuu**, the existing ESP relay database. It is intentionally separate from the Main business-record database. The additive upgrade retains the old enqueue/poll/pull/complete contract. Applying it starts learning on the existing worker's next poll.
3. Deploy `supabase/functions/tyre-pc-relay/index.ts` and its current relative imports to the same project. Keep its existing `verify_jwt=false`: it authenticates hashed site/worker bearer tokens internally. This adds the site-only `cached` action.
4. Preview the main application and website changes, then merge following `RELEASE-SAFETY.md`.
5. Verify a known saved size through the public tyre endpoint while the PC is offline; confirm source/date, per-tyre totals and no stock promises. When the PC returns, verify a background completion updates the table.

Rollback: restore the previous application/edge versions and the original function body from `docs/sql/tyre-relay.sql` (function definition only). Retain the additive table/columns and captured prices. Restoring the old function stops background learning; it does not delete business records or require re-pairing the worker.

Read-only operational summary (no customer details or trade costs):

```sql
select count(*) as sizes_known,
 count(checked_at) as sizes_with_saved_prices,
 count(*) filter(where checked_at>now()-interval '90 days') as usable_sizes,
 min(checked_at) as oldest_price, max(checked_at) as newest_price
from public.tyre_price_catalogue;
```

`tests/regression/tyre-price-catalogue.test.mjs` runs the actual upgrade and RPC in isolated PostgreSQL (PGlite), verifies role isolation, backfill, learning, leases, queue precedence, throttling and failure preservation, then tests the public endpoint, UI and encrypted booking receipt path. It never calls a supplier, creates a real booking, or touches a live database.
