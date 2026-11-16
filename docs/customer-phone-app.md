# Vecta customer phone app

## What is implemented

- The post-booking app offer highlights the user-approved “Instant updates” headline, progress tracking, history downloads and saved-detail bookings. Its note explains that phone alerts need permission/internet and can take a few minutes.
- Installable customer PWA at `/app/home`, with the existing V icon and website red/black/charcoal/yellow palette. The workshop and mechanics service worker is unchanged.
- Passwordless email codes, hashed persistent sessions, My Garage and additional cars. One prominent vehicle card at a time; native horizontal swipe, keyboard arrows, buttons and position dots. Registration plate, vehicle artwork, due dates and actions stay bound to the same vehicle ID.
- Add/remove vehicles, nickname and optional insurance date. Removal affects the customer's garage only. Cached Vecta vehicle artwork is reused; an explicitly labelled illustration appears when no cached artwork exists. This does not launch a live Haynes worker request to find a new image.
- MOT/tax public information and advisories via the existing lookup adapter. Manual date overrides survive refresh. Annual service due defaults to 12 months after the latest available completed Vecta service, and is editable. No mileage-based service prediction is implied.
- Secure previous bookings and original invoice PDF renderer. Service sheets are regenerated as inert PDF tables from saved selections/text; these are copies of the saved paperwork, not screenshots of the original HTML. Documents need an authorised job ID and matching registration. An ambiguous or unlinked legacy record stays unavailable.
- A complete available-history PDF report combines verified Vecta bookings and cached public MOT advisories. Original paperwork remains separately downloadable. Oversized histories fail explicitly rather than silently exporting a partial report.
- MOT certificate downloads link to the official GOV.UK service; customers may need their V5C number. No DVSA certificate API is invented.
- New Booking selects a garage vehicle (automatically for a one-car garage) and embeds the existing website booking page, with its duplicate masthead/title hidden only inside the app. Same-origin parent/child hand-off pre-fills verified saved contact details. Only registration and `app=1` enter the URL. Prices, available dates and submission remain the existing website flow. The customer reviews details and confirms explicitly.
- Account-level optional push reminders at 30, 7, 1 and 0 days for MOT, tax, annual service and optional insurance, plus messages, work requests and ready-to-collect. SORN and an already-booked relevant job suppress applicable reminders. Retries retain unsent reminder state. No automatic start-work push.

## Five per cent loyalty bonus

The user replaced the proposed visit milestones with 5% of spend, displayed in a box at the bottom of the app. The previous wash/£10/£20 milestones and minimum £75 threshold are removed. Fully paid, completed personal Staff invoices earn 5% of their total including VAT; MOT-only invoices also count. Invoice IDs are counted once and each bonus is rounded to the nearest penny. Unpaid, partial, refunded, cancelled, draft, void, wrong-registration and fleet invoices are excluded. Ownership remains bound to the verified account's jobs.

Default assumption: earning starts when the app launches, without retroactive credit. On release, set the service-managed `workshop_settings` record `customer_loyalty_v1` to `{ "starts_on": "<actual UK launch date YYYY-MM-DD>" }`. Without a valid start date the box shows £0.00 and explains that earning begins at launch. Use the existing `invoice_paid_date` in invoice lines; never infer payment date from booking/invoice/update dates. Undated payments require a workshop check. History truncation fails explicitly instead of showing a partial total.

This is a read-only earned-bonus total with invoice-level history. It does not write invoices, send refunds, apply discounts or claim a spendable wallet balance. The interface explicitly says redemption is not enabled yet. A transactional earning/redemption ledger and booking/invoice integration are still required before customers can spend the bonus; do not activate redemption by simply relabelling this earned total.

## Storage and security

Apply migrations in order:
1. `20261115190658_customer_phone_app.sql`
2. `20261115192103_customer_garage_accounts.sql`

Both migrations have been applied to Test (`brqsejjykrubxuofavuu`) only. Main is unchanged. All six new tables have RLS enabled, no anon/authenticated table grants, and service-role access. Every private action revalidates the session and ownership server-side. Owning/adding a registration never proves ownership of previous invoices or service records. Explicit job email takes precedence over customer-ID fallback.

Email sign-in is disabled in Test/preview, as are push sending and scheduled live vehicle refreshes. Automated tests use isolated in-memory databases and PGlite. Local browser QA uses clearly labelled sample data and stubs every network operation; it does not send emails, create customer bookings or invoke supplier workers.

The existing `/api/job-progress` POST handler hosts the new actions. Existing `/api/progress-scenes` cron also services account notifications and small batches of public vehicle refreshes. A customer's garage session is held on their device; personal data and documents are not stored in the app service-worker cache. Sign-out clears local session and remembered booking links.

## Verification and release

Local regression, phone sync, financial integrity and build gates pass. Checks include challenge reuse/attempt limits, ownership separation, canonical sheet job binding, expired sessions, Test send isolation, reminder retries/deduplication, manual dates, reward qualification and the same-origin booking bridge. Dashboard layout locks remain unchanged.

Browser QA checked phone (390px) and tablet (768px) layouts, car switching, Add car, removal without workshop deletion, history/MOT details, reward progress and the actual embedded website flow through to pre-filled customer details. A real iPhone installation, cold start/reopen, offline/reconnect and lockscreen push delivery remain device checks; browser sizes are not claimed as physical-device testing.

Chris explicitly approved publishing this app source to the public `Cmoore3708-lgtm/vecta-planner` repository on 15 November 2026. Continue through the amendment PR, release gate and preview verification. The standalone website preview middleware blocks `/api/*` calls to Main; use the matching Workshop Pro preview for functional checks. Before production deployment apply both migrations to Main, then verify the website and planner deployments use the matching generated app assets. Physical-device checks and activation of the proposed rewards scheme remain separate from source publication.

## iPhone installation check — 16 November 2026

Chris supplied an iPhone Home Screen screenshot and a standalone My Garage welcome screen. This confirms installation and an initial launch; repeat reopening, offline/reconnection, signed-in features, iPad and notification delivery remain unverified. The installed icon showed a fallback white V instead of the red Vecta artwork. An unauthenticated GET of the preview apple-touch icon redirects to Vercel login (302), while the existing production versioned logo files return PNGs (200). Installation metadata now uses those public, versioned Vecta logo URLs for apple-touch-icon, favicon and manifest icons. Local icons remain for the in-app logo, offline shell and notification artwork. This avoids requiring preview cookies to fetch the installation logo; the corrected Home Screen icon still requires an iPhone reinstallation check.

## Header and wording — 16 November 2026

After confirming the updated installation worked, Chris requested removal of family references and supplied a Vecta header image. Both app screens now use that supplied header, including its NMUK line. Customer-facing wording uses cars throughout, with one Add car action and no family labels or reward wording. The header is included in the customer-only offline shell and the exact public asset allowlist. Existing vehicle records are retained.
