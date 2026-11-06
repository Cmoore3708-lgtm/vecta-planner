# NMUK launch readiness

This change is prepared for the employee email campaign in the week commencing 9 November 2026. Main remains unchanged until the tested preview is approved under RELEASE-SAFETY.md.

## Resulting behaviour

- Service-price limits identify a signed browser cookie instead of a shared IP address. Employees sharing NMUK Wi-Fi no longer share the 15-lookups/hour allowance. The global 24-hour budget is configurable, initially 500, with a three-job queue and one supplier browser still enforced. This is a workload ceiling, not a throughput promise.
- Busy, offline or unavailable live prices fall back to the existing guide-price route with clearer wording. Existing supplier/PC workers need no update.
- Website Bookings keeps its familiar screen and job cards. Active requests are sorted oldest first. No added search field, waiting-time counters, price/hour/parts summary bands, preparation panels or service-status bars.
- Each new website request copies its retail price to its grey one-hour provisional job when created. Accepting or retrying uses that same job and preserves price edits. Legacy requests without a linked job still carry their retail total into the unsaved draft when opened. Existing guide-price wording remains in the supplied work details. Staff VAT defaults remain inclusive, with MOT-only drafts using no VAT. Chris must still accept each request. Closing the editor creates no job.
- Authenticated diagnostic endpoints retain supplier/queue and email-delivery status for support checks. They add nothing to the workshop screen and expose no public trade costs or customer email records.
- New website submissions atomically queue a confirmation of the booked appointment containing the reference, appointment date, work, retail total, workshop/key-drop instructions and private tracking link. Existing bookings are not emailed retrospectively. The original acceptance email workflow remains available for changed/final details.
- Push notifications and email delivery cannot hold up or invalidate a saved booking. Email payloads freeze before delivery; retries use the same provider idempotency key, stop before its 24-hour expiry, and flag uncertain delivery for review. Previews and Test cannot send these emails.

## Verification

- Full local release gate passed: regression suite, phone-sync integrity, finance integrity, production build and unchanged dashboard layout baseline.
- Test database: 20 concurrent submissions to the same empty six-hour day admitted exactly six one-hour reservations with distinct times; 14 were rejected. This earlier run preceded the provisional-job release. Current lifecycle tests cover one linked grey job and one receipt per new request, price and VAT transfer, and confirmation using that same job.
- 100 distinct synthetic pricing requests admitted three, returned BUSY for 97 and allowed one worker lease. Working/dead worker recovery was checked.
- Ten concurrent email claims admitted exactly one. Frozen payloads, wrong-lease rejection, retry expiry and private access were verified. The standalone SQL test rolls back all its fixture writes.
- Node tests cover distinct browser identities behind one IP, tampered/expired cookies, manager-only health, automatic retail-price/VAT import, receipt content, preview sending guard and lost-response retries.
- No supplier lookups or real emails were triggered by these tests. Real GSF session health and actual email deliverability still require a production check after release. Device-specific preview verification must be recorded before merge; automated tests do not replace Chris's iPhone or mechanics' iPad.

## Release and recovery

1. Keep the amendment in its PR until the GitHub VECTA Release Gate passes and Chris approves the tested preview.
2. Isolated Test (`brqsejjykrubxuofavuu`) has both the receipt/queue migration and `20261106062953_provisional_website_price.sql`. For an approved production release, verify the target and migration history, including the existing provisional-slot migration, then apply the missing launch and price migrations in dependency order. The price change applies when new holds are created.
3. Verify existing RESEND_API_KEY and CRON_SECRET configuration without exposing their values. The new five-minute cron route is `/api/booking-receipts`. A saved booking will still succeed if either service is unavailable; its email remains queued for review.
4. Release application code, verify the booking form and authenticated diagnostic endpoints, then check the next real customer's saved booking and receipt status. Do not create a live test customer or send test messages without explicit instructions.
5. If rollback is required, restore the prior approved deployment. The additive receipt table is backward-compatible. Revert the migration's queue function to its previous definition if needed; retain the outbox for reconciliation and never bulk-resend uncertain deliveries. Coordinate any queued mail before re-enabling delivery.

## Operating the launch

Keep the supplier PC awake and logged in before NMUK sends the email. Check required parts and MOT arrangements through the existing job cards before leaving. Retain the existing online hours and manual acceptance. Ask NMUK for a daytime send or staggered groups if practical, and use one booking link in the email. When capacity fills, direct callers to the next available day; extra reservations do not create mechanic hours.
