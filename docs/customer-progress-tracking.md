# Customer car progress

## Registration access

Customers can open **Track my car** on the homepage, enter a registration and see a visual update for that car's bookings today (Europe/London). Public lookup returns registration, vehicle, the saved customer-readable job description, stage, stage title, saved vehicle artwork and workshop photo metadata with short-lived image links. It never returns customer/contact details, job IDs, private notes, prices, invoices, tracking tokens, dates or booking history. The date is chosen on the server, and exact normalised registration matching follows the bounded candidate query. Quotes, cancelled/deleted jobs, internal tasks and tax entries are excluded. Multiple eligible jobs are combined conservatively: readiness requires all of them to be ready. Completed jobs remain visible for the rest of that day.

The page uses lightweight workshop scenes with the existing saved car image where available. Artwork failure leaves the workshop/stage visible; it never initiates a Haynes lookup or generates new per-vehicle images. Final photography can still replace these scenes later. Public lookups are throttled per server instance (not a global rate-limit guarantee), responses are not cached, and the frontend polls once a minute only while visible. A missing today's booking shows a clear message rather than exposing previous or future work.

Private links and invoice access below remain separate, so previously sent links continue to work.

Customer tracking is available at `/track` using a signed private link. The link is issued by the authenticated workshop server, added to website booking confirmation drafts and the existing day-before reminder emails, and available from the job editor's **Customer tracking link** button. Registration lookup shows today’s progress and workshop photos; invoice access requires the signed private link. Links expire eight days after the booking date and stop working when the booking date, registration or customer email changes, or the job is cancelled/deleted.

## Existing controls

- The shared Main/mechanics job editor labels `work_required` **Job description — Readable by customer**, with an amber outline. Save changes normally: all tracking routes read the current saved description, and an open customer page replaces it on its next automatic refresh (once a minute), manual refresh, or return to the tab. Unsaved/offline changes appear after they have successfully synced. The description is independent of private notes and invoice wording; description edits do not require a new tracking link or a stage change.
- Opening today's saved job in the mechanics deployment marks a waiting booking `in_progress`, using a conditional update of only status and updated_at. Opening an owner card, an old/future booking, quote, task or tax record does not start work.
- Mechanics can read the complete description, including line breaks and standard service wording, on natural-height dashboard cards without opening the job. The mechanics timeline is removed; mechanic groups, queue order, unallocated jobs, quotes, MOT appointments and cached vehicle artwork remain. Card bodies are read-only: only the explicit **Open job** button opens the editor and invokes the existing start behaviour. Main retains its timed planner.
- Mechanics keep their existing **Complete** button and `work_complete` state. Customers see “Workshop work finished” and are asked to wait for final collection confirmation.
- The owner's Staff **Ready to invoice** action retains the normal invoice construction, pricing, VAT and confirmed cloud-save functions, then requests the invoice email. Customers see readiness, and can open the saved invoice from their tracking page.
- NMUK/contractors retain the existing completion and monthly invoicing routes. They see collection wording without individual payment wording or invoice access.
- Returning a job to the mechanic or resetting it removes readiness and the invoice button from the customer page on refresh.

Invoice emails use the configured Resend service, from `chris@vectamotors.co.uk`, with an invoice link and the existing BeePaid text. The existing send ledger reserves one delivery per saved invoice across repeated clicks and concurrent requests; uncertain delivery remains reserved instead of resending. Missing email/configuration and provider failures appear explicitly after the invoice is safely saved. Test deployments block real customer email delivery. No payment is created or marked paid.

## Structure and data

Workshop photos use the private `job_workshop_photos` table and private `job-workshop-photos` Storage bucket. No public database permissions or realtime subscriptions are added. The customer endpoint returns a small allowlist of registration, model, booking date, current stage and status wording. It never returns contacts, work notes, part costs or other job records. Only a ready Staff job can expose its own active saved invoice.

`/api/job-progress` routes through the existing additional-work function. The standalone website proxies that API to the planner, while the shared page/CSS/JS are copied by the booking sync script. The token lives in the URL fragment rather than page-request logs. Public responses are not cached or indexed. Refresh is once a minute while visible, backs off on errors and stops while hidden. Stale updates are labelled and financial links are hidden when refreshing fails.

The page uses text stages until artwork is chosen. The reserved markup slot is independent of the stage logic.

## Release checks

Run the new progress regressions and full release gate. Before merging, check the deployed preview in Main and mechanics on desktop/phone/tablet, including private-link access, mechanic start/Complete, Ready to invoice, saved invoice totals, failure feedback, reopen, offline/reconnect, and confirmation/reminder link handling. Test deliberately does not email customers. After approved production release, move and verify both mechanics aliases per `DASHBOARD-LAYOUT-LOCK.md`. Production email delivery and sender verification require a controlled live check after release.

