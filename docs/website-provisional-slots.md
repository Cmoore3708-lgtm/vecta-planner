# Website provisional reservations

New website requests atomically create a grey provisional job in Alfie's next available one-hour slot. The request remains awaiting review. The database date lock rejects simultaneous attempts at the same slot; retries do not create extra jobs. Availability counts a linked planner job only once. Confirming retains the job ID, while cancellation from either the planner or inbox releases its capacity. Customer confirmation and tracking wording identify the pending review.

Existing bookings are not converted. One hour is a holding allowance; the owner must adjust longer jobs during review. Existing online capacity ceilings, closures, notice periods, time off and Friday finish are retained. Existing legacy pending requests retain their original reserved duration.

Customer notes, contact details, mileage, MOT due date and saved parts costs transfer into the provisional card. Photos remain separately protected and linked by request ID. Photo submissions now retain their parts snapshot too. The existing provisional controls, grey styling, mechanics restrictions, finance exclusions and Fleet due-date behaviour are reused.

Validation on 5 November 2026:

- All 1,504 regression tests, phone/cloud sync integrity, finance integrity, production build and locked Main/mechanics desktop/phone layout checks passed. Local gate used NODE_OPTIONS=--max-old-space-size=384 to limit test-process memory; the unrelated Haynes lookup file also passed individually.
- PostgreSQL lifecycle assertions passed locally and against isolated Supabase Test, inside rolled-back transactions: creation, one-hour capacity, no double count, retries, contact, moves, confirmation, cancellation, legacy history preservation, day limits, photos, parts, and rollback on invalid photos.
- Two real concurrent Test database sessions requested the same 08:00 slot. Exactly one inserted; the other received VECTA_BOOKING_UNAVAILABLE. The synthetic request and job were removed and absence verified.
- Test migration version 20261105215220 is installed. Production migration has not been applied.
- Security advisors were checked; no findings name the new trigger functions. They use invoker rights, empty search paths, explicit tables, and no public/anonymous callable execution.

Release remains subject to RELEASE-SAFETY.md: hosted preview verification and approval before Main. Deploy application and database together; the previous app's inbox editor does not understand a saved provisional hold. After Main, update both manual mechanics aliases and verify both website and Workshop deployment commits. Keep the migration filename aligned with installed history. Do not re-run the migration on Test.
