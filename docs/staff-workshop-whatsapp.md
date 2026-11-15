# Staff workshop arrival WhatsApp

Prepared for Chris's request on 10 November 2026. **Not active until the WhatsApp Business sender and approved image template are connected.** No customer messages have been sent during development.

## Customer message

Good news, your vehicle is now in the workshop. Keep an eye out for any updates.

Image header: the approved, saved illustration of that customer's car inside the workshop.
Button: **Track your car** (the private customer progress link).
Footer: **Vecta Motors · Workshop illustration**.

## Behaviour

- Only a Staff job moving from booked/arrived to in progress on its booking day creates a notification. NMUK and contractors are excluded both when queued and immediately before sending. Existing in-progress jobs are not backfilled.
- Each job sends once. Opening again, retrying, reopening or two mechanics opening together cannot send another copy.
- Requires the existing contact-specific WhatsApp permission or a matching website booking whose chosen contact method is WhatsApp. No automatic email fallback is added.
- Reuses the existing approved underway image. For an eligible opted-in Staff arrival without a saved image, requests preparation once through the existing budget-limited, quality-checked scene worker. This explicitly brings image preparation forward to job start for these customers; other progress images remain generated on customer demand.
- Image preparation may take several minutes. If no suitable image is ready, the message waits. It expires after two hours, on completion, deletion, a different booking day, changed customer details or loss of permission. It never substitutes another vehicle image.
- Scheduled retries run every five minutes. Definite WhatsApp rejections can retry; ambiguous network timeouts remain pending for manual investigation to avoid duplicate messages. Sent/failed/pending provider attempts appear in the existing Message Centre ledger with subject `REG — vehicle in the workshop`.
- Test/preview deployments and missing configuration perform no sends or image preparation. Delivery uses a service-only transactional outbox, with no browser access.

## Activation handover

1. Connect Vecta's chosen WhatsApp Business sender to the Meta Cloud API. Store secrets in hosting configuration, never in source or chat.
2. Submit and obtain approval for a utility template named `vecta_workshop_started`, language `en_GB`, IMAGE header, the exact static body above (no body parameters), footer above, and one dynamic URL button `Track your car`: `https://www.vectamotors.co.uk/track#{{1}}`. Use a non-customer image and synthetic URL token for the approval sample.
3. Configure production `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE_LANGUAGE=en_GB`, `WHATSAPP_WORKSHOP_STARTED_TEMPLATE=vecta_workshop_started`. The existing approval/portal templates have separate names and do not enable this notification.
4. Apply `20261110204836_staff_workshop_started_whatsapp.sql`, deploy the tested branch through the normal release gate, then set `WHATSAPP_WORKSHOP_STARTED_ENABLED=1` and redeploy after sender/template verification. Keep it unset until ready. Enable only for new arrivals; stale queued entries are discarded by the sender.
5. Perform one authorised test with the owner's number on a Staff test booking in the production flow; verify receipt, matching car image, tracking link and no resend on reopen. Do not test on real customers. Confirm the negative case with an NMUK booking without contacting its customer.

WhatsApp accepts JPEG/PNG images, so saved WebP scenes are converted to bounded JPEG media uploads before template delivery. No provider delivery has been claimed or verified without the sender connection.

Reference: Meta's [media template endpoint](https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media) and [image-header template creation](https://www.postman.com/meta/whatsapp-business-platform/request/n3jhmr4/create-template-w-image-header-text-body-text-footer-and-2-call-to-action-buttons); [supported image formats](https://docs.aws.amazon.com/social-messaging/latest/userguide/supported-media-types.html).