## Workshop inspection photos

The shared Main/mechanics job editor offers Take photo and Upload photos immediately below the customer-readable description. A saved, confirmed vehicle job is required. Selecting photos creates a local preview with an optional caption; **Upload to progress** saves and shares them immediately, independently of the job Save button. Captions can be edited and photos removed. New jobs ask the user to save/reopen first. Offline upload is explicit and unuploaded previews can be retried while the editor stays open.

Up to 12 active photos per job are enforced by unique numbered slots, including concurrent uploads. Browser resizing bounds uploads; server decoding re-encodes JPEGs to remove metadata and reject fake/oversized image payloads. Stable upload IDs and content hashes allow interrupted uploads to resume without duplicates or replacement bytes. Abandoned pending slots expire after 15 minutes. Files never enter job JSON or planner offline data.

Workshop authentication and same-origin checks protect list/upload/caption/remove actions. The server uses its service role for a table with RLS and no anon/authenticated grants, and a private bucket without public policies. Customer photos are tied to the job, normalised registration and customer email; reassignment cannot expose a previous customer’s photos. Signed image URLs last five minutes. Registration, booking-receipt and job-token tracking routes return matching published photos only. Staff removal hides metadata immediately; any previously issued image links expire within five minutes. Storage-only files are outside the existing JSON backup.

The customer gallery shows captions using text nodes, supports full-size viewing, refreshes once a minute, and retains already loaded images to avoid downloading them again on every poll. Photo-loading failures do not hide job progress. Changing registration or losing tracking access clears the gallery.

Migration `20261105214748_job_workshop_photos.sql` must be applied before production release. It has been applied to isolated Test (with content hash added in a second development migration); production is unchanged until release approval.

## Customer approval messages

On the mechanics dashboard, take or choose a photo, describe the finding and select **Send to Workshop Pro for pricing**. No customer message is sent at this stage. Draft photos stay private, including on older trackers, until the owner releases them.

Main shows **Workshop findings to price (N)** when there is work to review. Open a finding to see its photos and note, enter the **estimated total including VAT**, and select **Send estimate to customer**. The price and photos are released together. Only Main can publish estimates or retry customer notifications. The customer's private progress link displays the finding, photographs, exact estimate, and Approve/Decline controls. The decision returns to the same job. None of these actions adds an invoice line or changes an invoice total.

Email is sent automatically to the address saved on the job. With no Meta sender configured, Workshop Pro prepares WhatsApp for the authorised mobile number and opens it when the browser allows; the owner taps **Send** in WhatsApp. If the pop-up is blocked, **Open WhatsApp and tap Send** is available on the receipt and can be reopened from the job. A prepared WhatsApp message is never labelled sent. With a configured sender, both channels are dispatched independently. Email and WhatsApp use the same private link. Retrying an outstanding channel does not repeat an accepted email or WhatsApp API submission. Test never sends either channel or opens a real WhatsApp chat.

WhatsApp permission comes from the matching website booking's WhatsApp preference or an agreement recorded on the job. A replacement contact cannot use an old link. Public registration lookups cannot read a finding, price or decision. Apply the three migrations in order: `20261106062646_customer_progress_approvals.sql`, `20261106065751_whatsapp_approval_contact_guard.sql`, `20261106070818_workshop_review_estimates.sql`.

### Connect the WhatsApp sender

Use the Vecta WhatsApp Business Platform phone number in Meta WhatsApp Manager. Submit an English (UK) utility template, for example `vecta_workshop_approval`, with one body variable for the customer's first name:

> Hi {{1}}. There is a message relating to your car waiting for your approval. Click below to see it.

Add one **Visit website** button labelled **View message**. Its dynamic URL must be `https://www.vectamotors.co.uk/track#{{1}}`. The button parameter is the complete fragment after the hash; the email uses the same URL. Use synthetic values for the template review sample, never a customer link.

Once Meta approves the template, configure the planner project's Production server environment and redeploy:

| Variable | Value |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender's phone number ID from Meta |
| `WHATSAPP_ACCESS_TOKEN` | Server-only system-user token authorised to send with that number |
| `WHATSAPP_APPROVAL_TEMPLATE` | Approved template name |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Approved language, default `en_GB` |
| `WHATSAPP_GRAPH_VERSION` | Supported Graph API version, default `v23.0` |

Store the token as a sensitive server-side variable. A Meta acceptance receipt in the job card means the provider accepted the message; it does not confirm arrival on the handset. Use a controlled opt-in recipient to verify actual delivery after setup.
