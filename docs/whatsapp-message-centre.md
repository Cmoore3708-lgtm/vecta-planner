# WhatsApp Message Centre connection

The WhatsApp list is available before account connection. Prepared links are drafts, not evidence that a message was sent. The manager-only connection status distinguishes not configured, configured but waiting, and the date of the last saved callback.

## Account setup still required

Use a Meta-approved provider/Tech Provider's **WhatsApp Business app coexistence** onboarding for Vecta's existing number. Ordinary Cloud API migration is not a substitute: Chris needs to keep using his Business phone app. Confirm provider eligibility, any fees, and app feature changes with Chris before signing up. No provider subscription, credentials or customer messages are created by this release.

After onboarding, configure the callback on the receiving Meta app:

- URL: `https://vecta-planner.vercel.app/api/whatsapp-webhook`
- Subscriptions: `messages` and `smb_message_echoes`.
- Production server variables: `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (random secret chosen for verification).
- Keep secrets in Vercel, never in source/browser settings. Deploy after configuration.
- Test/Preview only reads `VECTA_TEST_WHATSAPP_*` variables and the isolated Test database; never copy production WhatsApp account credentials into them.

Verify with an authorised test contact: one inbound text, one outbound message from the Business phone app, then an edit/delete and a repeated callback. Check one entry per original message, correct wording/direction, and connection timestamp. Test manager sign-out and mechanics access remain denied. Do not call the connection active just because environment variables exist.

## Scope and limits

Signed callbacks are pinned to Vecta's account AND phone ID and saved before returning success. Retries are idempotent; storage failures ask Meta to retry. Edits and revocations update the displayed wording even if callbacks arrive out of order. Browser users cannot write sent/received records. No outbound messaging is added.

Text and captions are stored. Photos, documents, audio and other rich content display an explicit instruction to view the attachment in WhatsApp; media files are not downloaded. Private WhatsApp user identifiers are retained if no phone number is provided. Messages are shown by contact; no job or registration is guessed from a shared phone number.

This receiver handles new one-to-one messages. Group chats, historical import, attachment storage, delivery/read tracking and dashboard unread alerts are outside this release. Do not enable the `history` subscription or promise existing conversations have been imported. Prepared drafts remain labelled and are not automatically matched to app sends because their contents can be changed in WhatsApp.

Schema rollback: reverting the application leaves the additive event table and compatible history view in place. Do not delete captured messages. The old UI can still read the same history columns.

References: [Meta coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), [Meta webhook validation](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint).
