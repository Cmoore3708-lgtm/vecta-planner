# Customer car progress

## Registration access

Customers can open **Track my car** on the homepage, enter a registration and see a visual update for that car's bookings today (Europe/London). Public lookup returns only registration, stage, stage title and an allowlisted saved vehicle artwork URL. It never returns customer/contact details, job IDs, notes, descriptions, prices, invoices, signed tokens, dates or booking history. The date is chosen on the server, and exact normalised registration matching follows the bounded candidate query. Quotes, cancelled/deleted jobs, internal tasks and tax entries are excluded. Multiple eligible jobs are combined conservatively: readiness requires all of them to be ready. Completed jobs remain visible for the rest of that day.

The page uses lightweight workshop scenes with the existing saved car image where available. Artwork failure leaves the workshop/stage visible; it never initiates a Haynes lookup or generates new per-vehicle images. Final photography can still replace these scenes later. Public lookups are throttled per server instance (not a global rate-limit guarantee), responses are not cached, and the frontend polls once a minute only while visible. A missing today's booking shows a clear message rather than exposing previous or future work.

Private links and invoice access below remain separate, so previously sent links continue to work.

Customer tracking is available at `/track` using a signed private link. The link is issued by the authenticated workshop server, added to website booking confirmation drafts and the existing day-before reminder emails, and available from the job editor's **Customer tracking link** button. Registration alone never grants access. Links expire eight days after the booking date and stop working when the booking date, registration or customer email changes, or the job is cancelled/deleted.

## Existing controls

- The shared Main/mechanics job editor labels `work_required` **Job description — Readable by customer**, with an amber outline. Save changes normally: all tracking routes read the current saved description, and an open customer page replaces it on its next automatic refresh (once a minute), manual refresh, or return to the tab. Unsaved/offline changes appear after they have successfully synced. The description is independent of private notes and invoice wording; description edits do not require a new tracking link or a stage change.
- Opening today's saved job in the mechanics deployment marks a waiting booking `in_progress`, using a conditional update of only status and updated_at. Opening an owner card, an old/future booking, quote, task or tax record does not start work.
- Mechanics keep their existing **Complete** button and `work_complete` state. Customers see “Workshop work finished” and are asked to wait for final collection confirmation.
- The owner's Staff **Ready to invoice** action retains the normal invoice construction, pricing, VAT and confirmed cloud-save functions, then requests the invoice email. Customers see readiness, and can open the saved invoice from their tracking page.
- NMUK/contractors retain the existing completion and monthly invoicing routes. They see collection wording without individual payment wording or invoice access.
- Returning a job to the mechanic or resetting it removes readiness and the invoice button from the customer page on refresh.

Invoice emails use the configured Resend service, from `chris@vectamotors.co.uk`, with an invoice link and the existing BeePaid text. The existing send ledger reserves one delivery per saved invoice across repeated clicks and concurrent requests; uncertain delivery remains reserved instead of resending. Missing email/configuration and provider failures appear explicitly after the invoice is safely saved. Test deployments block real customer email delivery. No payment is created or marked paid.

## Structure and data

No new tables, public database permissions, realtime subscriptions, workers or generated car images. The customer endpoint returns a small allowlist of registration, model, booking date, current stage and status wording. It never returns contacts, work notes, part costs or other job records. Only a ready Staff job can expose its own active saved invoice.

`/api/job-progress` routes through the existing additional-work function. The standalone website proxies that API to the planner, while the shared page/CSS/JS are copied by the booking sync script. The token lives in the URL fragment rather than page-request logs. Public responses are not cached or indexed. Refresh is once a minute while visible, backs off on errors and stops while hidden. Stale updates are labelled and financial links are hidden when refreshing fails.

The page uses text stages until artwork is chosen. The reserved markup slot is independent of the stage logic.

## Release checks

Run the new progress regressions and full release gate. Before merging, check the deployed preview in Main and mechanics on desktop/phone/tablet, including private-link access, mechanic start/Complete, Ready to invoice, saved invoice totals, failure feedback, reopen, offline/reconnect, and confirmation/reminder link handling. Test deliberately does not email customers. After approved production release, move and verify both mechanics aliases per `DASHBOARD-LAYOUT-LOCK.md`. Production email delivery and sender verification require a controlled live check after release.
