# Garage MOT confirmations

Chris approved this feature on 22 October 2026. The MOT centre now sends only to
`mot@faliiloi.resend.app`, so preserve the copy to `chris@nissan-fleet.co.uk`.

## Receiving setup

The existing Resend integration is provisioned. No DNS/MX changes are needed.

1. Deploy the reviewed branch through the normal release gate and verify the
   `/api/mot-confirmations` route is present. A POST without the signing secret
   returns 503; an unsigned POST after configuration returns 401.
2. In Resend Webhooks, add the production endpoint:
   `https://vecta-planner.vercel.app/api/mot-confirmations`.
   Subscribe only to `email.received`.
3. Copy that webhook's signing secret directly into the project's production
   Vercel environment variable `RESEND_MOT_WEBHOOK_SECRET`. Do not paste secrets
   into chat, commit them, or expose them in browser code. Redeploy to load it.
4. The existing `RESEND_API_KEY` must permit retrieving received mail and sending
   copies. If its scope is sending-only, configure an appropriately scoped key
   through the provider and Vercel account. Existing Supabase service credentials
   are used only server-side with the repository's Test/production isolation.
5. Request one real garage confirmation. Verify receipt, a successful webhook,
   the corresponding `mot-email:<email UUID>` row in `workshop_settings`, a
   forwarded copy delivered to Chris, and the matching planner badge on Main
   and mechanics at desktop and phone sizes. Replay the webhook and confirm no
   second copy. Resend's receiving history retains the original.
6. Replay any confirmations received before activation from Resend's webhook
   tooling where available. This route does not scan historic emails by itself.

The Vercel connector currently hides the integration's API key and cannot manage
Resend webhooks. Account-side activation and an actual delivery test are pending;
unit tests are not evidence of a live connection. Mail must be checked in Resend
Receiving until end-to-end verification succeeds.

## Behaviour

- Verify the raw webhook signature with a five-minute replay window; retrieve
  the actual email from the authenticated provider API.
- Accept only the specified garage sender and receiving address. Require a
  passing aligned DKIM result and no DMARC failure for automatic processing.
  Missing/failed sender authentication creates a review record without green
  status or automatic forwarding. Check such originals in Resend Receiving.
- Recognise the supplied Fault Finder MOT IV confirmation template. Validate
  the weekday, calendar date, clock time, reference and registration.
- Store metadata separately in `workshop_settings`. Never create/complete jobs,
  overwrite planner times, or change invoices or fleet due dates.
- A unique matching MOT job gets a green badge and tick. Duplicated jobs,
  mismatched times and changed/cancelled references remain red with a warning.
  The newest email for a reference supersedes older confirmations even if
  webhook events arrive out of order. Unsupported templates without a usable
  reference remain in receiving history and have no automatic matching effect.
- Send a plain-text copy of authenticated garage mail, including unsupported
  templates, back to Chris. Store the successful send ID and use a stable
  provider idempotency key for concurrent/retried delivery. Temporary failures
  return non-2xx so Resend can retry; monitor failed deliveries in Resend.
- Dashboard refreshes the confirmation list once a minute while visible and
  online. Last-known records are cached locally for offline display; they cannot
  reveal a cancellation that has not yet synced.

## Release verification

`tests/regression/mot-confirmations.test.js` covers the real example, HTML,
invalid dates, signature tampering/replay, changes/cancellations, duplicated
jobs, sender authentication, forwarding retries and Main/mechanics badge output.
Only the two protected MOT badge renderers are intentionally recaptured in the
layout baseline. All existing styles, positioning and other renderers stay
locked. Move both manual mechanics aliases with the approved release as required
by `DASHBOARD-LAYOUT-LOCK.md`.

## Rollback

Disable this specific receiving webhook before rolling back the app. Chris must
then check Resend Receiving or restore the garage's original recipient. Do not
delete stored confirmation metadata or change the mailbox domain's MX records.
